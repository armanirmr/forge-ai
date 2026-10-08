# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Individual developers tracking repository workflows and team leads or reviewers supervising AI-generated changes. While a workflow runs, users need to understand its current state and what the AI is doing.

## Product Purpose

ForgeAI turns a software requirement into validated analysis and a draft implementation plan grounded in a connected GitHub repository. The product also supports implementation, verification, repair, review, approval, and pull request steps in a workflow. Success means users can move from a requirement to a trustworthy, reviewable software change while understanding each workflow step.

## Positioning

The product's durable differentiator and success measures have not been confirmed with the user.

## Operating Context

Users connect GitHub repositories, submit requirements, review generated analyses and plans, and follow implementation and validation steps through workflow screens. AI outputs are schema-validated before storage.

## Capabilities and Constraints

- Next.js App Router, TypeScript, Tailwind, shadcn/ui, PostgreSQL with Drizzle, Auth.js (GitHub), Zod, and Vitest.
- Existing workflow actions and authorization behavior must remain intact during the workflow-screen redesign.
- Clear live feedback for AI work is a primary design goal.
- The product supports repository indexing and retrieval, workflow verification and repair, advisory AI reviews, and analytics, as documented in README.md.

## Evidence on Hand

- Product and stack description: `README.md`.
- Existing workflow and repository screens: `app/workflows/[id]/` and `app/repositories/[id]/page.tsx`.
- Do not invent customer endorsements, usage metrics, or performance claims.

## Brand Commitments

Give the workflow screens a distinctive, product-grounded visual voice. Avoid a generic category-standard presentation while keeping familiar web controls and clear workflow status.

## Product Principles

- Keep generated work reviewable by people.
- Preserve repository and authorization boundaries.
- Make workflow state and AI activity understandable while work is in progress.
- Ground generated plans in the connected repository.
