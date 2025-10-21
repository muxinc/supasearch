// Type definitions for Supabase Edge Functions (Deno runtime)
declare namespace Deno {
  export function serve(
    handler: (request: Request) => Response | Promise<Response>
  ): void;
}
