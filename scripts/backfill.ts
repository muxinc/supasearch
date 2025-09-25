import { MuxSync } from '@mux/sync-engine';
import 'dotenv/config';

async function runBackfill() {
  const databaseUrl = process.env.SUPABASE_DB_URL;
  const muxTokenId = process.env.MUX_TOKEN_ID;
  const muxTokenSecret = process.env.MUX_TOKEN_SECRET;
  const muxWebhookSecret = process.env.MUX_WEBHOOK_SECRET;

  if (!databaseUrl || !muxTokenId || !muxTokenSecret || !muxWebhookSecret) {
    console.error('Missing required environment variables:');
    if (!databaseUrl) console.error('- SUPABASE_DB_URL');
    if (!muxTokenId) console.error('- MUX_TOKEN_ID');
    if (!muxTokenSecret) console.error('- MUX_TOKEN_SECRET');
    if (!muxWebhookSecret) console.error('- MUX_WEBHOOK_SECRET');
    process.exit(1);
  }

  try {
    console.log('Starting Mux backfill...');

    const muxSync = new MuxSync({
      databaseUrl,
      muxTokenId,
      muxTokenSecret,
      muxWebhookSecret,
    });

    // Backfill all data
    const result = await muxSync.syncBackfill({ object: 'all' });

    console.log('Backfill completed successfully:', result);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  }
}

runBackfill();