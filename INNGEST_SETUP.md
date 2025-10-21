# Inngest Multi-Step Search Implementation

The search functionality has been converted to use Inngest for multi-step asynchronous processing.

## Architecture

The search process is now broken down into 3 distinct steps:

1. **Create Embedding** - Generates a vector embedding for the user's query
2. **Run Retrieval Query** - Searches the video database using the embedding
3. **Re-rank Results** - Uses GPT-5 to intelligently rank and filter results

## Files Created/Modified

### New Files

- `app/lib/inngest/client.ts` - Inngest client configuration
- `app/lib/inngest/functions/search.ts` - Multi-step search function
- `app/lib/jobStore.ts` - In-memory job result storage
- `app/api/inngest/route.ts` - Inngest webhook endpoint
- `app/api/search/status/route.ts` - Job status polling endpoint

### Modified Files

- `app/api/search/route.ts` - Now triggers Inngest job instead of running synchronously

## How It Works

### 1. Trigger Search Job

```typescript
// GET /api/search?q=query
// Returns: { jobId, status: "processing" }
// Note: jobId is the Inngest event ID
```

### 2. Poll for Status

```typescript
// GET /api/search/status?jobId=xxx
// Returns: { status, progress?, results?, error? }
```

### 3. Job Execution

The Inngest function runs in the background and uses `event.id` as the jobId:
- Step 1: Creates embedding (progress: 1/3)
- Step 2: Retrieves video chunks (progress: 2/3)
- Step 3: Re-ranks with AI (progress: 3/3)
- Final: Stores results in job store with Inngest event ID as the key

## Local Development

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Inngest Dev Server

```bash
npx inngest-cli@latest dev
```

This starts the Inngest development server at `http://localhost:8288`

### 3. Start Next.js Dev Server

```bash
npm run dev
```

### 4. Test the Search

The Inngest Dev Server UI will show:
- All triggered events
- Function execution progress
- Step-by-step logs
- Any errors that occur

## Environment Variables

Required:
- `SUPABASE_URL` - Your Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for Supabase
- `OPENAI_API_KEY` - OpenAI API key for embeddings and GPT-5

## Production Deployment

### Inngest Cloud

1. Sign up at https://inngest.com
2. Get your signing key from the dashboard
3. Set environment variable:
   ```
   INNGEST_SIGNING_KEY=your-signing-key
   INNGEST_EVENT_KEY=your-event-key
   ```
4. Deploy your Next.js app
5. Register your app with Inngest:
   - URL: `https://yourdomain.com/api/inngest`

### Alternative: Self-Hosted Redis

For production without Inngest Cloud, replace `jobStore.ts` with Redis:

```typescript
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN,
})

export const jobStore = {
  async set(jobId: string, data: JobData) {
    await redis.setex(jobId, 600, JSON.stringify(data)) // 10 min TTL
  },
  async get(jobId: string) {
    const data = await redis.get(jobId)
    return data ? JSON.parse(data as string) : undefined
  },
  // ... etc
}
```

## Frontend Integration

Update your frontend to poll for results:

```typescript
async function search(query: string) {
  // Start job
  const { jobId } = await fetch(`/api/search?q=${query}`).then(r => r.json())

  // Poll for results
  const pollInterval = setInterval(async () => {
    const status = await fetch(`/api/search/status?jobId=${jobId}`).then(r => r.json())

    if (status.status === 'completed') {
      clearInterval(pollInterval)
      displayResults(status.results)
    } else if (status.status === 'failed') {
      clearInterval(pollInterval)
      displayError(status.error)
    } else if (status.progress) {
      updateProgress(status.progress)
    }
  }, 1000) // Poll every second
}
```

## Benefits

1. **Non-blocking** - Search doesn't tie up server resources
2. **Observable** - Each step is logged and trackable
3. **Resumable** - If a step fails, Inngest can retry
4. **Progress Updates** - Users can see which step is running
5. **Scalable** - Inngest handles job queuing and concurrency
