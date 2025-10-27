import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { inngest } from "@/app/lib/inngest/client";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");
  const searchId = searchParams.get("searchId");

  if (!query || !query.trim()) {
    return NextResponse.json({ results: [] });
  }

  if (!searchId || !searchId.trim()) {
    return NextResponse.json(
      { error: "searchId is required" },
      { status: 400 },
    );
  }

  try {
    console.log(`[Search API] Starting job with searchId: ${searchId}`);

    // Trigger the Inngest job with the client-provided searchId
    await inngest.send({
      name: "search/videos.requested",
      data: {
        query,
        searchId,
      },
    });

    console.log(`[Search API] Job started with searchId: ${searchId}`);

    return NextResponse.json({
      searchId,
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
