# ForgeAI

An AI-assisted software delivery tool: it turns a requirement into a validated analysis and a draft implementation plan, grounded in a connected GitHub repository. Every AI output is schema-validated before it is stored.

## Status

Milestones 5B and 6 are complete; the public-repository PR flow was validated with a merged PR. Phase 3 Repository Intelligence is complete: Gemini Embedding 2, pgvector storage, hybrid semantic and keyword retrieval, and repository search. Existing repositories must be re-indexed after applying migrations. Next planned work: Phase 9, the Code Reviewer.

## Stack

Next.js (App Router), TypeScript, Tailwind, shadcn/ui, PostgreSQL with Drizzle, Auth.js (GitHub), Zod, Vitest.

## Setup

1. Install dependencies and start Postgres:

```bash
   npm install
   docker compose up -d
```

2. Copy the environment template and fill it in:

```bash
   cp .env.example .env.local
```

Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `NEXTAUTH_SECRET`, and the AI settings below. 3. Apply migrations and run:

```bash
   npm run db:migrate
   npm run dev
```

## AI provider

Set in `.env.local`:

| Variable           | Purpose                                                    |
| ------------------ | ---------------------------------------------------------- |
| `AI_PROVIDER`      | `gemini` or `groq`                                         |
| `AI_API_KEY`       | Provider API key                                           |
| `AI_MODEL`         | Model id, for example `openai/gpt-oss-20b` on Groq         |
| `AI_BASE_URL`      | Optional, overrides the Groq endpoint                      |
| `AI_STRICT_SCHEMA` | Set to `false` to disable strict structured output on Groq |
| `EMBEDDING_API_KEY` | Google AI Studio key for Gemini Embedding 2; optional when `AI_PROVIDER=gemini` because `AI_API_KEY` is reused |

Repository snippets are redacted for secrets before they are sent to AI providers. Embeddings use Gemini Embedding 2 at 768 dimensions. Free tiers may use prompts to improve providers' products, so use public repositories only. Re-import a repository from its detail page to build or refresh its semantic index.

## Scripts

`npm run dev`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run db:generate`, `npm run db:migrate`, `npm run db:studio`.

## Design notes

See `docs/decisions/`.
