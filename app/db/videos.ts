import { createClient } from "@supabase/supabase-js";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface Video {
  id: string;
  mux_asset_id: string;
  title: string;
  description: string;
  transcript_en_text?: string;
  transcript_en_vtt?: string;
  playback_id?: string;
}

export interface VideoChunk {
  chunk_id: string;
  video_id: string;
  mux_asset_id: string;
  playback_id: string;
  title: string;
  description: string;
  chunk_text: string;
  start_time: number;
  end_time: number;
  similarity?: number;
}

export async function getVideos(limit: number = 10): Promise<Video[]> {
  const { data, error } = await supabase
    .from("videos")
    .select(
      "id, mux_asset_id, title, description, transcript_en_text, transcript_en_vtt, playback_id",
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
  const { data, error } = await supabase.rpc("match_video_chunks", {
    query_embedding: embedding,
    similarity_threshold: -1, // No threshold - get all results
    match_count: limit,
  });

  console.log("chunk search data", data);

  if (error) {
    console.error("Error searching video chunks:", error);
    throw error;
  }

  return data || [];
}

// Keep the old function for backwards compatibility, but make it use chunks
export async function searchVideos(
  query: string,
  limit: number = 10,
): Promise<VideoChunk[]> {
  return searchVideoChunks(query, limit);
}
