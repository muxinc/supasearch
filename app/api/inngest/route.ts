import { serve } from "inngest/next";
import { inngest } from "@/app/lib/inngest/client";
import { searchVideoJob } from "@/app/lib/inngest/functions/search";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [searchVideoJob],
});
