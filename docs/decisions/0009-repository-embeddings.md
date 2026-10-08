# 0009: Gemini embeddings and pgvector repository search

## Decision

- Use `gemini-embedding-2` with 768 dimensions for code and query embeddings. The dimension is fixed in code and the schema so vectors in one index remain comparable.
- Keep embedding credentials independent from the chat provider. `EMBEDDING_API_KEY` is preferred; `AI_API_KEY` can be reused when `AI_PROVIDER=gemini`.
- Prefix code-search queries with `task: code retrieval | query:` and embed each chunk as a separate titled `Content` object. Redact obvious secrets before sending source chunks to Gemini.
- Store nullable vectors and the model identifier on `code_chunks`; the nullable column lets existing repository indexes continue working until they are re-imported.
- Use a partial HNSW cosine index for embedded chunks. Search combines vector ranking with keyword and path matches using reciprocal rank fusion.
- Re-import replaces the repository index only after GitHub fetch and embedding generation both succeed. Limit one import to 10,000 chunks to avoid unbounded provider calls.
- Keep the repository file tree and existing keyword retrieval as complementary signals. Semantic search is available both to workflow context retrieval and as a direct repository search.

## Operational notes

- Apply the Drizzle migration before using the new vector column.
- Re-import existing repositories to populate embeddings; old chunks without vectors remain visible to keyword search but do not appear in semantic retrieval.
- Changing the embedding model requires re-embedding the complete index before switching query embeddings to the new model.
