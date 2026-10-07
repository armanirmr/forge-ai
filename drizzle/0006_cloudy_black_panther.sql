CREATE TABLE "change_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"decided_by" text NOT NULL,
	"reason" text,
	"edits_hash" text NOT NULL,
	"verification_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_approvals_workflow_id_unique" UNIQUE("workflow_id")
);
--> statement-breakpoint
ALTER TABLE "change_approvals" ADD CONSTRAINT "change_approvals_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_approvals" ADD CONSTRAINT "change_approvals_verification_run_id_verification_runs_id_fk" FOREIGN KEY ("verification_run_id") REFERENCES "public"."verification_runs"("id") ON DELETE no action ON UPDATE no action;