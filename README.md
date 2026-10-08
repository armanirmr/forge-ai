# Changeweft

Changeweft turns a software requirement into a repository-grounded, reviewable change. It guides a developer through analysis, planning, code generation, isolated verification, repair, human review, and (after explicit approval) pull request creation. Generated output is validated before it becomes workflow state; AI review is advisory and never approves or blocks a change.

## Current project status

The repository records Milestones 5B and 6 as complete, including an advisory AI change review and a public-repository pull request flow that was validated with a merged PR. Repository Intelligence (Phase 3) uses Gemini Embedding 2 and pgvector for hybrid semantic and keyword search. Phase 9 adds advisory security, code, and architecture review with limited indexed repository context. Phase 12 provides read-only workflow analytics.

Recent product work improves workflow control and recovery: users can stop an active run at a safe checkpoint, retry a failed requirement analysis, and archive or restore workflows while keeping their history. Workflow and repository screens show stage and elapsed time, and analytics includes custom date ranges with calendar inputs, chart explanations, and themed data-point tooltips. A shared navigation header, light/dark theme toggle, provider-cooldown countdown and completion sound, and repository cards with GitHub and Changeweft metrics round out the workspace experience.

## Product capabilities

- GitHub OAuth sign-in, repository import, file indexing, and re-indexing.
- Requirement analysis grounded in repository retrieval, followed by a draft implementation plan with human review and approval.
- Validated code edits, verification in an isolated Docker environment, and a bounded repair loop.
- A review view with explicit human approval or rejection; AI change review remains an opinion.
- Pull request creation only after approval and current verification. Changeweft does not merge pull requests.
- Gemini Embedding 2 (768 dimensions), pgvector, and hybrid semantic/keyword repository search.
- Workflow analytics for AI calls and tokens, repairs, generated test-file paths, test executions, workflow states, approval duration, and approval rate. Definitions and limitations are in [decision 0011](docs/decisions/0011-workflow-analytics.md).
- Analytics date filters for the last 30 days, last 90 days, last 12 months, or a custom inclusive calendar range; chart points provide themed hover and keyboard-focus tooltips.
- Workflow detail screens that make the current stage, wait duration, and next action clear while keeping detailed evidence available on demand.
- Workflow controls to cancel active runs at a safe checkpoint and retry failed requirement analysis, with retry activity recorded in the workflow timeline.
- Workflow archive and restore controls that preserve workflow history.
- Branded recovery pages for unexpected errors, missing pages, repository workspaces, and workflow details, with clear retry and navigation actions.
- First-run AI setup that guides signed-in users through chat-provider and repository-embedding credentials before repository features that depend on them.
- Per-account AI settings for Gemini, Groq, OpenAI, and Anthropic chat adapters, with encrypted credentials and a separate Gemini Embedding 2 key when needed.
- Per-account repository ownership: repository pages, workflows, server actions, pull requests, and analytics are scoped to the signed-in GitHub account.

## Stack

Next.js App Router, TypeScript, React, Tailwind CSS, shadcn/ui, PostgreSQL with pgvector, Drizzle ORM, Auth.js (GitHub), Zod, and Vitest.

## Local setup

Prerequisites: Node.js/npm, Docker Desktop, a GitHub OAuth application, and an AI provider key. The Docker database binds to port **5433** to avoid the default local PostgreSQL port.

1. Install dependencies and start PostgreSQL:

   ```powershell
   npm install
   docker compose up -d
   ```

2. Copy `.env.example` to `.env.local` and fill in the required values. In PowerShell:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   Set `DATABASE_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `NEXTAUTH_SECRET`, and `NEXTAUTH_URL`. `AI_PROVIDER`, `AI_API_KEY`, and `AI_MODEL` are optional server defaults; signed-in users can configure their own supported provider keys in Settings. The GitHub OAuth callback for local development is `http://localhost:3000/api/auth/callback/github`.

3. Apply database migrations and start the app:

   ```powershell
   npm run db:migrate
   npm run dev
   ```

4. Sign in, import a repository, and open its workspace to search the index or submit a requirement. Re-import/re-index repositories that predate semantic embeddings so their chunks receive vectors.

Never commit `.env.local`, provider keys, OAuth secrets, or access tokens. Use public or throwaway repositories when experimenting with free-tier AI providers; provider privacy and quotas vary.

## AI provider configuration

`lib/ai/config.ts` supports Gemini, Groq, OpenAI, and Anthropic for chat. Groq and OpenAI use the OpenAI-compatible adapter; Anthropic uses its Messages API with structured JSON outputs. Signed-in users can save their chat provider, model, and API key at `/settings`; account settings override the optional server defaults below. ChatGPT subscriptions do not include OpenAI API usage, which has separate API billing. Strict schema output can be disabled for compatible providers with `AI_STRICT_SCHEMA=false`; application validation always remains enabled. Repository imports and semantic search always use Gemini Embedding 2, so Groq, OpenAI, and Anthropic users need a Google AI Studio embedding key unless the server has one configured. A Gemini chat key can be reused for embeddings. Credentials saved in the UI are encrypted at rest; see [security notes](docs/security.md).

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | `gemini`, `groq`, `openai`, or `anthropic` |
| `AI_API_KEY` | Key for the configured chat provider |
| `AI_MODEL` | Provider model identifier |
| `AI_BASE_URL` | Optional OpenAI-compatible endpoint override |
| `AI_STRICT_SCHEMA` | Optional provider-level strict schema setting; application validation remains enabled |
| `EMBEDDING_API_KEY` | Google AI Studio key for Gemini Embedding 2; optional when Gemini chat key reuse applies |
| `AI_TPM_LIMIT` | Local provider pacing token-per-minute budget |
| `AI_OUTPUT_RESERVE_TOKENS` | Output allowance reserved by the pacing calculation |

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Serve a production build |
| `npm run typecheck` | Run TypeScript checks |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest once |
| `npm run db:generate` | Generate a Drizzle migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Open Drizzle Studio |

## Architecture and operating constraints

- AI provider adapters return unvalidated output. `runAgent` owns schema and semantic validation; do not store raw model output as application state.
- Repository content is untrusted and may be partial or stale. Secret redaction runs before code context is sent to providers.
- Approval is a human boundary. AI review, successful verification, and PR creation do not replace the human decision; Changeweft never merges.
- The UI reports request elapsed time and recorded workflow stages. It does not claim token streaming or percentage completion because the server does not provide that information.
- Repositories imported before the ownership migration can be restored by the verified GitHub owner; see [security notes](docs/security.md).
- See [security notes](docs/security.md), [AI workflows](docs/ai-workflows.md), [architecture](docs/architecture.md), and [decision records](docs/decisions/) for detail.

## Project documentation

See [architecture](docs/architecture.md), [AI workflows](docs/ai-workflows.md), [security notes](docs/security.md), and the [architecture decision records](docs/decisions/) for maintained project documentation.
