import { openai } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { generateObject } from "ai";
import { z } from "zod";
import type { VideoChapter, VideoSearchResult, ClipResult } from "@/app/db/videos";
import { searchVideoChunks } from "@/app/db/videos";
import { inngest } from "../client";
import { searchJobChannel } from "../channels";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Schema for per-video clip extraction
const clipExtractionSchema = z.object({
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
        relevance: z
          .enum(["exact", "related"])
          .describe(
            "exact: directly addresses the query topic | related: conceptually related but not a direct match",
          ),
      }),
    )
    .min(1)
    .max(3)
    .describe("1-3 most relevant clips from this video. MUST return at least one clip."),
});

// Function to extract clips from a single video and publish results via realtime
export const extractClipsFromVideo = inngest.createFunction(
  {
    id: "extract-clips-from-video",
    name: "Extract Clips from Video",
  },
  { event: "search/video.extract-clips" },
  async ({ event, publish }) => {
    const { searchId, videoId, query, videoMetadata } = event.data;

    console.log(`[Extract Clips] Starting extraction for video ${videoId} in search ${searchId}`);

    try {
      // Check if we have VTT transcript
      if (!videoMetadata?.transcript_en_vtt) {
        console.log(`[Extract Clips] No VTT transcript found for video ${videoId}`);
        await publish(
          searchJobChannel(searchId).clips({
            videoId,
            clips: [],
          })
        );
        return { videoId, clips: [] };
      }

      const vttLength = videoMetadata.transcript_en_vtt.length;
      console.log(`[Extract Clips] Processing video ${videoId} with VTT length: ${vttLength} characters`);

      const prompt = `You are a clip extraction expert. This video was returned by semantic embedding search, meaning it's already been determined to be relevant to the user's query. Your job is to find the best moments that explain WHY this video matches.

User Query: "${query}"

Video: "${videoMetadata.title || "Untitled"}"
Description: "${videoMetadata.description || ""}"
${videoMetadata?.chapters ? `Chapters: ${JSON.stringify(videoMetadata.chapters)}` : ""}

VTT Transcript:
${videoMetadata.transcript_en_vtt}

CRITICAL INSTRUCTIONS:
- You MUST return at least 1 clip, and up to 3 clips maximum
- Since this video was matched by embedding search, there IS a semantic connection - find it!
- Mark clips as "exact" if they directly address the query topic
- Mark clips as "related" if they discuss conceptually related topics (e.g., query is "smell" but video discusses other human senses like vision/hearing)
- Each clip should be 30-60 seconds long and capture complete thoughts/sentences
- Use the VTT timestamps to determine start_time_seconds and end_time_seconds
- In the snippet, explain the connection between the clip and the query:
  - For "exact" matches: Explain how it directly addresses the query
  - For "related" matches: Explain the conceptual connection (e.g., "Discusses human vision and hearing, which are related senses to smell")

THINK SEMANTICALLY: If the query is about "smell", consider:
- Direct mentions of smell, scent, olfactory
- Related senses (taste, touch, hearing, vision)
- Sensory perception in general
- Human experience and consciousness
- Scientific discussions of perception

The embedding search found this video relevant - trust that judgment and find the best moment that shows the connection.`;

      const startTime = Date.now();
      const { object } = await generateObject({
        model: openai("gpt-5-nano"),
        schema: clipExtractionSchema,
        prompt,
      });
      const duration = Date.now() - startTime;

      console.log(`[Extract Clips] Video ${videoId} processed in ${duration}ms, found ${object.clips.length} clips`);

      // Publish clips via realtime
      await publish(
        searchJobChannel(searchId).clips({
          videoId,
          clips: object.clips,
        })
      );

      return { videoId, clips: object.clips };
    } catch (error) {
      console.error(`[Extract Clips] Error extracting clips for video ${videoId}:`, error);

      // Publish error via realtime
      await publish(
        searchJobChannel(searchId).error({
          videoId,
          message: error instanceof Error ? error.message : "Unknown error",
        })
      );

      return { videoId, clips: [] };
    }
  }
);

export const searchVideoJob = inngest.createFunction(
  {
    id: "search-videos-with-reranking",
    name: "Search Videos with Reranking",
  },
  { event: "search/videos.requested" },
  async ({ event, step, publish }) => {
    const { query, searchId } = event.data;

    console.log(`[SearchJob] Received request searchId=${searchId} query="${query}"`);

    // Step 1: Search and publish initial video results
    const partialResults = await step.run("search-and-publish-videos", async () => {
      console.log(`[SearchJob][Step1] Searching video chunks for "${query}"`);

      const chunks = await searchVideoChunks(query, 150);

      if (chunks.length === 0) {
        console.log(`[SearchJob][Step1] No chunks found for "${query}"`);
        await publish(
          searchJobChannel(searchId).videos({
            videos: [],
            status: "completed",
          })
        );
        return [];
      }

      const uniqueVideoIds = [...new Set(chunks.map((c) => c.video_id))];
      console.log(
        `[SearchJob][Step1] Retrieved ${chunks.length} chunks across ${uniqueVideoIds.length} videos`,
      );

      // Group chunks by video and calculate top similarity per video
      const videoMap = new Map<string, {
        chunk: typeof chunks[0];
        topSimilarity: number;
        chunkCount: number;
      }>();

      for (const chunk of chunks) {
        const existing = videoMap.get(chunk.video_id);
        const similarity = chunk.similarity_score;
        if (
          !existing ||
          (typeof similarity === "number" &&
            similarity > existing.topSimilarity)
        ) {
          videoMap.set(chunk.video_id, {
            chunk,
            topSimilarity: similarity ?? 0,
            chunkCount: (existing?.chunkCount || 0) + 1,
          });
        } else {
          videoMap.set(chunk.video_id, {
            ...existing,
            chunkCount: existing.chunkCount + 1,
          });
        }
      }

      // Fetch topics for partial results
      const videoIds = Array.from(videoMap.keys());
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: videos } = await supabase
        .from("videos")
        .select("id, topics")
        .in("id", videoIds);

      const videoTopicsMap = new Map(videos?.map((v) => [v.id, v.topics]) || []);

      // Create partial results (videos only, clips pending)
      const partialResults: VideoSearchResult[] = Array.from(videoMap.entries())
        .sort(([, a], [, b]) => b.topSimilarity - a.topSimilarity)
        .slice(0, 10) // Top 10 videos
        .filter(([, { chunk }]) => chunk.playback_id) // Filter out videos without playback_id
        .map(([videoId, { chunk }]) => ({
          video: {
            id: chunk.video_id,
            mux_asset_id: chunk.mux_asset_id,
            title: chunk.title || "",
            description: chunk.description || "",
            playback_id: chunk.playback_id!,
            topics: videoTopicsMap.get(videoId) || [],
            chapters: undefined, // Will be filled in step 3
          },
          clips: [], // Empty initially - will be filled in step 3
        }));

      console.log(
        `[SearchJob][Step1] Prepared ${partialResults.length} partial video results`,
      );

      // Publish initial video results via realtime
      console.log(`[SearchJob][Step1] About to publish to channel: search:${searchId}`);
      console.log(`[SearchJob][Step1] Publishing data:`, {
        videoCount: partialResults.length,
        status: "initial",
        firstVideo: partialResults[0] ? {
          id: partialResults[0].video.id,
          title: partialResults[0].video.title
        } : null
      });

      try {
        await publish(
          searchJobChannel(searchId).videos({
            videos: partialResults,
            status: "initial",
          })
        );
        console.log(
          `[SearchJob][Step1] ✅ Successfully published ${partialResults.length} initial video results`,
        );
      } catch (error) {
        console.error(`[SearchJob][Step1] ❌ Failed to publish video results:`, error);
        throw error;
      }

      return partialResults;
    });

    // Step 2: Fan-out clip extraction to individual functions
    await step.run("fan-out-clip-extraction", async () => {
      if (!partialResults || partialResults.length === 0) {
        console.log(`[SearchJob][Step2] No videos to extract clips from`);
        return;
      }

      console.log(
        `[SearchJob][Step2] Fanning out clip extraction for ${partialResults.length} videos`,
      );

      // Fetch video metadata for clip extraction
      const supabase = createClient(supabaseUrl, supabaseKey);
      const videoIds = partialResults.map((r) => r.video.id);

      const { data: videos, error: videosError } = await supabase
        .from("videos")
        .select("id, title, description, topics, chapters, transcript_en_vtt")
        .in("id", videoIds);

      if (videosError) {
        console.error("[SearchJob][Step2] Error fetching video metadata:", videosError);
      }

      const videoMetadataMap = new Map(videos?.map((v) => [v.id, v]) || []);

      // Send events to trigger clip extraction functions (fan-out)
      const events = videoIds.map((videoId) => ({
        name: "search/video.extract-clips",
        data: {
          searchId,
          videoId,
          query,
          videoMetadata: videoMetadataMap.get(videoId),
        },
      }));

      await inngest.send(events);

      console.log(
        `[SearchJob][Step2] Fanned out ${events.length} clip extraction jobs`,
      );
    });

    console.log(`[SearchJob] Completed for searchId=${searchId}`);

    return {
      searchId,
      query,
      status: "processing",
      message: "Clip extraction in progress",
    };
  },
);
