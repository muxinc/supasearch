import { NextRequest, NextResponse } from "next/server";
import { searchVideosWithReranking } from "@/app/db/videos";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");

  if (!query || !query.trim()) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchVideosWithReranking(query);
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Failed to search videos" },
      { status: 500 },
    );
  }
}
