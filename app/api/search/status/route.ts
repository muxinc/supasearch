import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jobStore } from "@/app/lib/jobStore";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
  }

  const jobData = jobStore.get(jobId);

  console.log(`[Status Check] jobId: ${jobId}, data:`, jobData);

  if (!jobData) {
    return NextResponse.json(
      { status: "processing", message: "Job is still processing" },
      { status: 200 },
    );
  }

  return NextResponse.json(jobData);
}
