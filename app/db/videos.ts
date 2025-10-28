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
  relevance: "exact" | "related";
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

export async function getVideoById(videoId: string): Promise<VideoSearchResult | null> {
  const { data: video, error } = await supabase
    .from("videos")
    .select("id, mux_asset_id, title, description, playback_id, topics, chapters")
    .eq("id", videoId)
    .single();

  if (error || !video) {
    console.error("Error fetching video:", error);
    return null;
  }

  return {
    video: {
      id: video.id,
      mux_asset_id: video.mux_asset_id,
      title: video.title,
      description: video.description,
      playback_id: video.playback_id,
      topics: video.topics || [],
      chapters: video.chapters,
    },
    clips: [], // No clips when loading directly
  };
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
