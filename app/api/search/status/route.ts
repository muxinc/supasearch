import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const INNGEST_API_URL = process.env.INNGEST_API_URL || "http://127.0.0.1:8288";
const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const runId = searchParams.get("jobId");

  if (!runId) {
    return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
  }

  try {
    // Query Inngest API for run status
    const url = `${INNGEST_API_URL}/v1/events/${runId}/runs`;
    console.log(`[Status Check] Querying Inngest API: ${url}`);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Only add auth header in production
    if (INNGEST_EVENT_KEY) {
      headers.Authorization = `Bearer ${INNGEST_EVENT_KEY}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.error(`[Status Check] Inngest API error: ${response.status}`);
      return NextResponse.json(
        { status: "processing", message: "Job is still processing" },
        { status: 200 },
      );
    }

    const data = await response.json();
    console.log(`[Status Check] runId: ${runId}, response:`, JSON.stringify(data, null, 2));

    // Check if we have any runs
    if (!data.data || data.data.length === 0) {
      return NextResponse.json(
        { status: "processing", message: "Job is still processing" },
        { status: 200 },
      );
    }

    const run = data.data[0];

    // Map Inngest status to our status
    if (run.status === "Completed") {
      // Try to get output from the run
      const output = run.output;
      return NextResponse.json({
        status: "completed",
        results: output?.results || [],
      });
    }

    if (run.status === "Failed") {
      return NextResponse.json({
        status: "failed",
        error: run.error || "Job failed",
      });
    }

    // Still running
    return NextResponse.json({
      status: "processing",
      message: "Job is still processing",
    });
  } catch (error) {
    console.error("[Status Check] Error querying Inngest:", error);
    return NextResponse.json(
      { status: "processing", message: "Job is still processing" },
      { status: 200 },
    );
  }
}
