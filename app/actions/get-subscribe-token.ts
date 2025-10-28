"use server";

import { inngest } from "@/app/lib/inngest/client";
import { searchJobChannel } from "@/app/lib/inngest/channels";
import { getSubscriptionToken, Realtime } from "@inngest/realtime";

export type SearchJobChannelToken = Realtime.Token<
  ReturnType<typeof searchJobChannel>,
  ["videos", "clips", "error"]
>;

export async function fetchRealtimeSubscriptionToken(
  jobId: string
) {
  console.log(`[Server Action] Generating subscription token for jobId: ${jobId}`);
  console.log(`[Server Action] Channel: search:${jobId}`);
  console.log(`[Server Action] Topics: ["videos", "clips", "error"]`);

  try {
    // Create a token that allows subscribing to all topics for this search job
    const token = await getSubscriptionToken(inngest, {
      channel: searchJobChannel(jobId),
      topics: ["videos", "clips", "error"],
    });

    console.log(`[Server Action] ✅ Token generated successfully for jobId: ${jobId}`);

    return token;
  } catch (error) {
    console.error(`[Server Action] ❌ Failed to generate token for jobId: ${jobId}`, error);
    throw error;
  }
}
