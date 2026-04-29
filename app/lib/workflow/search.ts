import { openai } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { generateObject } from "ai";
import { getWritable } from "workflow";
import { z } from "zod";
import type { VideoSearchResult } from "@/app/db/videos";
import { searchVideoChunks } from "@/app/db/videos";

type StreamMessage =
  | {
      type: "videos";
      videos: VideoSearchResult[];
      status: "initial" | "completed";
    }
  | {
      type: "clips";
      videoId: string;
      clips: Array<{
        start_time_seconds: number;
        end_time_seconds: number;
        snippet: string;
        relevance: "exact" | "related";
      }>;
    }
  | { type: "error"; videoId?: string; message: string };

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
    .describe(
      "1-3 most relevant clips from this video. MUST return at least one clip.",
    ),
});

function encodeMessage(message: StreamMessage): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(message)}\n`);
}

async function searchAndPublishVideos(
  query: string,
): Promise<VideoSearchResult[]> {
  "use step";

  const chunks = await searchVideoChunks(query, 150);

  if (chunks.length === 0) {
    const writer = getWritable().getWriter();
    await writer.write(
      encodeMessage({ type: "videos", videos: [], status: "completed" }),
    );
    writer.releaseLock();
    return [];
  }

  const videoMap = new Map<
    string,
    {
      chunk: (typeof chunks)[0];
      topSimilarity: number;
      chunkCount: number;
    }
  >();

  for (const chunk of chunks) {
    const existing = videoMap.get(chunk.video_id);
    const similarity = chunk.similarity_score;
    if (
      !existing ||
      (typeof similarity === "number" && similarity > existing.topSimilarity)
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

  const videoIds = Array.from(videoMap.keys());
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: videos } = await supabase
    .from("videos")
    .select("id, topics, chapters")
    .in("id", videoIds);

  const videoTopicsMap = new Map(videos?.map((v) => [v.id, v.topics]) || []);
  const videoChaptersMap = new Map(
    videos?.map((v) => [v.id, v.chapters]) || [],
  );

  const partialResults: VideoSearchResult[] = Array.from(videoMap.entries())
    .sort(([, a], [, b]) => b.topSimilarity - a.topSimilarity)
    .slice(0, 10)
    .filter(([, { chunk }]) => chunk.playback_id)
    .map(([videoId, { chunk }]) => ({
      video: {
        id: chunk.video_id,
        mux_asset_id: chunk.mux_asset_id,
        title: chunk.title || "",
        description: chunk.description || "",
        playback_id: chunk.playback_id!,
        topics: videoTopicsMap.get(videoId) || [],
        chapters: videoChaptersMap.get(videoId),
      },
      clips: [],
    }));

  const writer = getWritable().getWriter();
  await writer.write(
    encodeMessage({
      type: "videos",
      videos: partialResults,
      status: "initial",
    }),
  );
  writer.releaseLock();

  return partialResults;
}

async function fetchVideoMetadata(videoIds: string[]) {
  "use step";

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: videos, error } = await supabase
    .from("videos")
    .select("id, title, description, topics, chapters, transcript_en_vtt")
    .in("id", videoIds);

  if (error) {
    console.error("[fetchVideoMetadata] Error:", error);
    return [];
  }

  return videos || [];
}

async function extractClipsForVideo(
  videoId: string,
  query: string,
  videoMetadata: {
    title?: string;
    description?: string;
    chapters?: unknown;
    transcript_en_vtt?: string;
  } | null,
) {
  "use step";

  try {
    if (!videoMetadata?.transcript_en_vtt) {
      const writer = getWritable().getWriter();
      await writer.write(encodeMessage({ type: "clips", videoId, clips: [] }));
      writer.releaseLock();
      return [];
    }

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

    const { object } = await generateObject({
      model: openai("gpt-5-nano"),
      schema: clipExtractionSchema,
      prompt,
    });

    const writer = getWritable().getWriter();
    await writer.write(
      encodeMessage({ type: "clips", videoId, clips: object.clips }),
    );
    writer.releaseLock();

    return object.clips;
  } catch (error) {
    console.error(`[extractClipsForVideo] Error for video ${videoId}:`, error);

    const writer = getWritable().getWriter();
    await writer.write(
      encodeMessage({
        type: "error",
        videoId,
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    writer.releaseLock();

    return [];
  }
}

async function closeStream() {
  "use step";
  await getWritable().close();
}

export async function searchWorkflow(query: string) {
  "use workflow";

  const partialResults = await searchAndPublishVideos(query);

  if (partialResults.length === 0) {
    await closeStream();
    return { status: "completed", videoCount: 0 };
  }

  const allMetadata = await fetchVideoMetadata(
    partialResults.map((r) => r.video.id),
  );

  await Promise.all(
    partialResults.map((result) => {
      const metadata = allMetadata.find((m) => m.id === result.video.id);
      return extractClipsForVideo(result.video.id, query, metadata ?? null);
    }),
  );

  await closeStream();
  return { status: "completed", videoCount: partialResults.length };
}
