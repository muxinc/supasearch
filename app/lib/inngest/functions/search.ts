import { openai } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { generateObject } from "ai";
import { z } from "zod";
import type { VideoChapter, VideoSearchResult } from "@/app/db/videos";
import { searchVideoChunks } from "@/app/db/videos";
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

    console.log(`[SearchJob] Received request jobId=${jobId} query="${query}"`);

    // Initialize job status only once (subsequent step replays shouldn't clear partial results)
    const existingJob = jobStore.get(jobId);
    if (!existingJob) {
      jobStore.set(jobId, {
        status: "processing",
        progress: { step: 0, totalSteps: 3, currentStep: "Starting..." },
      });
      console.log(`[SearchJob] Initialized job entry jobId=${jobId}`);
    } else {
      console.log(
        `[SearchJob] Resuming jobId=${jobId} status=${existingJob.status} existingResults=${existingJob.results?.length ?? 0}`,
      );
    }

    // Step 1: Search video chunks (handles embedding creation and retrieval)
    const enrichedChunks = await step.run("search-video-chunks", async () => {
      jobStore.updateProgress(jobId, {
        step: 1,
        totalSteps: 3,
        currentStep: "Searching video database",
      });

      console.log(`[SearchJob][Step1] Searching video chunks for "${query}"`);

      const chunks = await searchVideoChunks(query, 150);

      if (chunks.length === 0) {
        console.log(`[SearchJob][Step1] No chunks found for "${query}"`);
        return [];
      }

      const uniqueVideoIds = [...new Set(chunks.map((c) => c.video_id))];
      console.log(
        `[SearchJob][Step1] Retrieved ${chunks.length} chunks across ${uniqueVideoIds.length} videos`,
      );

      return chunks;
    });

    // Step 2: Send partial video-level results immediately (waterfall UX)
    await step.run("send-partial-results", async () => {
      jobStore.updateProgress(jobId, {
        step: 2,
        totalSteps: 3,
        currentStep: "Preparing video results",
      });

      console.log(
        `[SearchJob][Step2] Preparing partial results from ${enrichedChunks.length} chunks`,
      );

      if (enrichedChunks.length === 0) {
        return;
      }

      // Group chunks by video and calculate top similarity per video
      const videoMap = new Map<string, {
        chunk: typeof enrichedChunks[0];
        topSimilarity: number;
        chunkCount: number;
      }>();

      for (const chunk of enrichedChunks) {
        const existing = videoMap.get(chunk.video_id);
        const similarity = chunk.similarity_score ?? chunk.similarity;
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
      const uniqueVideoIds = Array.from(videoMap.keys());
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: videos } = await supabase
        .from("videos")
        .select("id, topics")
        .in("id", uniqueVideoIds);

      const videoTopicsMap = new Map(videos?.map((v) => [v.id, v.topics]) || []);

      // Create partial results (videos only, clips pending)
      const partialResults: VideoSearchResult[] = Array.from(videoMap.entries())
        .sort(([, a], [, b]) => b.topSimilarity - a.topSimilarity)
        .slice(0, 10) // Top 10 videos
        .map(([videoId, { chunk }]) => ({
          video: {
            id: chunk.video_id,
            mux_asset_id: chunk.mux_asset_id,
            title: chunk.title || "",
            description: chunk.description || "",
            playback_id: chunk.playback_id,
            topics: videoTopicsMap.get(videoId) || [],
            chapters: undefined, // Will be filled in step 3
          },
          clips: [], // Empty initially - will be filled in step 3
        }));

      console.log(
        `[SearchJob][Step2] Prepared ${partialResults.length} partial video results`,
      );

      // Store partial results (status: processing with partial data)
      jobStore.set(jobId, {
        status: "processing",
        results: partialResults,
        progress: {
          step: 2,
          totalSteps: 3,
          currentStep: "Extracting clips with AI",
        },
      });

      console.log(
        `[Step 2] Stored ${partialResults.length} partial video results`,
      );
    });

    // Step 3: Extract clips incrementally per video (preserves all partial results)
    const finalResults = await step.run("extract-clips", async () => {
      jobStore.updateProgress(jobId, {
        step: 3,
        totalSteps: 3,
        currentStep: "Extracting clips with AI",
      });

      console.log(`[Step 3] Extracting clips with GPT-5...`);

      if (enrichedChunks.length === 0) {
        console.log(`[Step 3] No chunks to extract clips from`);
        return [];
      }

      // Group ALL enriched chunks by video_id
      const videoChunksMap = new Map<string, typeof enrichedChunks>();
      for (const chunk of enrichedChunks) {
        if (!videoChunksMap.has(chunk.video_id)) {
          videoChunksMap.set(chunk.video_id, []);
        }
        videoChunksMap.get(chunk.video_id)?.push(chunk);
      }

      // Get the partial results from Step 2 (the 10 videos shown to user)
      const partialJob = jobStore.get(jobId);
      const partialResults = partialJob?.results || [];
      console.log(`[Step 3] Partial results from Step 2: ${partialResults.length} videos`);

      // CRITICAL FIX: Keep ALL videos from Step 2, even if they don't have chunks
      // We'll just give them empty clips arrays
      const allVideoIds = Array.from(partialResults.map((r) => r.video.id));
      const updatedResults = [...partialResults]; // Clone ALL partial results

      // Count how many videos actually have chunks
      const videosWithChunks = allVideoIds.filter((id) =>
        videoChunksMap.has(id),
      );
      if (videosWithChunks.length !== allVideoIds.length) {
        console.log(
          `[SearchJob][Step3] Missing chunk data for ${allVideoIds.length - videosWithChunks.length} of ${allVideoIds.length} videos`,
        );
      }

      // Fetch metadata for ALL videos
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: videos, error: videosError } = await supabase
        .from("videos")
        .select("id, topics, chapters")
        .in("id", allVideoIds);

      if (videosError) {
        console.error("[Step 3] Error fetching video metadata:", videosError);
      }

      const videoMetadataMap = new Map(videos?.map((v) => [v.id, v]) || []);
      if ((videos?.length ?? 0) !== allVideoIds.length) {
        console.log(
          `[SearchJob][Step3] Missing metadata for ${allVideoIds.length - (videos?.length ?? 0)} videos`,
        );
      }

      // Process ALL videos in batches (even those without chunks)
      const BATCH_SIZE = 3; // Process 3 videos at a time
      const videoIds = allVideoIds;

      console.log(
        `[Step 3] Processing ${videoIds.length} videos in batches of ${BATCH_SIZE}`,
      );

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
            }),
          )
          .max(3)
          .describe("Up to 3 most relevant clips from this video"),
      });

      // Process videos in batches
      for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
        const batchIds = videoIds.slice(i, i + BATCH_SIZE);
        console.log(
          `[Step 3] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(videoIds.length / BATCH_SIZE)}: ${batchIds.length} videos`,
        );

        // Extract clips for each video in the batch
        const batchPromises = batchIds.map(async (videoId) => {
          const videoChunks = videoChunksMap.get(videoId);
          if (!videoChunks || videoChunks.length === 0) {
            return { videoId, clips: [] };
          }

          // Limit to top 10 chunks per video for performance
          const topVideoChunks = videoChunks.slice(0, 10);
          const videoMetadata = videoMetadataMap.get(videoId);

          const prompt = `You are a clip extraction expert. Given a user's query and video chunks with timestamps, extract up to 3 relevant clips.

User Query: "${query}"

Video: "${topVideoChunks[0]?.title || "Untitled"}"
Description: "${topVideoChunks[0]?.description || ""}"
${videoMetadata?.chapters ? `Chapters: ${JSON.stringify(videoMetadata.chapters)}` : ""}

Available Chunks:
${topVideoChunks
  .map(
    (chunk, idx) =>
      `[${idx + 1}] ${chunk.start_time}s - ${chunk.end_time}s: ${chunk.chunk_text.slice(0, 200)}...`,
  )
  .join("\n")}

Instructions:
- Extract up to 3 clips that best match the query
- Each clip should use the start_time and end_time from the chunks above
- Provide a brief snippet explaining relevance
- If no relevant clips, return empty array`;

          try {
            const { object } = await generateObject({
              model: openai("gpt-5-nano"),
              schema: clipExtractionSchema,
              prompt,
            });

            return { videoId, clips: object.clips };
          } catch (error) {
            console.error(
              `[Step 3] Error extracting clips for video ${videoId}:`,
              error,
            );
            return { videoId, clips: [] };
          }
        });

        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);

        // Merge clips into existing results
        for (const { videoId, clips } of batchResults) {
          const resultIndex = updatedResults.findIndex(
            (r) => r.video.id === videoId,
          );
          if (resultIndex !== -1) {
            updatedResults[resultIndex].clips = clips;
            console.log(
              `[Step 3] Updated video ${videoId}: ${clips.length} clips extracted`,
            );

            // Add chapters if available
            const videoMetadata = videoMetadataMap.get(videoId);
            if (videoMetadata?.chapters) {
              updatedResults[resultIndex].video.chapters =
                videoMetadata.chapters as VideoChapter[] | undefined;
            }
          } else {
            console.error(
              `[Step 3] ERROR: Could not find video ${videoId} in updatedResults`,
            );
          }
        }

        // Update job store with partial progress after each batch
        jobStore.set(jobId, {
          status: "processing",
          results: updatedResults,
          progress: {
            step: 3,
            totalSteps: 3,
            currentStep: `Extracting clips (${Math.min(i + BATCH_SIZE, videoIds.length)}/${videoIds.length})`,
          },
        });

        console.log(
          `[SearchJob][Step3] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(videoIds.length / BATCH_SIZE)} completed (${batchResults.length} videos)`,
        );
      }

      console.log(
        `[SearchJob][Step3] Clip extraction complete for ${videoIds.length} videos`,
      );

      // Final sanity check
      const videosWithClips = updatedResults.filter((r) => r.clips.length > 0);
      const videosWithoutClips = updatedResults.filter(
        (r) => r.clips.length === 0,
      );
      console.log(
        `[SearchJob][Step3] Final summary: ${updatedResults.length} videos, ${videosWithClips.length} with clips, ${videosWithoutClips.length} without clips`,
      );

      return updatedResults;
    });

    // Store final results in job store
    console.log(
      `[SearchJob][JobStore] Storing ${finalResults.length} final results for jobId=${jobId}`,
    );
    jobStore.set(jobId, {
      status: "completed",
      results: finalResults,
    });
    console.log(
      `[SearchJob][JobStore] Store completed for jobId=${jobId}`,
    );

    return {
      jobId,
      query,
      results: finalResults,
      completedAt: new Date().toISOString(),
    };
  },
);
