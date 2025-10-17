import { openai } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { embed, generateObject } from "ai";
import { z } from "zod";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseMux = createClient(supabaseUrl, supabaseKey, {
  db: { schema: "mux" },
});

export interface VideoChapter {
  start: string; // Format: "HH:MM:SS"
  title: string;
}

export interface Video {
  id: string;
  mux_asset_id: string;
  title: string;
  description: string;
  transcript_en_text?: string;
  transcript_en_vtt?: string;
  topics?: string[];
  chapters?: VideoChapter[];
}

export interface VideoChunk {
  chunk_id: string;
  video_id: string;
  mux_asset_id: string;
  chunk_text: string;
  visual_description: string;
  parent_video_topics: string[];
  similarity_score: number;
  // Enriched data from separate queries
  playback_id?: string;
  title?: string;
  description?: string;
  start_time?: number;
  end_time?: number;
}

export interface ClipResult {
  start_time_seconds: number;
  end_time_seconds: number;
  snippet: string;
}

export interface VideoSearchResult {
  video: {
    id: string;
    mux_asset_id: string;
    title: string;
    description: string;
    playback_id: string;
    topics: string[];
    chapters?: VideoChapter[];
  };
  clips: ClipResult[];
}

export async function getVideos(limit: number = 10): Promise<Video[]> {
  const { data, error } = await supabase
    .from("videos")
    .select(
      "id, mux_asset_id, title, description, transcript_en_text, transcript_en_vtt, topics, chapters",
    )
    .limit(limit);

  if (error) {
    console.error("Error fetching videos:", error);
    throw error;
  }

  return data || [];
}

export async function searchVideoChunks(
  query: string,
  limit: number = 10,
): Promise<VideoChunk[]> {
  if (!query.trim()) {
    return [];
  }

  // Generate embedding for the search query using the same model as sync script
  const { embedding } = await embed({
    model: openai.textEmbeddingModel("text-embedding-3-small"),
    value: query,
  });

  // Perform vector similarity search on video chunks - no threshold
  const { data: chunks, error } = await supabase.rpc("match_video_chunks", {
    query_embedding: embedding,
    similarity_threshold: -1, // No threshold - get all results
    match_count: limit,
  });

  if (error) {
    console.error("Error searching video chunks:", error);
    throw error;
  }

  if (!chunks || chunks.length === 0) {
    return [];
  }

  // Get unique mux_asset_ids and video_ids
  const uniqueAssetIds = [
    ...new Set(chunks.map((c: any) => c.mux_asset_id as string)),
  ];
  const uniqueVideoIds = [
    ...new Set(chunks.map((c: any) => c.video_id as string)),
  ];

  // Fetch playback_ids from mux.assets
  const { data: assets, error: assetsError } = await supabaseMux
    .from("assets")
    .select("id, playback_ids")
    .in("id", uniqueAssetIds);

  if (assetsError) {
    console.error("Error fetching mux assets:", assetsError);
  }

  // Fetch video metadata (title, description) and chunk metadata (start_time, end_time)
  const { data: videos, error: videosError } = await supabase
    .from("videos")
    .select("id, title, description")
    .in("id", uniqueVideoIds);

  if (videosError) {
    console.error("Error fetching videos:", videosError);
  }

  const { data: chunkDetails, error: chunksError } = await supabase
    .from("video_chunks")
    .select("id, start_time, end_time")
    .in(
      "id",
      chunks.map((c: any) => c.chunk_id as string),
    );

  if (chunksError) {
    console.error("Error fetching chunk details:", chunksError);
  }

  // Create lookup maps
  const assetMap = new Map(
    assets?.map((a) => [a.id, a.playback_ids?.[0]?.id]) || [],
  );
  const videoMap = new Map(videos?.map((v) => [v.id, v]) || []);
  const chunkMap = new Map(chunkDetails?.map((c) => [c.id, c]) || []);

  // Enrich the chunks with additional data
  const enrichedChunks: VideoChunk[] = chunks.map((chunk: any) => {
    const video = videoMap.get(chunk.video_id);
    const chunkDetail = chunkMap.get(chunk.chunk_id);
    const playbackId = assetMap.get(chunk.mux_asset_id);

    return {
      ...chunk,
      playback_id: playbackId,
      title: video?.title,
      description: video?.description,
      start_time: chunkDetail?.start_time,
      end_time: chunkDetail?.end_time,
    };
  });

  return enrichedChunks;
}

// Keep the old function for backwards compatibility, but make it use chunks
export async function searchVideos(
  query: string,
  limit: number = 10,
): Promise<VideoChunk[]> {
  return searchVideoChunks(query, limit);
}

export async function searchVideosWithReranking(
  query: string,
): Promise<VideoSearchResult[]> {
  if (!query.trim()) {
    return [];
  }

  // Step 1: RETRIEVAL - Get top 50 chunks using vector search
  const { embedding } = await embed({
    model: openai.textEmbeddingModel("text-embedding-3-small"),
    value: query,
  });

  const { data: chunks, error } = await supabase.rpc("match_video_chunks", {
    query_embedding: embedding,
    similarity_threshold: -1,
    match_count: 150,
  });

  if (error) {
    console.error("Error searching video chunks:", error);
    throw error;
  }

  if (!chunks || chunks.length === 0) {
    console.log(`[Retrieval] No chunks found for query: "${query}"`);
    return [];
  }

  // Get unique video_ids and mux_asset_ids
  const uniqueVideoIds = [
    ...new Set(chunks.map((c: any) => c.video_id as string)),
  ];
  const uniqueAssetIds = [
    ...new Set(chunks.map((c: any) => c.mux_asset_id as string)),
  ];

  console.log(
    `[Retrieval] Retrieved ${chunks.length} chunks from ${uniqueVideoIds.length} videos`,
  );

  // Fetch video metadata and playback_ids
  const [
    { data: videos, error: videosError },
    { data: assets, error: assetsError },
    { data: chunkDetails, error: chunksError },
  ] = await Promise.all([
    supabase
      .from("videos")
      .select("id, mux_asset_id, title, description, topics, chapters")
      .in("id", uniqueVideoIds),
    supabaseMux
      .from("assets")
      .select("id, playback_ids")
      .in("id", uniqueAssetIds),
    supabase
      .from("video_chunks")
      .select("id, start_time, end_time")
      .in(
        "id",
        chunks.map((c: any) => c.chunk_id as string),
      ),
  ]);

  if (videosError) {
    console.error("Error fetching videos:", videosError);
  }
  if (assetsError) {
    console.error("Error fetching assets:", assetsError);
  }
  if (chunksError) {
    console.error("Error fetching chunk details:", chunksError);
  }

  // Create lookup maps
  const videoMap = new Map(videos?.map((v) => [v.id, v]) || []);
  const assetMap = new Map(
    assets?.map((a) => [a.id, a.playback_ids?.[0]?.id]) || [],
  );
  const chunkMap = new Map(chunkDetails?.map((c) => [c.id, c]) || []);

  // Step 2: Group chunks by video_id and prepare dataset for GPT
  const videoChunksMap = new Map<string, typeof chunks>();
  for (const chunk of chunks) {
    if (!videoChunksMap.has(chunk.video_id)) {
      videoChunksMap.set(chunk.video_id, []);
    }
    videoChunksMap.get(chunk.video_id)?.push(chunk);
  }

  // Build the retrieval dataset for GPT
  const retrievalDataset = Array.from(videoChunksMap.entries()).map(
    ([videoId, videoChunks]) => {
      const video = videoMap.get(videoId);
      return {
        video: {
          id: videoId,
          title: video?.title || "",
          description: video?.description || "",
          chapters: video?.chapters || [],
          chunks: videoChunks.map((chunk: any) => {
            const chunkDetail = chunkMap.get(chunk.chunk_id);
            return {
              chunk_text: chunk.chunk_text,
              visual_description: chunk.visual_description || "",
              start_time: chunkDetail?.start_time || 0,
              end_time: chunkDetail?.end_time || 0,
            };
          }),
        },
      };
    },
  );

  // Step 3: Use GPT-5 to rerank and extract relevant clips
  const rerankingSchema = z.object({
    results: z.array(
      z.object({
        video_id: z.string().describe("The ID of the video"),
        clips: z
          .array(
            z.object({
              start_time_seconds: z
                .number()
                .describe("Start time of the clip in seconds"),
              end_time_seconds: z
                .number()
                .describe("End time of the clip in seconds"),
              snippet: z
                .string()
                .describe(
                  "A brief explanation of why this clip is relevant to the query",
                ),
            }),
          )
          .max(3)
          .describe("Up to 3 most relevant clips from this video"),
      }),
    ),
  });

  const prompt = `You are a search relevance expert. Given a user's query and a list of videos with their chunks, you need to:

1. Analyze which videos are most relevant to the query
2. For each relevant video, identify up to 3 specific clips (time ranges) that best answer the query
3. Filter out videos that are not relevant to the query
4. Sort the results by relevance (most relevant first)

User Query: "${query}"

Videos and Chunks:
${JSON.stringify(retrievalDataset, null, 2)}

Instructions:
- Only include videos that are actually relevant to the query
- For each video, return up to 3 clips with their time ranges
- Each clip should have a snippet explaining why it's relevant
- Sort videos by relevance (most relevant first)
- At a minimum you should always include at least 3 videos that each have 1 clip`;

  console.log(
    `[Reranking] Sending ${retrievalDataset.length} videos to GPT-5 for reranking...`,
  );

  const { object } = await generateObject({
    model: openai("gpt-5-mini"),
    schema: rerankingSchema,
    prompt,
  });

  console.log(`[Reranking] GPT-5 returned ${object.results.length} videos`);

  // Log details about clips per video
  const clipCounts = object.results.map((r) => r.clips.length);
  const totalClips = clipCounts.reduce((sum, count) => sum + count, 0);
  console.log(`[Reranking] Total clips across all videos: ${totalClips}`);
  console.log(`[Reranking] Clips per video: [${clipCounts.join(", ")}]`);

  // Step 4: Transform GPT results into VideoSearchResult format
  const results: VideoSearchResult[] = object.results
    .map((result) => {
      const video = videoMap.get(result.video_id);
      const playbackId = video ? assetMap.get(video.mux_asset_id) : undefined;

      if (!video || !playbackId) {
        return null;
      }

      return {
        video: {
          id: video.id,
          mux_asset_id: video.mux_asset_id,
          title: video.title || "",
          description: video.description || "",
          playback_id: playbackId,
          topics: video.topics || [],
          chapters: video.chapters,
        },
        clips: result.clips,
      };
    })
    .filter((r) => r !== null) as VideoSearchResult[];

  console.log(
    `[Final] Returning ${results.length} videos with clips to the UI`,
  );

  return results;
}
