---
version: 1
slug: "app-workflows-id-page-tsx"
primary_target: "app/workflows/[id]/page.tsx"
related_targets: ["app/repositories/[id]/page.tsx"]
---

## Scope

Workflow detail screen and repository requirement submission. Visitor mode: Operate.

## Audience and task

Individual developers and reviewers inspect an AI-assisted repository workflow, understand what is happening now, review outputs, and decide the next action. While an AI or verification request is pending, make the current phase and elapsed wait unmistakable.

## Constraints

Preserve workflow actions, authorization, persisted workflow behavior, AI validation, and human approval boundaries. Keep navigation and controls familiar. The previous category-standard visual direction felt too bland; the user asks for an original, authentic, stylish interface. Do not imply streaming tokens or subtask progress when the server does not provide it.

## Direction contract

THESIS: Changeweft turns an opaque AI delivery process into a legible sequence of evidence and human decisions, from requirement through reviewed change.

OWN-WORLD: Use a cool, pale work surface, ink-blue text, and Elastic-inspired primary blue with semantic teal, magenta, yellow, and danger accents. Keep panels mostly flat and reserve strong color for action and state. Use Space Grotesk for page and major stage headings, Geist for body and controls, and Geist Mono only for code and measured values.

STORY: The visitor sees the current stage, elapsed time, and next available action before opening detailed evidence. Generated changes remain drafts until human approval. Never imply token streaming or percentage progress that the server does not provide.

FIRST VIEWPORT: Keep the repository breadcrumb, change-request title, and requirement at the top. Follow with a compact five-stage indicator, clear current-state message, and elapsed time. A small geometric change-document illustration may use a gentle blue/teal field and an active-only signal sweep; it must stop offscreen, when the tab is hidden, and under reduced motion. Keep detailed analysis, diffs, telemetry, and timeline collapsed until requested.

FORM: Operate mode. Use a deliberate type contrast and one product-specific motion moment: the change-document signal while a real operation is pending. Keep all essential status copy visible without animation and use familiar controls for decisions.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
