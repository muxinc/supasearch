import { createClient } from "jsr:@supabase/supabase-js@2";
import Mux from "npm:@mux/mux-node";
import { createEmbeddings } from "../supabase/functions/video-embeddings/create-embeddings.ts";

// Parse CLI arguments
const args = Deno.args;
const updateExistingAssets = args.includes("--update-existing-assets");

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Client for querying mux schema
const supabaseMux = createClient(supabaseUrl, supabaseKey, {
  db: { schema: "mux" },
});

// Client for querying public schema
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

    // Get all assets from Supabase mux.assets table
    const { data: assets, error: assetsError } = await supabaseMux
      .from("assets")
      .select("id, status");

    if (assetsError) {
      throw assetsError;
    }

    console.log(`Found ${assets?.length || 0} assets`);

    for (const asset of assets || []) {
      const assetId = asset.id;
      try {
        console.log(`Processing asset: ${assetId}`);

        // Check if asset already exists in videos table (public schema)
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
