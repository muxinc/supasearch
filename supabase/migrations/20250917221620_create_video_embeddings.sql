-- Enable the "vector" extension for embeddings
create extension vector
with
  schema extensions;

-- Videos table for metadata (no embeddings here)
create table public.videos (
  id uuid not null default gen_random_uuid() primary key,
  title text,
  description text,
  transcript_en_text text,
  transcript_en_vtt text,
  mux_asset_id text not null,
  playback_id text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Video chunks table for searchable segments with embeddings
create table public.video_chunks (
  id uuid not null default gen_random_uuid() primary key,
  video_id uuid not null references public.videos(id) on delete cascade,
  chunk_index integer not null,
  chunk_text text not null,
  start_time numeric not null, -- seconds with decimal precision
  end_time numeric not null,   -- seconds with decimal precision
  embedding vector(1536),      -- OpenAI text-embedding-3-small
  created_at timestamp with time zone default now()
);

alter table public.videos enable row level security;
alter table public.video_chunks enable row level security;

-- Indexes
CREATE UNIQUE INDEX idx_videos_mux_asset_id ON public.videos USING btree (mux_asset_id);
CREATE INDEX idx_video_chunks_video_id ON public.video_chunks USING btree (video_id);
CREATE INDEX idx_video_chunks_times ON public.video_chunks USING btree (start_time, end_time);
CREATE UNIQUE INDEX idx_video_chunks_unique ON public.video_chunks USING btree (video_id, chunk_index);
