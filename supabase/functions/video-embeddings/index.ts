// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Mux from "npm:@mux/mux-node";
import type { Webhooks } from "npm:@mux/mux-node/resources/webhooks.js";
import { createEmbeddings } from "./create-embeddings.ts";

type UnwrapWebhookEvent = Webhooks.UnwrapWebhookEvent;

const mux = new Mux({
  tokenId: Deno.env.get("MUX_TOKEN_ID"),
  tokenSecret: Deno.env.get("MUX_TOKEN_SECRET"),
  webhookSecret: Deno.env.get("MUX_WEBHOOK_SECRET"),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  try {
    const event = (await req.json()) as UnwrapWebhookEvent;
    const track = event.data;
    if (!track) {
      console.log("No text track");
      return new Response("No text track in webhook", { status: 500 });
    }
    const trackId = track.id;
    const assetId = track.asset_id;

    console.log(`Creating embeddings for: ${assetId}`);

    await createEmbeddings(assetId, mux, supabase);

    return new Response(JSON.stringify({ status: "success" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/video-embeddings' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
