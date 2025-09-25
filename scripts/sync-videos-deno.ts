import { createClient } from "jsr:@supabase/supabase-js@2";
import Mux from "npm:@mux/mux-node";
import { createEmbeddings } from '../supabase/functions/video-embeddings/create-embeddings.ts';

// Parse CLI arguments
const args = Deno.args;
const updateExistingAssets = args.includes("--update-existing-assets");

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const mux = new Mux({
  tokenId: Deno.env.get("MUX_TOKEN_ID")!,
  tokenSecret: Deno.env.get("MUX_TOKEN_SECRET")!,
});

async function checkAssetExists(assetId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("videos")
    .select("mux_asset_id")
    .eq("mux_asset_id", assetId)
    .single();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  return !!data;
}

async function syncVideos() {
  try {
    console.log("Starting video sync...");
    console.log(`Update existing assets: ${updateExistingAssets}`);

    // Get all assets from Mux
    const assets = await mux.video.assets.list();
    console.log(`Found ${assets.data.length} assets`);

    for (const asset of assets.data) {
      const assetId = asset.id;
      try {
        console.log(`Processing asset: ${assetId}`);

        // Check if asset already exists in database
        if (!updateExistingAssets) {
          const exists = await checkAssetExists(assetId);
          if (exists) {
            console.log(`Asset ${assetId} already exists, skipping`);
            continue;
          }
        }

        await createEmbeddings(assetId, mux, supabase);
      } catch (error) {
        console.error(`Error processing asset ${assetId}:`, error);
        continue;
      }
    }

    console.log("Video sync completed!");
  } catch (error) {
    console.error("Error during video sync:", error);
    Deno.exit(1);
  }
}

syncVideos();