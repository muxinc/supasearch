"use server";

import { getVideoById } from "../db/videos";
import type { VideoSearchResult } from "../db/videos";

export async function fetchVideoById(videoId: string): Promise<VideoSearchResult | null> {
  return getVideoById(videoId);
}
