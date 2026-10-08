CREATE TABLE "pull_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"approval_id" uuid NOT NULL,
	"edits_hash" text NOT NULL,
	"branch_name" text NOT NULL,
	"base_branch" text NOT NULL,
	"status" text NOT NULL,
	"commit_sha" text,
	"pull_number" integer,
	"pull_url" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pull_requests_workflow_id_unique" UNIQUE("workflow_id")
);
--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_approval_id_change_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."change_approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pull_requests_workflow_idx" ON "pull_requests" USING btree ("workflow_id");