ALTER TABLE "repositories" DROP CONSTRAINT "repositories_github_repo_id_unique";--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
CREATE INDEX "repositories_owner_user_idx" ON "repositories" USING btree ("owner_user_id");--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_owner_github_repo_uq" UNIQUE("owner_user_id","github_repo_id");