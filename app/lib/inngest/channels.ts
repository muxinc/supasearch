import { channel, topic } from "@inngest/realtime";
import { z } from "zod";
import type { VideoSearchResult } from "@/app/db/videos";

// Channel for each search job
// Usage: searchJobChannel(jobId)
export const searchJobChannel = channel((jobId: string) => `search:${jobId}`)
  // Initial video results (without clips)
  .addTopic(
    topic("videos").schema(
      z.object({
        videos: z.array(z.any()), // VideoSearchResult but without full type due to complexity
        status: z.enum(["initial", "processing", "completed"]),
      })
    )
  )
  // Individual clip results
  .addTopic(
    topic("clips").schema(
      z.object({
        videoId: z.string(),
        clips: z.array(
          z.object({
            start_time_seconds: z.number(),
            end_time_seconds: z.number(),
            snippet: z.string(),
            relevance: z.enum(["exact", "related"]),
          })
        ),
      })
    )
  )
  // Errors
  .addTopic(
    topic("error").schema(
      z.object({
        videoId: z.string().optional(),
        message: z.string(),
      })
    )
  );
