import { createClient } from "jsr:@supabase/supabase-js@2";
import { openai } from "npm:@ai-sdk/openai";
import type Mux from "npm:@mux/mux-node";
import { embed, generateObject } from "npm:ai";
import { z } from "npm:zod";

type VideoChapter = {
  start: string; // Format: "HH:MM:SS"
  title: string;
};

type VideoRow = {
  assetId: string;
  title: string;
  description: string;
  topics: string[];
  chapters: VideoChapter[];
  transcriptText: string;
  transcriptVtt?: string;
};

type VideoChunk = {
  chunkIndex: number;
  chunkText: string;
  startTime: number;
  endTime: number;
  visualDescription: string;
  embedding: number[];
};

type VTTCue = {
  startTime: number;
  endTime: number;
  text: string;
};

function parseVTT(vttContent: string): VTTCue[] {
  const cues: VTTCue[] = [];
  const lines = vttContent.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip empty lines and WEBVTT header
    if (!line || line === "WEBVTT") {
      i++;
      continue;
    }

    // Check if this line contains a timestamp (format: 00:01:30.500 --> 00:01:33.000)
    const timeMatch = line.match(
      /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/,
    );

    if (timeMatch) {
      const startTime =
        parseInt(timeMatch[1], 10) * 3600 +
        parseInt(timeMatch[2], 10) * 60 +
        parseInt(timeMatch[3], 10) +
        parseInt(timeMatch[4], 10) / 1000;
      const endTime =
        parseInt(timeMatch[5], 10) * 3600 +
        parseInt(timeMatch[6], 10) * 60 +
        parseInt(timeMatch[7], 10) +
        parseInt(timeMatch[8], 10) / 1000;

      // Collect text lines until we hit an empty line or another timestamp
      const textLines: string[] = [];
      i++; // Move past timestamp line

      while (i < lines.length) {
        const textLine = lines[i].trim();
        if (!textLine) break; // Empty line marks end of cue

        // Check if this line is another timestamp (start of next cue)
        if (
          textLine.match(
            /\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}/,
          )
        ) {
          break;
        }

        textLines.push(textLine);
        i++;
      }

      if (textLines.length > 0) {
        cues.push({
          startTime,
          endTime,
          text: textLines.join(" "),
        });
      }
    } else {
      i++;
    }
  }

  return cues;
}

/**
 * Gets the playback ID from the mux.assets table
 */
async function getPlaybackIdFromAsset(
  assetId: string,
  supabaseMux: ReturnType<typeof createClient>,
): Promise<string | null> {
  const { data, error } = await supabaseMux
    .from("assets")
    .select("playback_ids")
    .eq("id", assetId)
    .single();

  if (error || !data) {
    console.error(`Failed to fetch playback_ids for asset ${assetId}:`, error);
    return null;
  }

  const playbackIds = data.playback_ids as Array<{ id: string }>;
  return playbackIds?.[0]?.id || null;
}

/**
 * Generates video metadata including title, description, topics, and chapters with timeout
 */
async function generateVideoMetadataWithTimeout(
  transcriptText: string,
  timeoutMs: number = 20000,
): Promise<{
  title: string;
  description: string;
  topics: string[];
  chapters: VideoChapter[];
}> {
  // Truncate transcript if it's too long (keep first ~15000 chars to avoid token limits)
  const truncatedTranscript =
    transcriptText.length > 15000
      ? `${transcriptText.slice(0, 15000)}...`
      : transcriptText;

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Metadata generation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const generatePromise = generateObject({
    model: openai("gpt-5-nano"),
    mode: "json",
    schema: z.object({
      title: z.string().describe("A concise title for the video"),
      description: z
        .string()
        .describe("A brief description of the video content"),
      topics: z
        .array(z.string())
        .min(3)
        .max(5)
        .describe(
          "3-5 key topics or keywords from the video (short keywords/phrases like 'web components', 'hdr', 'webrtc')",
        ),
      chapters: z
        .array(
          z.object({
            start: z.string().describe("Timestamp in HH:MM:SS format"),
            title: z.string().describe("Title for this chapter/section"),
          }),
        )
        .min(1)
        .describe(
          "Key chapters/sections of the video with timestamps and titles",
        ),
    }),
    prompt: `You are a video content analyzer. Analyze the following transcript and generate metadata in valid JSON format.

You MUST return a JSON object with these exact fields:
{
  "title": "string - A concise title (5-10 words)",
  "description": "string - A brief description (1-3 sentences)",
  "topics": ["array of 3-5 topic strings like 'web components', 'streaming'"],
  "chapters": [
    {"start": "HH:MM:SS", "title": "Chapter title"},
    ...at least one chapter is required
  ]
}

Transcript:
${truncatedTranscript}

Return ONLY the JSON object, no additional text.`,
  });

  const { object } = await Promise.race([generatePromise, timeoutPromise]);
  return object;
}

/**
 * Generates video metadata with retry logic (up to 4 retries)
 */
async function generateVideoMetadata(
  transcriptText: string,
  maxRetries: number = 4,
): Promise<{
  title: string;
  description: string;
  topics: string[];
  chapters: VideoChapter[];
}> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt}/${maxRetries - 1} for metadata generation...`);
        // 2 second delay between retries
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      return await generateVideoMetadataWithTimeout(transcriptText, 20000);
    } catch (error) {
      lastError = error as Error;
      console.error(
        `Error generating metadata (attempt ${attempt + 1}/${maxRetries}):`,
        error,
      );

      if (attempt === maxRetries - 1) {
        // Final attempt failed, throw error
        throw new Error(
          `Failed to generate video metadata after ${maxRetries} attempts: ${lastError?.message}`,
        );
      }
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new Error(
    `Failed to generate video metadata: ${lastError?.message}`,
  );
}

/**
 * Pre-fetches an image to cache it for OpenAI
 */
async function prefetchImage(url: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to prefetch image: ${response.statusText}`);
    }
    // Just fetch it, browser/runtime will cache it
    await response.arrayBuffer();
  } catch (error) {
    console.error(`Error prefetching image ${url}:`, error);
    throw error;
  }
}

/**
 * Gets thumbnail URL at the midpoint of the chunk
 */
function _getThumbnailUrl(
  playbackId: string,
  startTime: number,
  endTime: number,
): string {
  const midpoint = (startTime + endTime) / 2;
  return `https://image.mux.com/${playbackId}/thumbnail.png?time=${midpoint}`;
}

/**
 * Generates visual description from a thumbnail image with retry logic
 */
async function _generateVisualDescription(
  imageUrl: string,
  maxRetries: number = 2,
): Promise<string> {
  let _lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt} for visual description...`);
        // 5 second delay between retries
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      // Prefetch image before sending to OpenAI
      console.log(`Prefetching image...`);
      await prefetchImage(imageUrl);

      // Generate visual description using OpenAI vision model
      const { object } = await generateObject({
        model: openai("gpt-5"),
        schema: z.object({
          description: z
            .string()
            .describe(
              "1-5 sentences describing what is happening visually in this video segment",
            ),
        }),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Describe what is happening visually in this video segment. Focus on the speaker, setting, any on-screen text or graphics, and key visual elements. Provide 1-5 sentences.",
              },
              {
                type: "image" as const,
                image: imageUrl,
              },
            ],
          },
        ],
      });

      return object.description;
    } catch (error) {
      _lastError = error as Error;
      console.error(
        `Error generating visual description (attempt ${attempt + 1}/${maxRetries + 1}):`,
        error,
      );

      if (attempt === maxRetries) {
        // Final attempt failed, return empty string and log warning
        console.warn(
          `Failed to generate visual description after ${maxRetries + 1} attempts. Continuing without visual description.`,
        );
        return "";
      }
    }
  }

  return "";
}

/**
 * Creates embedding text by combining topics, chunk text, and visual description
 */
function createEmbeddingText(
  topics: string[],
  chunkText: string,
  visualDescription: string,
): string {
  const topicsText = `Topics: ${topics.join(", ")}`;
  const parts = [topicsText, chunkText];

  if (visualDescription) {
    parts.push(`Visual: ${visualDescription}`);
  }

  return parts.join("\n\n");
}

async function createChunksFromVTT(
  cues: VTTCue[],
  topics: string[],
  _playbackId: string,
  chunkDurationSeconds: number = 45,
): Promise<VideoChunk[]> {
  const chunks: VideoChunk[] = [];
  let currentChunk = "";
  let chunkStartTime = 0;
  let chunkIndex = 0;

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];

    // Start new chunk if this is the first cue
    if (currentChunk === "") {
      chunkStartTime = cue.startTime;
      currentChunk = cue.text;
      continue;
    }

    // Check if adding this cue would exceed our chunk duration
    const chunkDuration = cue.endTime - chunkStartTime;
    const potentialText = `${currentChunk} ${cue.text}`;

    // Create chunk if we exceed duration OR if text gets too long (token limit safety)
    if (chunkDuration > chunkDurationSeconds || potentialText.length > 3000) {
      const chunkEndTime = cues[i - 1].endTime;

      // Generate visual description from thumbnail
      // TODO: Re-enable visual descriptions when needed
      // console.log(`Generating visual description for chunk ${chunkIndex}`);
      // const thumbnailUrl = getThumbnailUrl(playbackId, chunkStartTime, chunkEndTime);
      // const visualDescription = await generateVisualDescription(thumbnailUrl);
      const visualDescription = "";

      // Create combined embedding text
      const embeddingText = createEmbeddingText(
        topics,
        currentChunk,
        visualDescription,
      );

      // Generate embedding for current chunk
      console.log(`Generating embedding for chunk ${chunkIndex}`);
      const { embedding } = await embed({
        model: openai.textEmbeddingModel("text-embedding-3-small"),
        value: embeddingText,
      });

      chunks.push({
        chunkIndex,
        chunkText: currentChunk,
        startTime: chunkStartTime,
        endTime: chunkEndTime,
        visualDescription,
        embedding,
      });

      // Start new chunk with overlap (include current cue)
      chunkIndex++;
      chunkStartTime = cue.startTime;
      currentChunk = cue.text;
    } else {
      // Add cue to current chunk
      currentChunk += ` ${cue.text}`;
    }
  }

  // Don't forget the last chunk
  if (currentChunk) {
    const chunkEndTime = cues[cues.length - 1].endTime;

    // Generate visual description from thumbnail
    // TODO: Re-enable visual descriptions when needed
    // console.log(`Generating visual description for final chunk ${chunkIndex}`);
    // const thumbnailUrl = getThumbnailUrl(playbackId, chunkStartTime, chunkEndTime);
    // const visualDescription = await generateVisualDescription(thumbnailUrl);
    const visualDescription = "";

    // Create combined embedding text
    const embeddingText = createEmbeddingText(
      topics,
      currentChunk,
      visualDescription,
    );

    // Generate embedding for final chunk
    console.log(`Generating embedding for final chunk ${chunkIndex}`);
    const { embedding } = await embed({
      model: openai.textEmbeddingModel("text-embedding-3-small"),
      value: embeddingText,
    });

    chunks.push({
      chunkIndex,
      chunkText: currentChunk,
      startTime: chunkStartTime,
      endTime: chunkEndTime,
      visualDescription,
      embedding,
    });
  }

  return chunks;
}

async function writeVideoAndChunks(
  videoData: VideoRow,
  chunks: VideoChunk[],
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  // First, insert or update the video
  const { data: videoResult, error: videoError } = await supabase
    .from("videos")
    .upsert(
      {
        mux_asset_id: videoData.assetId,
        title: videoData.title,
        description: videoData.description,
        topics: videoData.topics,
        chapters: videoData.chapters,
        transcript_en_text: videoData.transcriptText,
        transcript_en_vtt: videoData.transcriptVtt,
      },
      {
        onConflict: "mux_asset_id",
      },
    )
    .select("id")
    .single();

  if (videoError) {
    throw videoError;
  }

  const videoId = videoResult.id;

  // Delete existing chunks for this video (in case of re-processing)
  const { error: deleteError } = await supabase
    .from("video_chunks")
    .delete()
    .eq("video_id", videoId);

  if (deleteError) {
    throw deleteError;
  }

  // Insert new chunks
  const chunksToInsert = chunks.map((chunk) => ({
    video_id: videoId,
    chunk_index: chunk.chunkIndex,
    chunk_text: chunk.chunkText,
    start_time: chunk.startTime,
    end_time: chunk.endTime,
    visual_description: chunk.visualDescription,
    embedding: chunk.embedding,
  }));

  const { error: chunksError } = await supabase
    .from("video_chunks")
    .insert(chunksToInsert);

  if (chunksError) {
    throw chunksError;
  }

  return videoId;
}

export async function createEmbeddings(
  assetId: string,
  mux: Mux,
  supabase: ReturnType<typeof createClient>,
) {
  // Create a supabase client for mux schema
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseMux = createClient(supabaseUrl, supabaseKey, {
    db: { schema: "mux" },
  });

  // Get playback ID from mux.assets table
  const playbackId = await getPlaybackIdFromAsset(assetId, supabaseMux);
  if (!playbackId) {
    console.log(`No playback ID found for asset ${assetId}, skipping`);
    return;
  }

  // Get the asset details which includes tracks
  const assetDetails = await mux.video.assets.retrieve(assetId);
  const textTrack = assetDetails.tracks?.find((track) => track.type === "text");

  if (!textTrack) {
    console.log(`No text track found for asset ${assetId}, skipping`);
    return;
  }

  const transcriptTextUrl = `https://stream.mux.com/${playbackId}/text/${textTrack.id}.txt`;
  console.log(`Fetching text transcript from: ${transcriptTextUrl}`);
  const transcriptTextResponse = await fetch(transcriptTextUrl);
  if (!transcriptTextResponse.ok) {
    console.log(
      `Failed to fetch text transcript for asset ${assetId}, skipping`,
    );
    return;
  }

  const transcriptText = await transcriptTextResponse.text();

  // Fetch the VTT transcript
  const transcriptVttUrl = `https://stream.mux.com/${playbackId}/text/${textTrack.id}.vtt`;
  console.log(`Fetching VTT transcript from: ${transcriptVttUrl}`);

  let transcriptVtt: string | undefined;
  const transcriptVttResponse = await fetch(transcriptVttUrl);
  if (transcriptVttResponse.ok) {
    transcriptVtt = await transcriptVttResponse.text();
  } else {
    console.log(
      `Failed to fetch VTT transcript for asset ${assetId}, continuing with text only`,
    );
  }

  // Generate title, description, topics, and chapters using AI
  console.log(
    `Generating metadata (title, description, topics, chapters) for asset ${assetId}`,
  );
  const { title, description, topics, chapters } =
    await generateVideoMetadata(transcriptText);
  console.log(`Generated title: ${title}`);
  console.log(`Generated topics: ${topics.join(", ")}`);
  console.log(`Generated ${chapters.length} chapters`);

  // Parse VTT and create chunks with embeddings
  if (!transcriptVtt) {
    console.log(
      `No VTT transcript available for asset ${assetId}, skipping chunking`,
    );
    return;
  }

  console.log(`Parsing VTT and creating chunks for asset ${assetId}`);
  const vttCues = parseVTT(transcriptVtt);
  console.log(`Parsed ${vttCues.length} VTT cues`);

  if (vttCues.length === 0) {
    console.log(`No valid cues found in VTT for asset ${assetId}, skipping`);
    return;
  }

  const chunks = await createChunksFromVTT(vttCues, topics, playbackId);
  console.log(`Created ${chunks.length} chunks for asset ${assetId}`);

  // Write video and chunks to database
  const videoId = await writeVideoAndChunks(
    {
      assetId: assetId,
      title,
      description,
      topics,
      chapters,
      transcriptText: transcriptText,
      transcriptVtt: transcriptVtt,
    },
    chunks,
    supabase,
  );

  console.log(
    `Successfully processed asset ${assetId} with ${chunks.length} chunks`,
  );

  return videoId;
}
