-- RPC function for vector search of video chunks
create or replace function match_video_chunks(
  query_embedding vector(1536),
  similarity_threshold float default 0.5,
  match_count int default 10
)
returns table (
  chunk_id uuid,
  video_id uuid,
  mux_asset_id text,
  playback_id text,
  title text,
  description text,
  chunk_text text,
  start_time numeric,
  end_time numeric,
  similarity float
)
language sql stable
as $$
  select
    vc.id as chunk_id,
    v.id as video_id,
    v.mux_asset_id,
    v.playback_id,
    v.title,
    v.description,
    vc.chunk_text,
    vc.start_time,
    vc.end_time,
    1 - (vc.embedding <-> query_embedding) as similarity
  from video_chunks vc
  join videos v on vc.video_id = v.id
  where vc.embedding is not null
    and 1 - (vc.embedding <-> query_embedding) > similarity_threshold
  order by vc.embedding <-> query_embedding
  limit match_count;
$$;