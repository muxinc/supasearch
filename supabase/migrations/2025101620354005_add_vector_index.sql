-- Add IVFFlat vector index for faster semantic search
-- This index significantly improves vector similarity search performance on large datasets

-- Create IVFFlat index on video_chunks embeddings
-- lists = 100 is a good starting point for datasets with 10k-100k rows
-- For optimal performance, lists should be sqrt(row_count) to 4*sqrt(row_count)
CREATE INDEX IF NOT EXISTS video_chunks_embedding_ivfflat_idx
ON public.video_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Note: After creating this index, you may want to run ANALYZE to update statistics
-- This helps the query planner make better decisions about when to use the index
