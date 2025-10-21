import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { queueWorkflowsForEvent } from "npm:@mux/supabase@0.0.21";
import { MuxSync } from "npm:@mux/sync-engine@0.0.5";

// Load secrets from environment variables
const databaseUrl =
  Deno.env.get("SUPABASE_DB_URL") || "postgresql://your-database-url";
const muxWebhookSecret =
  Deno.env.get("MUX_WEBHOOK_SECRET") || "your-mux-webhook-secret";
const muxTokenId = Deno.env.get("MUX_TOKEN_ID") || "your-mux-token-id";
const muxTokenSecret =
  Deno.env.get("MUX_TOKEN_SECRET") || "your-mux-token-secret";

// Initialize MuxSync
const muxSync = new MuxSync({
  databaseUrl,
  muxWebhookSecret,
  muxTokenId,
  muxTokenSecret,
  backfillRelatedEntities: false,
  revalidateEntityViaMuxApi: true,
  maxPostgresConnections: 5,
  logger: console,
});

// Create HTTP server handler
Deno.serve(async (req) => {
  // Only handle POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.text();
    await muxSync.processWebhook(
      body,
      Object.fromEntries(req.headers.entries()),
    );
    await queueWorkflowsForEvent(
      body,
      Object.fromEntries(req.headers.entries()),
    );

    return new Response(JSON.stringify({ status: "success" }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
