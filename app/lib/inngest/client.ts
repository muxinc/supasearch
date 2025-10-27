import { Inngest } from "inngest";
import { realtimeMiddleware } from "@inngest/realtime/middleware";

export const inngest = new Inngest({
  id: "mux-search",
  name: "Mux Video Search",
  middleware: [realtimeMiddleware()]
});
