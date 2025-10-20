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

    // Initialize job status
    jobStore.set(jobId, {
      status: "processing",
      progress: { step: 0, totalSteps: 2, currentStep: "Starting..." },
    });

    // Step 1: Search video chunks (handles embedding creation and retrieval)
    const enrichedChunks = await step.run("search-video-chunks", async () => {
      jobStore.updateProgress(jobId, {
        step: 1,
        totalSteps: 2,
        currentStep: "Searching video database",
      });

      console.log(`[Step 1] Searching video chunks for query: "${query}"`);

      const chunks = await searchVideoChunks(query, 150);

      if (chunks.length === 0) {
        console.log(`[Step 1] No chunks found for query: "${query}"`);
        return [];
      }

      const uniqueVideoIds = [...new Set(chunks.map((c) => c.video_id))];
      console.log(
        `[Step 1] Retrieved ${chunks.length} chunks from ${uniqueVideoIds.length} videos`,
      );

      return chunks;
    });

    // Step 2: Re-rank results using GPT
    const finalResults = await step.run("rerank-results", async () => {
      jobStore.updateProgress(jobId, {
        step: 2,
        totalSteps: 2,
        currentStep: "Re-ranking with AI",
      });

      console.log(`[Step 2] Re-ranking results with GPT-5...`);

      if (enrichedChunks.length === 0) {
        console.log(`[Step 2] No chunks to rerank`);
        return [];
      }

      // Fetch additional video metadata (topics and chapters) that searchVideoChunks doesn't return
      const uniqueVideoIds = [...new Set(enrichedChunks.map((c) => c.video_id))];
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: videos, error: videosError } = await supabase
        .from("videos")
        .select("id, topics, chapters")
        .in("id", uniqueVideoIds);

      if (videosError) {
        console.error("[Step 2] Error fetching video topics/chapters:", videosError);
      }

      const videoMetadataMap = new Map(videos?.map((v) => [v.id, v]) || []);

      // Group chunks by video_id
      const videoChunksMap = new Map<string, typeof enrichedChunks>();
      for (const chunk of enrichedChunks) {
        if (!videoChunksMap.has(chunk.video_id)) {
          videoChunksMap.set(chunk.video_id, []);
        }
        videoChunksMap.get(chunk.video_id)?.push(chunk);
      }

      // Build the retrieval dataset for GPT
      const retrievalDataset = Array.from(videoChunksMap.entries()).map(
        ([videoId, videoChunks]) => {
          const videoMetadata = videoMetadataMap.get(videoId);
          return {
            video: {
              id: videoId,
              title: videoChunks[0]?.title || "",
              description: videoChunks[0]?.description || "",
              chapters: videoMetadata?.chapters || [],
              chunks: videoChunks.map((chunk) => ({
                chunk_text: chunk.chunk_text,
                visual_description: chunk.visual_description || "",
                start_time: chunk.start_time || 0,
                end_time: chunk.end_time || 0,
              })),
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
        `[Step 2] Sending ${retrievalDataset.length} videos to GPT-5 for reranking...`,
      );

      const { object } = await generateObject({
        model: openai("gpt-5-nano"),
        schema: rerankingSchema,
        prompt,
      });

      console.log(`[Step 2] GPT-5 returned ${object.results.length} videos`);

      // Log details about clips per video
      const clipCounts = object.results.map((r) => r.clips.length);
      const totalClips = clipCounts.reduce((sum, count) => sum + count, 0);
      console.log(`[Step 2] Total clips across all videos: ${totalClips}`);
      console.log(`[Step 2] Clips per video: [${clipCounts.join(", ")}]`);

      // Create lookup maps from enriched chunks for faster access
      const chunksByVideoId = new Map<string, typeof enrichedChunks[0]>();
      for (const chunk of enrichedChunks) {
        if (!chunksByVideoId.has(chunk.video_id)) {
          chunksByVideoId.set(chunk.video_id, chunk);
        }
      }

      // Transform GPT results into VideoSearchResult format
      const results: VideoSearchResult[] = object.results
        .map((result) => {
          const chunk = chunksByVideoId.get(result.video_id);
          const videoMetadata = videoMetadataMap.get(result.video_id);

          if (!chunk || !chunk.playback_id) {
            return null;
          }

          return {
            video: {
              id: chunk.video_id,
              mux_asset_id: chunk.mux_asset_id,
              title: chunk.title || "",
              description: chunk.description || "",
              playback_id: chunk.playback_id,
              topics: videoMetadata?.topics || [],
              chapters: videoMetadata?.chapters as VideoChapter[] | undefined,
            },
            clips: result.clips,
          };
        })
        .filter((r) => r !== null) as VideoSearchResult[];

      console.log(`[Step 2] Returning ${results.length} videos with clips`);

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
