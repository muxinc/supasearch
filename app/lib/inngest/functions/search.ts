import { openai } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { embed, generateObject } from "ai";
import { z } from "zod";
import type { VideoChapter, VideoSearchResult } from "@/app/db/videos";
import { jobStore } from "@/app/lib/jobStore";
import { inngest } from "../client";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const searchVideoJob = inngest.createFunction(
  {
    id: "search-videos-with-reranking",
    name: "Search Videos with Reranking",
  },
  { event: "search/videos.requested" },
  async ({ event, step }) => {
    const { query } = event.data;
    const jobId = event.id; // Use Inngest's event ID

    // Initialize job status
    jobStore.set(jobId, {
      status: "processing",
      progress: { step: 0, totalSteps: 3, currentStep: "Starting..." },
    });

    // Step 1: Create embedding of user's query
    const embedding = await step.run("create-embedding", async () => {
      jobStore.updateProgress(jobId, {
        step: 1,
        totalSteps: 3,
        currentStep: "Creating embedding",
      });

      console.log(`[Step 1] Creating embedding for query: "${query}"`);

      const { embedding: queryEmbedding } = await embed({
        model: openai.textEmbeddingModel("text-embedding-3-small"),
        value: query,
      });

      console.log(`[Step 1] Embedding created successfully`);
      return queryEmbedding;
    });

    // Step 2: Run retrieval query
    const retrievalResults = await step.run("run-retrieval-query", async () => {
      jobStore.updateProgress(jobId, {
        step: 2,
        totalSteps: 3,
        currentStep: "Searching video database",
      });

      console.log(`[Step 2] Running retrieval query...`);

      const supabase = createClient(supabaseUrl, supabaseKey);
      const supabaseMux = createClient(supabaseUrl, supabaseKey, {
        db: { schema: "mux" },
      });

      const { data: chunks, error } = await supabase.rpc("match_video_chunks", {
        query_embedding: embedding,
        similarity_threshold: -1,
        match_count: 150,
      });

      if (error) {
        console.error("[Step 2] Error searching video chunks:", error);
        throw error;
      }

      if (!chunks || chunks.length === 0) {
        console.log(`[Step 2] No chunks found for query: "${query}"`);
        return {
          chunks: [],
          videoMap: new Map(),
          assetMap: new Map(),
          chunkMap: new Map(),
        };
      }

      const uniqueVideoIds = [
        ...new Set(chunks.map((c: any) => c.video_id as string)),
      ];
      const uniqueAssetIds = [
        ...new Set(chunks.map((c: any) => c.mux_asset_id as string)),
      ];

      console.log(
        `[Step 2] Retrieved ${chunks.length} chunks from ${uniqueVideoIds.length} videos`,
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
        console.error("[Step 2] Error fetching videos:", videosError);
      }
      if (assetsError) {
        console.error("[Step 2] Error fetching assets:", assetsError);
      }
      if (chunksError) {
        console.error("[Step 2] Error fetching chunk details:", chunksError);
      }

      // Create lookup maps and return them as serializable objects
      const videoMap = new Map(videos?.map((v) => [v.id, v]) || []);
      const assetMap = new Map(
        assets?.map((a) => [a.id, a.playback_ids?.[0]?.id]) || [],
      );
      const chunkMap = new Map(chunkDetails?.map((c) => [c.id, c]) || []);

      console.log(`[Step 2] Retrieval complete`);

      return {
        chunks,
        videoMap: Object.fromEntries(videoMap),
        assetMap: Object.fromEntries(assetMap),
        chunkMap: Object.fromEntries(chunkMap),
      };
    });

    // Step 3: Re-rank results using GPT
    const finalResults = await step.run("rerank-results", async () => {
      jobStore.updateProgress(jobId, {
        step: 3,
        totalSteps: 3,
        currentStep: "Re-ranking with AI",
      });

      console.log(`[Step 3] Re-ranking results with GPT-5...`);

      const { chunks, videoMap, assetMap, chunkMap } = retrievalResults;

      if (chunks.length === 0) {
        console.log(`[Step 3] No chunks to rerank`);
        return [];
      }

      // Group chunks by video_id
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
          const video = videoMap[videoId];
          return {
            video: {
              id: videoId,
              title: video?.title || "",
              description: video?.description || "",
              chapters: video?.chapters || [],
              chunks: videoChunks.map((chunk: any) => {
                const chunkDetail = chunkMap[chunk.chunk_id];
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

      // Use GPT-5 to rerank and extract relevant clips
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
        `[Step 3] Sending ${retrievalDataset.length} videos to GPT-5 for reranking...`,
      );

      const { object } = await generateObject({
        model: openai("gpt-5-mini"),
        schema: rerankingSchema,
        prompt,
      });

      console.log(`[Step 3] GPT-5 returned ${object.results.length} videos`);

      // Log details about clips per video
      const clipCounts = object.results.map((r) => r.clips.length);
      const totalClips = clipCounts.reduce((sum, count) => sum + count, 0);
      console.log(`[Step 3] Total clips across all videos: ${totalClips}`);
      console.log(`[Step 3] Clips per video: [${clipCounts.join(", ")}]`);

      // Transform GPT results into VideoSearchResult format
      const results: VideoSearchResult[] = object.results
        .map((result) => {
          const video = videoMap[result.video_id];
          const playbackId = video ? assetMap[video.mux_asset_id] : undefined;

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
              chapters: video.chapters as VideoChapter[] | undefined,
            },
            clips: result.clips,
          };
        })
        .filter((r) => r !== null) as VideoSearchResult[];

      console.log(`[Step 3] Returning ${results.length} videos with clips`);

      return results;
    });

    // Store final results in job store
    console.log(
      `[Job Store] Storing results for jobId: ${jobId}, results count: ${finalResults.length}`,
    );
    jobStore.set(jobId, {
      status: "completed",
      results: finalResults,
    });
    console.log(`[Job Store] Results stored successfully`);

    return {
      jobId,
      query,
      results: finalResults,
      completedAt: new Date().toISOString(),
    };
  },
);
