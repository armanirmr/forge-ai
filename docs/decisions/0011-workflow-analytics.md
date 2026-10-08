# 0011: Workflow analytics

## Decision

- Build a read-only dashboard from existing AI run, code change, verification, repair, workflow, and approval records. No migration is needed.
- Show total AI calls and token usage, grouped by agent; accepted, rejected, and stopped repair attempts; generated test-file paths; test executions; workflow status counts; duration to approval decision; and approval rate among decided workflows.
- Keep recent AI run details limited to agent, model, status, time, and token counts. Do not expose prompts, requirements, or provider errors in analytics.

## Metric definitions and limitations

- Test-file metrics count unique workflow/path pairs in generated edits; test executions count verification steps named `test`. They do not measure assertions or test quality.
- Workflow duration is measured from creation to approval or rejection. Undecided workflows are excluded.
- Approval rate is approved decisions divided by all approved and rejected decisions; pending workflows are excluded.
- Metrics aggregate all recorded workflows because the current schema has no user ownership field. Add tenant scoping before using the dashboard in a multi-user deployment.
