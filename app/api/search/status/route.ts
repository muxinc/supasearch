import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jobStore } from "@/app/lib/jobStore";

const INNGEST_API_URL = process.env.INNGEST_API_URL || "http://127.0.0.1:8288";
const INNGEST_SIGNING_KEY = process.env.INNGEST_SIGNING_KEY;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const runId = searchParams.get("jobId");

  if (!runId) {
    console.warn("[SearchStatus] Missing jobId param");
    return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
  }

  try {
    // Query Inngest API for runs associated with this event ID
    const url = `${INNGEST_API_URL}/v1/events/${runId}/runs`;
    console.log(`[Status Check] Querying Inngest API for event: ${runId}`);
    console.log(`[Status Check] URL: ${url}`);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Only add auth header in production
    if (INNGEST_SIGNING_KEY) {
      headers.Authorization = `Bearer ${INNGEST_SIGNING_KEY}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[SearchStatus] Inngest API error status=${response.status} runId=${runId}: ${errorText}`,
      );
      return NextResponse.json(
        { status: "processing", message: "Job is still processing" },
        { status: 200 },
      );
    }

    const data = await response.json();
    console.log(
      `[SearchStatus] Received ${data.data?.length ?? 0} runs for ${runId}`,
    );

    // Check if we have any runs
    if (!data.data || data.data.length === 0) {
      console.log(`[SearchStatus] No runs found for ${runId}, still processing`);
      return NextResponse.json(
        { status: "processing", message: "Job is still processing" },
        { status: 200 },
      );
    }

    const run = data.data[0];
    console.log(
      `[SearchStatus] Run status for ${runId}: ${run.status} (hasOutput=${Boolean(run.output)})`,
    );

    // Map Inngest status to our status
    if (run.status === "Completed") {
      // Try to get output from the run
      const output = run.output;
      console.log(
        `[SearchStatus] Run ${runId} completed with ${output?.results?.length ?? 0} results`,
      );

      const jobData = jobStore.get(runId);
      const results = output?.results ?? jobData?.results ?? [];
      const progress = jobData?.progress;

      return NextResponse.json({
        status: "completed",
        results,
        progress,
      });
    }

    if (run.status === "Failed") {
      console.error(`[SearchStatus] Run ${runId} failed: ${run.error}`);
      return NextResponse.json({
        status: "failed",
        error: run.error || "Job failed",
      });
    }

    // Still running - check jobStore for partial results
    const jobData = jobStore.get(runId);
    console.log(
      `[SearchStatus] Run ${runId} still processing (cached results=${jobData?.results?.length ?? 0})`,
    );
    return NextResponse.json({
      status: "processing",
      message: "Job is still processing",
      results: jobData?.results || [],
      progress: jobData?.progress,
    });
  } catch (error) {
    console.error(
      `[SearchStatus] Error querying Inngest for ${runId}: ${String(error)}`,
    );

    // Even on error, try to return partial results from jobStore
    const jobData = jobStore.get(runId);
    console.log(
      `[SearchStatus] Falling back to jobStore for ${runId} (cached results=${jobData?.results?.length ?? 0})`,
    );
    return NextResponse.json(
      {
        status: "processing",
        message: "Job is still processing",
        results: jobData?.results || [],
        progress: jobData?.progress,
      },
      { status: 200 },
    );
  }
}
