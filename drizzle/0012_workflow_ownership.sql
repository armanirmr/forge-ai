ALTER TABLE "workflows" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
UPDATE "workflows" AS workflow
SET "created_by_user_id" = substring(event."actor" from 6)
FROM "workflow_events" AS event
WHERE event."workflow_id" = workflow."id"
	AND event."type" = 'REQUIREMENT_CREATED'
	AND event."actor" LIKE 'user:%';--> statement-breakpoint
CREATE INDEX "workflows_created_by_user_idx" ON "workflows" USING btree ("created_by_user_id");
