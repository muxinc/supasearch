import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { searchWorkflow } from "@/app/lib/workflow/search";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");

  if (!query || !query.trim()) {
    return NextResponse.json({ results: [] });
  }

  try {
    const run = await start(searchWorkflow, [query]);

    return new Response(run.readable, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Failed to start search" },
      { status: 500 },
    );
  }
}
