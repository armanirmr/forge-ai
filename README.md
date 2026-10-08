# ForgeAI

An AI-assisted software delivery tool: it turns a requirement into a validated analysis and a draft implementation plan, grounded in a connected GitHub repository. Every AI output is schema-validated before it is stored.

## Status

Milestone 5B complete. Milestone 6 implementation is in progress: approved edits can be published as a pull request to a public GitHub repository after current verification, edit hash, permission, and remote-file checks. ForgeAI never merges the PR. Embeddings are not implemented.

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

Repository snippets are redacted for secrets before they are sent to the provider. Free tiers may use prompts to improve the provider's products, so use public repositories only.

## Scripts

`npm run dev`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run db:generate`, `npm run db:migrate`, `npm run db:studio`.

## Design notes

See `docs/decisions/`.
