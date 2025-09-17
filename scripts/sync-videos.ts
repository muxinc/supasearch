import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import Mux from '@mux/mux-node';
import { openai } from '@ai-sdk/openai';
import { embed, generateObject } from 'ai';
import { z } from 'zod';

// Parse CLI arguments
const args = process.argv.slice(2);
const updateExistingAssets = args.includes('--update-existing-assets');

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET,
});

type VideoRow = {
  assetId: string;
  title: string;
  description: string;
  transcript: string;
  embedding: number[];
};

async function checkAssetExists(assetId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('videos')
    .select('mux_asset_id')
    .eq('mux_asset_id', assetId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return !!data;
}

async function writeVideoRow({ assetId, title, description, transcript, embedding }: VideoRow) {
  const { error } = await supabase
    .from('videos')
    .upsert(
      {
        mux_asset_id: assetId,
        title: title,
        description: description,
        transcript_en: transcript,
        embedding: embedding,
      },
      {
        onConflict: 'mux_asset_id',
      }
    );

  if (error) {
    throw error;
  }
}

async function syncVideos() {
  try {
    console.log('Starting video sync...');
    console.log(`Update existing assets: ${updateExistingAssets}`);

    // Get all assets from Mux
    const assets = await mux.video.assets.list();
    console.log(`Found ${assets.data.length} assets`);

    for (const asset of assets.data) {
      try {
        console.log(`Processing asset: ${asset.id}`);

        // Check if asset already exists in database
        if (!updateExistingAssets) {
          const exists = await checkAssetExists(asset.id);
          if (exists) {
            console.log(`Asset ${asset.id} already exists, skipping`);
            continue;
          }
        }

        // Get the asset details which includes tracks
        const assetDetails = await mux.video.assets.retrieve(asset.id);
        const textTrack = assetDetails.tracks?.find(track => track.type === 'text');

        if (!textTrack) {
          console.log(`No text track found for asset ${asset.id}, skipping`);
          continue;
        }

        const playbackId = assetDetails.playback_ids?.[0]?.id;
        if (!playbackId) {
          console.log(`No playback ID found for asset ${asset.id}, skipping`);
          continue;
        }

        // Fetch the transcript
        const transcriptUrl = `https://stream.mux.com/${playbackId}/text/${textTrack.id}.txt`;
        console.log(`Fetching transcript from: ${transcriptUrl}`);

        const transcriptResponse = await fetch(transcriptUrl);
        if (!transcriptResponse.ok) {
          console.log(`Failed to fetch transcript for asset ${asset.id}, skipping`);
          continue;
        }

        const transcriptText = await transcriptResponse.text();

        // Generate title and description using AI
        console.log(`Generating title and description for asset ${asset.id}`);
        const { object } = await generateObject({
          model: openai('gpt-4o'),
          schema: z.object({
            title: z.string(),
            description: z.string(),
          }),
          prompt: `Given the transcript for this video, generate a title and description\n${transcriptText}`,
        });

        const { title, description } = object;
        console.log(`Generated title: ${title}`);

        // Generate embedding
        console.log(`Generating embedding for asset ${asset.id}`);
        const { embedding } = await embed({
          model: openai.textEmbeddingModel('text-embedding-3-small'),
          value: transcriptText,
        });

        // Write to database
        await writeVideoRow({
          assetId: asset.id,
          title,
          description,
          transcript: transcriptText,
          embedding,
        });

        console.log(`Successfully processed asset: ${asset.id}`);

      } catch (error) {
        console.error(`Error processing asset ${asset.id}:`, error);
        continue;
      }
    }

    console.log('Video sync completed!');

  } catch (error) {
    console.error('Error during video sync:', error);
    process.exit(1);
  }
}

syncVideos();