import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface Video {
  id: string;
  mux_asset_id: string;
  title: string;
  description: string;
  transcript_en?: string;
  embedding?: number[];
}

export async function getVideos(limit: number = 10): Promise<Video[]> {
  const { data, error } = await supabase
    .from('videos')
    .select('id, mux_asset_id, title, description, transcript_en')
    .limit(limit);

  if (error) {
    console.error('Error fetching videos:', error);
    throw error;
  }

  return data || [];
}

export async function searchVideos(query: string, limit: number = 10): Promise<Video[]> {
  if (!query.trim()) {
    return []
  }

  const { data, error } = await supabase
    .from('videos')
    .select('id, mux_asset_id, title, description, transcript_en')
    .or(`title.ilike.%${query}%,description.ilike.%${query}%,transcript_en.ilike.%${query}%`)
    .limit(limit);

  if (error) {
    console.error('Error searching videos:', error);
    throw error;
  }

  return data || [];
}
