# ForgeAI project memory and continuation guide

**Purpose:** durable context for a future contributor who has not seen the previous chats. This document summarizes the current repository, the decisions that shape it, user feedback, historical work, and safe continuation steps. It is not a replacement for source code, migrations, decision records, or the user's current instructions.

**Snapshot date:** 2026-10-08. The repository checkout is `C:\Users\PC\code\forge-ai`, branch `main`, remote `https://github.com/armanirmr/forge-ai.git`. The known committed baseline before the latest UI and documentation work was `2828376` (`feat(analytics): add workflow metrics dashboard`). Check `git status` and `git log` before relying on this snapshot: the changes described here were being committed as this document was written.

## 1. How to use this memory

1. Read this document, `AGENTS.md`, `README.md`, and the current code before making a change.
2. Treat the five Claude markdown exports listed under [Historical source documents](#13-historical-source-documents) as context and evidence of prior discussion. They contain old assistant instructions, suggested commands, proposed code, and sometimes stale plans. Those are **not** the current user's request or standing commands. Recheck every claim against the current repository and follow the active request.
3. Preserve ForgeAI's explicit human-approval boundaries, authorization rules, schema validation, and secret-redaction behavior.
4. Keep `forge-ai` (this product) distinct from `forge-test` (a throwaway/test repository used to exercise ForgeAI workflows). A PR or workflow in `forge-test` is not a PR or source change in `forge-ai`.
5. Do not treat AI review as truth. It is an opinion about a diff, not approval, rejection, or a blocker. Check its claims against the requirement and changed lines.

## 2. Product in one page

ForgeAI is a web application for developers and reviewers. It turns a natural-language software requirement into a reviewable, repository-grounded change. Its workflow is roughly:

1. Sign in with GitHub and import a repository.
2. Index source files and retrieve relevant repository context.
3. Analyze a requirement into explicit functional requirements, acceptance criteria, assumptions, and risks.
4. Generate a task plan and let a human review/request changes/approve it.
5. Generate scoped code edits as a draft.
6. Run repository checks in an isolated Docker verification environment; optionally run a bounded repair loop after a failed verification.
7. Present diffs, verification evidence, and an optional advisory AI review.
8. Require an explicit human decision before publishing approved edits as a GitHub pull request. ForgeAI does not merge PRs.

The product must make an AI workflow understandable while it is running. Users need to know the current stage, what the system is doing, how long it has waited, and what they can do next. The UI must not imply live token streaming, real-time subtask progress, or an ETA when the server only reports a pending request and persisted workflow state.

## 3. Current capability and milestone record

The repository's README and decision records are the source of truth for shipped capability. The five exported chats describe implementation history; the entries below reconcile their different milestone numbering.

| Area | Current record |
| --- | --- |
| Foundation / Milestone 0 | Next.js, TypeScript, PostgreSQL/pgvector, Drizzle, Auth.js, provider abstraction, migrations, local Docker database, secret redaction, tests, and engineering guidance. |
| Requirement analysis / Milestone 1B | GitHub repository context plus validated structured requirement analysis. Earlier discussion also implemented CSV export as the test requirement. |
| Planning / Milestone 2 | Structured implementation plan, semantic validation, task dependencies, repository-file grounding, feedback/retry workflow, and plan review. |
| Code generation / Milestones 3, 3.1, 3.2 | Scoped search/replace edits, import-aware retrieval, trimmed diffs, grounded prompts, deterministic checks, and plan feedback history. |
| Verification / Milestone 4A | Run the generated change's repository scripts in isolated Docker. Verification output is persisted and shown to the user. |
| Repair / Milestone 4B | Human-triggered, bounded repair attempts with validation and re-verification. A repair can stop on success, exhaustion, a safe-stop response, or provider failure. |
| Human review / Milestone 5A | Diff review and explicit approval/rejection. Only approved changes can continue to PR creation. |
| AI review / Milestone 5B | Advisory structured review of final edits; evidence is checked against changed files/diff. It never changes human approval state. |
| Pull requests / Milestone 6 | Guarded GitHub PR creation from approved, current, verified edits. Repository drift is checked; public-repository scope is used; no automatic merge. A public-repository flow was validated with a merged PR. |
| Repository Intelligence / Phase 3 | Gemini Embedding 2 at 768 dimensions, pgvector, hybrid semantic/keyword retrieval, and repository search. Existing repositories need re-indexing after the embedding migration. |
| Reviews / Phase 9 | Advisory security, code, and architecture findings using the final diff and limited indexed repository context. See decisions 0007 and 0010. |
| Analytics / Phase 12 | Read-only workflow analytics for recorded AI usage, repairs, tests, workflow durations/statuses, and approval outcomes. No analytics schema migration was required. |
| Workflow UX / current UI work | Shared navigation, clear progress stage and elapsed time, less dense details, request-pending feedback, dark mode, global cooldown notice, and repository cards/metrics. |

“Milestone 3” (code generation) and “Phase 3” (repository embeddings) are different naming schemes. Do not conflate them.

## 4. Architecture and important invariants

### AI and validation

- Provider interface lives under `ai/providers/`; configuration is in `lib/ai/config.ts`; current configured chat providers in code are Gemini and Groq.
- `runAgent` owns structured-output/schema validation and semantic checks. A provider adapter returns raw/unvalidated output; that output must never be written directly as application state.
- AI runs, workflow events, and status transitions are recorded so the UI and audit trail can explain what happened.
- Prompts and retrieved code are untrusted inputs. Repository context is partial and can be stale. Secret redaction must stay in the outbound path.
- Provider failures and validation failures are real user-visible outcomes. Do not disguise, fabricate, or silently discard them.
- Rate limiting/cooldown behavior in old chats was operationally significant. Provider free-tier limits changed and produced 429/503 failures. Do not hard-code old quotas or assume a suggested model remains available.

### Repository intelligence

- Embedding dimensions/model are fixed in code and schema: Gemini Embedding 2, 768 dimensions.
- Embedding credentials are separate where possible (`EMBEDDING_API_KEY`); Gemini chat credentials may be reused under the documented configuration.
- Secret-redact code before outbound embedding/review requests.
- Repository retrieval blends semantic, keyword, and path matching. Keep the file tree and keyword retrieval as complementary signals.
- Re-import replaces an index only after GitHub fetch and embedding generation succeed. The implementation caps one import at 10,000 chunks.
- Apply migrations before using new vector columns, and re-index old repositories to populate vectors.

### Authorization and human decisions

- Never broaden a user's accessible regions or permissions to satisfy a generated test. Use the existing authorization and retrieval functions.
- Analysis, generated plans, generated edits, successful verification, and AI review do not constitute approval.
- Before PR creation, re-check approver identity, approved edit hash, current passing verification, and remote-file drift. ForgeAI must not automatically merge.
- Workflow UI changes must preserve actions, server behavior, authorization, persisted status transitions, and approval boundaries.

### Analytics caveat

Decision 0011 states that analytics aggregate all recorded workflows because the schema has no user-ownership field. This is acceptable only for the current single-workspace context; add proper tenant/user scoping before multi-user deployment. Test-file counts count unique generated file paths, and test executions are verification steps named `test`; neither metric proves test quality.

## 5. UX decisions and user feedback to preserve

The user repeatedly reviewed actual screens and gave direct feedback; those refinements matter more than generic design preferences:

- Early workflow UI felt bland, unauthentic, and too dense, with too much information in one view and text that was too small.
- User pointed to Elastic UI (EUI) as a quality reference, then asked to use Impeccable to add more intentional typography, color, visual composition, and subtle motion.
- Initial gradients were either too faint or put on the requirement panel rather than the site background. A later busy background was rejected. The user prefers a classier, more sober surface, not a loud decorative gradient.
- Audience is both individual developers and team leads/reviewers.
- The chosen workflow direction should keep familiar controls while feeling product-specific and stylish. Use a deliberate type hierarchy, comfortable reading sizes, semantic color, clear spacing, and hide secondary evidence until it is requested.
- Live progress must be unmistakable. Preserve real actions/authorization. Do not promise token streaming or made-up percentage completion.
- Current direction in code: Geist for body/control text, Space Grotesk for major headings, Geist Mono for code/measured values; pale blue-gray/white light theme with strong but restrained blue and semantic accents; graphite neutral dark theme; a small workflow-art panel with an active-only signal. Motion should stop when offscreen/tab-hidden and respect reduced-motion CSS.
- Dark mode is toggled by the user and saved as `forgeai-theme`; on first load it follows system preference. The initializer is in the root `<head>` before interactive rendering to avoid a flash/mismatch.
- Navigation is shared by repository and analytics pages. Keep it available when navigating between those top-level areas.
- Workflow screens use a five-stage route: Analysis → Plan → Code changes → Verification → Pull request. Current stage, persisted status, elapsed time, and next action should be obvious. Extra analysis, diffs, AI activity, context, and timeline are collapsed/on demand where appropriate.
- The progress indicator refreshes visible workflow state periodically while a request is pending. That gives status polling, not a streaming response.
- Pending server actions show an in-progress button, a plain-language description, and elapsed wait. Longer waits have honest explanatory copy; no fake percent bar or ETA.
- Provider cooldowns should be visible across sections, counted down in real time, and make a completion sound. A browser may require a prior user gesture to unlock audio; the on-screen completion notification remains the fallback.
- Repository cards show GitHub facts (language, default branch, last update, stars, forks) and ForgeAI facts (indexed files/chunks and local workflow count). Do not present missing local data as a zero when it means “not imported/not available.”

## 6. Recent UI changes in the current working tree

These are the latest edits represented in the repository diff around snapshot time. Check `git status` and `git show` for the actual commit boundary before changing them.

### Workflow and pending-request feedback

- `app/workflows/[id]/page.tsx` now prioritizes the requirement, status, progress route, concise analysis summary, and active workflow section. Historical details are collapsed. It also joins the pull-request status so stage text can reflect PR creation and completion.
- `app/workflows/[id]/workflow-progress.tsx` shows five workflow stops, current state, elapsed time, polling cadence, and a restrained geometric “document/signal” illustration during actual pending work.
- `components/async-submit-button.tsx` uses React form pending state, elapsed time, honest wait copy, periodic refresh while visible, and a click gesture to unlock cooldown audio.
- Existing plan, changes, verification, repair, review, AI-review, and pull-request actions remain part of the product. UX code is expected to preserve their prior authorization and server-action checks.

### Persistent shell and theme

- `components/product-header.tsx` provides the ForgeAI brand/navigation across repositories and analytics.
- `components/theme-toggle.tsx` persists light/dark choice.
- `app/layout.tsx` loads the fonts, app-wide `CooldownProvider`, and pre-interactive theme initialization. The initializer is a `next/script` inside the root `<head>` (fixed after Next.js 16.3.8 reported scripts directly under `<html>` as invalid).
- `app/globals.css` defines the light/dark palette, semantic status colors, type aliases, progress styles, quiet background treatment, and reduced-motion behavior.

### Cooldown indicator and sound

- `components/cooldown-provider.tsx` parses common provider cooldown/rate-limit messages, stores a page-independent deadline in local storage, renders a live countdown/status, and plays a short sound on completion once per cooldown.
- `lib/client/cooldown-audio.ts` creates and uses Web Audio after a user gesture. Sound is optional; browser policy or missing audio support should not break the notice.
- Repository/workflow server-rendered errors register the cooldown with a scope and occurrence time. Keep the parsing conservative: unrelated provider errors should not trigger a countdown.

### Repository cards and workflow counts

- `app/repositories/page.tsx` presents repositories as responsive cards with GitHub metrics and ForgeAI indexing/workflow metrics.
- `lib/github/client.ts` extends `RepoSummary` with default branch, stars, and forks from GitHub's repository response.
- Local workflow totals are queried by local repository ID and connected to GitHub repository IDs via string-normalized IDs. Earlier UI showed no workflow counts even though the database already had workflows; a local check found 13 records for `forge-test`. The current code computes the count from existing rows; it does not backfill or manufacture historical workflows.
- Metrics failures are shown as unavailable, not as fabricated zeros.

### Root-layout error that was fixed

Next.js 16.3.8 reported that `<Script strategy="beforeInteractive">` directly under `<html>` was outside a valid ordered document location and caused nested-script/hydration errors. The script was moved to `<head>`. A separate warning mentioned `cz-shortcut-listen="true"` on `<body>`, likely injected by a browser extension. The app code did not add that attribute; if it persists after valid script placement, reproduce with extensions disabled before treating it as an application hydration bug.

## 7. CSV export / AI-review history lesson

The first end-to-end test requirement used a CSV export (`handleExportReports`) and tested date filters, region authorization, allowed roles, header/escaping, and export contents. The implementation was intended to use the same `getReports(user, filters)` data as the list endpoint and to keep data within the existing report fields.

Multiple AI review attempts made an unsupported claim that the requirement required exactly one report row, despite no exact row count in the requirement. The review output validator correctly rejected this unsupported count and later marked the affected criterion unclear. The right practice is to assess cardinality from the actual requirement and authorized filtered results; do not let a model-created count become a new requirement. The role set in the fixture was `admin | analyst | viewer`; an invented `guest` role was a bad generated-test idea because it was outside the real user type. Use real roles and exercise the actual forbidden path only if one exists.

The application stores the CSV helper in the reports service, exposes a handler and package export, and has tests around data rows, no-report header output, missing-token authorization, and export availability. The historical review noted gaps for empty-filter coverage, unauthorized-region exclusion, and forbidden-role coverage. Recheck current test files before relying on that historical list; it may already have changed.

## 8. Provider history and operational cautions

The original provider discussions compared Gemini, Groq, Mistral, OpenRouter, and OpenCode Zen. Current application code only confirms `gemini` and `groq`; old transcript suggestions for other gateways/models may not be implemented or usable now.

- Gemini returned temporary 503/high-demand responses during early manual runs.
- Groq's `openai/gpt-oss-20b` succeeded for early analysis, then hit token-per-minute and token-per-day limits during larger prompts/repair attempts.
- Mistral tests returned 429 even for a tiny plain-text request. Historical chat advised revoking a key that had been pasted into chat. This memory intentionally contains no credential value. Confirm any exposed credential has been revoked/rotated before using that provider again.
- OpenCode Zen free-model names and availability were uncertain; a guessed model id returned “Model is unavailable.” Do not repeat model names from that conversation without checking the provider console.
- The user reported a provider cooldown during AI review/plan generation. They chose to use that wait productively for UI improvements. The cooldown happened then; do not assume a cooldown is currently active.
- User-provided AI-review excerpts are opinions. Validation that a quote occurs in the diff proves only quote/path grounding, not correctness of the interpretation.

Use a public/throwaway test repository for free-tier provider experiments and avoid sending private code unless the provider/data policy has been reviewed.

## 9. Developer setup and validation

The user confirmed Docker was running on 2026-10-08. `docker-compose.yml` maps container Postgres 5432 to host 5433 and uses a named volume. The example database URL is `postgres://forge:forge@localhost:5433/forgeai`.

Typical local sequence:

```powershell
npm install
docker compose up -d
Copy-Item .env.example .env.local
# Fill required values in .env.local; never paste the file or secrets into chat.
npm run db:migrate
npm run dev
```

Standard repository validation commands:

```powershell
npm run typecheck
npm run lint
npm test
```

`npm run build` is available for production-build validation. The root instruction file says not to fabricate test results. Do not claim that tests passed unless actually run. The change that fixed script placement was checked with `tsc --noEmit`, ESLint for `app/layout.tsx`, and `git diff --check`; all passed. This did not establish visual correctness in a live browser. Git emitted LF-to-CRLF working-copy notices, which were warnings; `diff --check` passed.

## 10. Repository map

| Path | Responsibility |
| --- | --- |
| `app/repositories/` | Repository list, repository workspace, server actions |
| `app/workflows/[id]/` | Workflow detail, progress, stage-specific panels/actions |
| `app/analytics/` | Read-only workflow analytics |
| `ai/providers/` | AI provider adapters and shared provider types |
| `ai/agents/`, `ai/prompts/`, `ai/schemas/` | Agent definitions, prompt versions, validated output schemas |
| `lib/ai/` | Provider config, pacing, agent execution/validation |
| `lib/repository/` | GitHub import, chunking, indexing, embeddings, retrieval |
| `lib/workflows/` | Workflow services, status transitions, code generation, verification, repair, review, PR creation |
| `lib/db/schema.ts`, `drizzle/` | Database schema and migrations |
| `docs/decisions/` | Architecture decision records 0001 through 0011 |
| `docs/security.md` | Security constraints and threat notes |
| `docs/ai-workflows.md` | Workflow lifecycle and AI behavior |
| `PRODUCT.md` | Product audience, purpose, principles, and constraints |

## 11. Known limitations and things to re-check before deployment

- Analytics are workspace-wide and lack user ownership/tenant scoping.
- Existing repository indexes may lack embedding vectors until re-imported.
- Free-tier provider quotas, model IDs, privacy, strict structured-output support, and retry windows are external and can change.
- A saved workflow's indexed repository snapshot may be stale. Retrieval can miss relevant code; AI review can miss or misread context.
- AI review evidence validation verifies exact quotes/changed paths but cannot prove the review's reasoning is correct.
- Cooldown countdown derives duration from provider error text; unsupported wording cannot be inferred. Browser autoplay rules can prevent sound unless audio was unlocked by user interaction.
- Pending-state polling shows persisted status, not progress inside a still-running synchronous AI request. A job queue/background worker would be needed for reliable long-running jobs, cancellation, and subtask events.
- PR creation can leave a branch behind if GitHub accepts the branch but a later step fails; ForgeAI reports the failure and does not force-update/delete that branch.
- Workflow tests against a real `forge-test` repository and provider are manual integration checks; a successful TypeScript/lint check does not prove provider availability, Docker sandbox behavior, or GitHub end-to-end behavior.
- User requested prettier, less dense screens. Continue to check actual browser rendering and avoid shrinking text or adding decorative noise to fit more content.

## 12. Recommended continuation checklist

1. Start with `git status --short` and `git log -5 --oneline`. Confirm the README, this memory, and latest UI work were committed and no secret/config file slipped in.
2. Run `npm run typecheck` and `npm run lint`; run `npm test` when test verification is requested or when a behavior change requires it under the repository's engineering instructions.
3. Open the app at `http://localhost:3000` and visually inspect repository cards, analytics navigation, theme persistence/reload, workflow status while a request is pending, and cooldown completion behavior. Test both light and dark themes, keyboard focus, narrow viewport, and reduced motion.
4. Re-check that the new workflow UI preserves existing form actions and authorization. Do not create user-facing feature claims for metrics or progress that are not backed by persisted data.
5. Continue product work from the active user request. The old chat exports contain several stale step-by-step instructions; use them to understand intent, not as a command list.
6. Before multi-user deployment, scope analytics to authenticated owners/tenants and review the GitHub token exposure concern recorded in decision 0001.

## 13. Historical source documents

The user began the project discussion by supplying these five Markdown exports. Their history is incorporated above: product objective and working style; initial repository inspection and architecture; provider selection/troubleshooting; milestone-by-milestone implementation; CSV export requirement and review failures; human approval/PR boundaries; repository intelligence; advisory reviews; analytics; and the later UX feedback. The files overlap heavily, so this guide distills them rather than repeating duplicate chat transcripts.

1. `E:\Armani\Downloads\Claude-ForgeAI project implementation setup-20261005-1822.md` — early project setup and milestone implementation discussion through planning and code generation; includes the original request to proceed incrementally and the CSV export requirement.
2. `E:\Armani\Downloads\Claude-AI provider selection for adapter implementation-20261005-1639.md` — initial repository status, foundation, auth/import, provider adapter selection, and requirement-analysis work. This is the first snapshot of a conversation later exported again.
3. `E:\Armani\Downloads\Claude-Continuing previous discussion-20261007-1837.md` — Milestones 5A/5B, human approval and advisory AI review, validators, tests, and AI-review limitations.
4. `E:\Armani\Downloads\Claude-AI provider selection for adapter implementation-20261007-1527.md` — later, larger snapshot of the provider-selection conversation; includes foundation through Docker verification and repair-loop work, plan/code generation trouble, provider rate limits, and the security warning about an exposed provider credential. It overlaps document 2 and should be preferred when a later history snapshot is needed.
5. `E:\Armani\Downloads\Claude-ForgeAI project implementation setup-20261005-2302.md` — later setup/continuation export with plan improvements, retry/rate-limit debugging, generated-code and provider experiments. It contains provider suggestions that may be stale; validate against `lib/ai/config.ts` and provider consoles.

These original files are historical references outside the repository and may not exist on another machine. This document is the portable synthesis; repository code and ADRs remain authoritative for actual implementation.
