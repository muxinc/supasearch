## Getting Started

> Make sure you've added all .env vars required before proceeding

### Requirements

- Docker desktop
- Deno `curl -fsSL https://deno.land/install.sh | sh`

### Install dependencies

`npm install`

and

`deno install`

### Serving the application

First, start the Supabase database.

```bash
npx supabase start
```

If this is your first time running this command, your container layers will download. This takes a second, so go grab some water - you're dehydrated.


Next, open a new terminal tab and serve your Supabase functions locally:

```bash
npx supabase functions serve
```

Next, open a third tab and start the Inngest queue server:

```bash
npx inngest-cli@latest dev
```

Finally, run the Next.js development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.


## Seeding the database
```bash
npm run mux-backfill
```

## Create the video embeddings
This will run the createEmbedding function for each asset in our database

```bash
npm run videos-backfill-existing # All assets
npm run videos-backfill-missing  # Only assets with missing embeddings
```