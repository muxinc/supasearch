import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { inngest } from "@/app/lib/inngest/client";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");

  if (!query || !query.trim()) {
    return NextResponse.json({ results: [] });
  }

  try {
    // Trigger the Inngest job
    const { ids } = await inngest.send({
      name: "search/videos.requested",
      data: {
        query,
      },
    });

    const jobId = ids[0];
    console.log(`[Search API] Started job with ID: ${jobId}`);

    // Return the Inngest event ID so the client can poll for results
    return NextResponse.json({
      jobId,
      status: "processing",
      message: "Search job started",
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Failed to start search job" },
      { status: 500 },
    );
  }
}
