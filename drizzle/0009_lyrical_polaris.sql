CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "code_chunks" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
ALTER TABLE "code_chunks" ADD COLUMN "embedding_model" text;--> statement-breakpoint
CREATE INDEX "code_chunks_embedding_hnsw_idx" ON "code_chunks" USING hnsw ("embedding" vector_cosine_ops) WHERE "code_chunks"."embedding" is not null;
