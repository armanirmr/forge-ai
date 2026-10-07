CREATE TABLE "repair_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"verification_run_id" uuid,
	"ai_run_id" uuid,
	"status" text NOT NULL,
	"result" jsonb,
	"error" text,
	"result_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repair_attempts_workflow_attempt_uq" UNIQUE("workflow_id","attempt_number")
);
--> statement-breakpoint
ALTER TABLE "repair_attempts" ADD CONSTRAINT "repair_attempts_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_attempts" ADD CONSTRAINT "repair_attempts_verification_run_id_verification_runs_id_fk" FOREIGN KEY ("verification_run_id") REFERENCES "public"."verification_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_attempts" ADD CONSTRAINT "repair_attempts_ai_run_id_ai_runs_id_fk" FOREIGN KEY ("ai_run_id") REFERENCES "public"."ai_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_attempts" ADD CONSTRAINT "repair_attempts_result_run_id_verification_runs_id_fk" FOREIGN KEY ("result_run_id") REFERENCES "public"."verification_runs"("id") ON DELETE no action ON UPDATE no action;