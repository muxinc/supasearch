import { createClient } from "@supabase/supabase-js";
import { openai } from "@ai-sdk/openai";
import { embed, generateObject } from "ai";
import { z } from 'zod';
import Mux from "@mux/mux-node";

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET,
});

type VideoRow = {
  assetId: string;
  title: string;
  description: string;
  transcriptText: string;
  transcriptVtt?: string;
  playbackId: string;
};

type VideoChunk = {
  chunkIndex: number;
  chunkText: string;
  startTime: number;
  endTime: number;
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
        parseInt(timeMatch[1]) * 3600 +
        parseInt(timeMatch[2]) * 60 +
        parseInt(timeMatch[3]) +
        parseInt(timeMatch[4]) / 1000;
      const endTime =
        parseInt(timeMatch[5]) * 3600 +
        parseInt(timeMatch[6]) * 60 +
        parseInt(timeMatch[7]) +
        parseInt(timeMatch[8]) / 1000;

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

async function createChunksFromVTT(
  cues: VTTCue[],
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
    const potentialText = currentChunk + " " + cue.text;

    // Create chunk if we exceed duration OR if text gets too long (token limit safety)
    if (chunkDuration > chunkDurationSeconds || potentialText.length > 3000) {
      // Generate embedding for current chunk
      console.log(`Generating embedding for chunk ${chunkIndex}`);
      const { embedding } = await embed({
        model: openai.textEmbeddingModel("text-embedding-3-small"),
        value: currentChunk,
      });

      chunks.push({
        chunkIndex,
        chunkText: currentChunk,
        startTime: chunkStartTime,
        endTime: cues[i - 1].endTime, // End time of previous cue
        embedding,
      });

      // Start new chunk with overlap (include current cue)
      chunkIndex++;
      chunkStartTime = cue.startTime;
      currentChunk = cue.text;
    } else {
      // Add cue to current chunk
      currentChunk += " " + cue.text;
    }
  }

  // Don't forget the last chunk
  if (currentChunk) {
    console.log(`Generating embedding for final chunk ${chunkIndex}`);
    const { embedding } = await embed({
      model: openai.textEmbeddingModel("text-embedding-3-small"),
      value: currentChunk,
    });

    chunks.push({
      chunkIndex,
      chunkText: currentChunk,
      startTime: chunkStartTime,
      endTime: cues[cues.length - 1].endTime,
      embedding,
    });
  }

  return chunks;
}

async function writeVideoAndChunks(
  videoData: VideoRow,
  chunks: VideoChunk[],
): Promise<string> {
  // First, insert or update the video
  const { data: videoResult, error: videoError } = await supabase
    .from("videos")
    .upsert(
      {
        mux_asset_id: videoData.assetId,
        title: videoData.title,
        description: videoData.description,
        transcript_en_text: videoData.transcriptText,
        transcript_en_vtt: videoData.transcriptVtt,
        playback_id: videoData.playbackId,
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


const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function createEmbeddings (assetId: string) {
        // Get the asset details which includes tracks
  const assetDetails = await mux.video.assets.retrieve(assetId);
  const textTrack = assetDetails.tracks?.find(
    (track) => track.type === "text",
  );

  if (!textTrack) {
    console.log(`No text track found for asset ${assetId}, skipping`);
    return
  }

  const playbackId = assetDetails.playback_ids?.[0]?.id;
  if (!playbackId) {
    console.log(`No playback ID found for asset ${assetId}, skipping`);
    return
  }

  const transcriptTextUrl = `https://stream.mux.com/${playbackId}/text/${textTrack.id}.txt`;
  console.log(`Fetching text transcript from: ${transcriptTextUrl}`);
  const transcriptTextResponse = await fetch(transcriptTextUrl);
  if (!transcriptTextResponse.ok) {
    console.log(
      `Failed to fetch text transcript for asset ${assetId}, skipping`,
    );
    return
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

  // Generate title and description using AI
  console.log(`Generating title and description for asset ${assetId}`);
  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: z.object({
      title: z.string(),
      description: z.string(),
    }),
    prompt: `Given the transcript for this video, generate a title and description\n${transcriptText}`,
  });

        const { title, description } = object;
        console.log(`Generated title: ${title}`);

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
          console.log(
            `No valid cues found in VTT for asset ${assetId}, skipping`,
          );
          return;
        }

        const chunks = await createChunksFromVTT(vttCues);
        console.log(`Created ${chunks.length} chunks for asset ${assetId}`);

        // Write video and chunks to database
        const videoId = await writeVideoAndChunks(
          {
            assetId: assetId,
            title,
            description,
            transcriptText: transcriptText,
            transcriptVtt: transcriptVtt,
            playbackId: playbackId,
          },
          chunks,
        );

        console.log(
          `Successfully processed asset ${assetId} with ${chunks.length} chunks`,
        );
}

