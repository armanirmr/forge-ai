import {
	pgTable,
	uuid,
	text,
	integer,
	bigint,
	jsonb,
	timestamp,
	unique,
	index,
	vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const createdAt = () =>
	timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const repositories = pgTable("repositories", {
	id: uuid("id").primaryKey().defaultRandom(),
	githubRepoId: bigint("github_repo_id", { mode: "number" }).notNull().unique(),
	name: text("name").notNull(),
	owner: text("owner").notNull(),
	defaultBranch: text("default_branch").notNull(),
	language: text("language"),
	createdAt: createdAt(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const userAISettings = pgTable("user_ai_settings", {
	userId: text("user_id").primaryKey(),
	provider: text("provider", { enum: ["gemini", "groq", "openai", "anthropic"] }).notNull(),
	model: text("model").notNull(),
	encryptedApiKey: text("encrypted_api_key").notNull(),
	encryptedEmbeddingApiKey: text("encrypted_embedding_api_key"),
	createdAt: createdAt(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const repositoryFiles = pgTable(
	"repository_files",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		repositoryId: uuid("repository_id")
			.notNull()
			.references(() => repositories.id, { onDelete: "cascade" }),
		path: text("path").notNull(),
		language: text("language"),
		size: integer("size").notNull(),
		hash: text("hash").notNull(),
		content: text("content").notNull(),
		indexedAt: timestamp("indexed_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [unique("repository_files_repo_path_uq").on(t.repositoryId, t.path)],
);

export const codeChunks = pgTable(
	"code_chunks",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		repositoryFileId: uuid("repository_file_id")
			.notNull()
			.references(() => repositoryFiles.id, { onDelete: "cascade" }),
		content: text("content").notNull(),
		startLine: integer("start_line").notNull(),
		endLine: integer("end_line").notNull(),
		embedding: vector("embedding", { dimensions: 768 }),
		embeddingModel: text("embedding_model"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
	},
	(t) => [
		index("code_chunks_file_idx").on(t.repositoryFileId),
		index("code_chunks_embedding_hnsw_idx")
			.using("hnsw", t.embedding.op("vector_cosine_ops"))
			.where(sql`${t.embedding} is not null`),
	],
);

// projectId / workflowId have no FK yet: those tables arrive in Milestone 1.
export const aiRuns = pgTable("ai_runs", {
	id: uuid("id").primaryKey().defaultRandom(),
	projectId: uuid("project_id"),
	workflowId: uuid("workflow_id"),
	agent: text("agent").notNull(),
	model: text("model").notNull(),
	promptVersion: text("prompt_version").notNull(),
	inputTokens: integer("input_tokens"),
	outputTokens: integer("output_tokens"),
	durationMs: integer("duration_ms"),
	status: text("status", {
		enum: ["started", "succeeded", "failed", "validation_failed"],
	}).notNull(),
	error: text("error"),
	createdAt: createdAt(),
});

export const workflowEvents = pgTable(
	"workflow_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workflowId: uuid("workflow_id").notNull(),
		type: text("type").notNull(),
		actor: text("actor").notNull(), // "user:<id>" | "agent:<name>" | "system"
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		createdAt: createdAt(),
	},
	(t) => [index("workflow_events_workflow_idx").on(t.workflowId)],
);

export const workflows = pgTable("workflows", {
	id: uuid("id").primaryKey().defaultRandom(),
	repositoryId: uuid("repository_id")
		.notNull()
		.references(() => repositories.id, { onDelete: "cascade" }),
	requirement: text("requirement").notNull(),
	status: text("status", {
		enum: [
			"analyzing",
			"analysis_completed",
			"planning",
			"plan_completed",
			"plan_approved",
			"generating",
			"changes_generated",
			"failed",
			"verifying",
			"repairing",
			"changes_approved",
			"changes_rejected",
		],
	}).notNull(),
	error: text("error"),
	createdAt: createdAt(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const requirementAnalyses = pgTable("requirement_analyses", {
	id: uuid("id").primaryKey().defaultRandom(),
	workflowId: uuid("workflow_id")
		.notNull()
		.references(() => workflows.id, { onDelete: "cascade" }),
	aiRunId: uuid("ai_run_id").references(() => aiRuns.id),
	// Stored only after schema validation; re-validated on read.
	result: jsonb("result").$type<Record<string, unknown>>().notNull(),
	retrievedContext: jsonb("retrieved_context")
		.$type<Record<string, unknown>>()
		.notNull(),
	createdAt: createdAt(),
});

export const implementationPlans = pgTable("implementation_plans", {
	id: uuid("id").primaryKey().defaultRandom(),
	workflowId: uuid("workflow_id")
		.notNull()
		.unique()
		.references(() => workflows.id, { onDelete: "cascade" }),
	aiRunId: uuid("ai_run_id").references(() => aiRuns.id),
	// Stored only after schema and semantic validation; re-validated on read.
	result: jsonb("result").$type<Record<string, unknown>>().notNull(),
	createdAt: createdAt(),
});

export const codeChanges = pgTable("code_changes", {
	id: uuid("id").primaryKey().defaultRandom(),
	workflowId: uuid("workflow_id")
		.notNull()
		.unique()
		.references(() => workflows.id, { onDelete: "cascade" }),
	aiRunId: uuid("ai_run_id").references(() => aiRuns.id),
	// Stored only after schema and patch validation; re-validated on read.
	result: jsonb("result").$type<Record<string, unknown>>().notNull(),
	createdAt: createdAt(),
});

export const verificationRuns = pgTable(
	"verification_runs",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workflowId: uuid("workflow_id")
			.notNull()
			.references(() => workflows.id, { onDelete: "cascade" }),
		status: text("status", {
			enum: ["passed", "failed", "error", "not_executed"],
		}).notNull(),
		// Written by our code from real command output; re-validated on read.
		result: jsonb("result").$type<Record<string, unknown>>().notNull(),
		durationMs: integer("duration_ms").notNull(),
		createdAt: createdAt(),
	},
	(t) => [index("verification_runs_workflow_idx").on(t.workflowId)],
);

export const repairAttempts = pgTable(
	"repair_attempts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workflowId: uuid("workflow_id")
			.notNull()
			.references(() => workflows.id, { onDelete: "cascade" }),
		attemptNumber: integer("attempt_number").notNull(),
		/** The failing verification run this attempt responded to. */
		verificationRunId: uuid("verification_run_id").references(
			() => verificationRuns.id,
		),
		aiRunId: uuid("ai_run_id").references(() => aiRuns.id),
		status: text("status", {
			enum: ["accepted", "rejected", "stopped"],
		}).notNull(),
		/** Validated RepairSchema output; null when the attempt was rejected. */
		result: jsonb("result").$type<Record<string, unknown>>(),
		error: text("error"),
		/** The verification run executed after this attempt's edits were applied. */
		resultRunId: uuid("result_run_id").references(() => verificationRuns.id),
		createdAt: createdAt(),
	},
	(t) => [
		unique("repair_attempts_workflow_attempt_uq").on(
			t.workflowId,
			t.attemptNumber,
		),
	],
);

export const changeApprovals = pgTable("change_approvals", {
	id: uuid("id").primaryKey().defaultRandom(),
	workflowId: uuid("workflow_id")
		.notNull()
		.unique()
		.references(() => workflows.id, { onDelete: "cascade" }),
	decision: text("decision", { enum: ["approved", "rejected"] }).notNull(),
	decidedBy: text("decided_by").notNull(),
	reason: text("reason"),
	/** SHA-256 of the exact effective edits (generated plus accepted repairs) the decision applies to. */
	editsHash: text("edits_hash").notNull(),
	verificationRunId: uuid("verification_run_id").references(
		() => verificationRuns.id,
	),
	createdAt: createdAt(),
});

export const changeReviews = pgTable(
	"change_reviews",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workflowId: uuid("workflow_id")
			.notNull()
			.references(() => workflows.id, { onDelete: "cascade" }),
		aiRunId: uuid("ai_run_id").references(() => aiRuns.id),
		/** The effective edits this review looked at. A review for other edits is not shown. */
		editsHash: text("edits_hash").notNull(),
		status: text("status", { enum: ["completed", "failed"] }).notNull(),
		/** Validated ChangeReviewSchema output; null when the review failed. */
		result: jsonb("result").$type<Record<string, unknown>>(),
		error: text("error"),
		createdAt: createdAt(),
	},
	(t) => [index("change_reviews_workflow_idx").on(t.workflowId)],
);

export const pullRequests = pgTable(
	"pull_requests",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workflowId: uuid("workflow_id")
			.notNull()
			.unique()
			.references(() => workflows.id, { onDelete: "cascade" }),
			approvalId: uuid("approval_id")
				.notNull()
				.references(() => changeApprovals.id),
		editsHash: text("edits_hash").notNull(),
		branchName: text("branch_name").notNull(),
		baseBranch: text("base_branch").notNull(),
		status: text("status", { enum: ["creating", "created", "failed"] }).notNull(),
		commitSha: text("commit_sha"),
		pullNumber: integer("pull_number"),
		pullUrl: text("pull_url"),
		error: text("error"),
		createdAt: createdAt(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [index("pull_requests_workflow_idx").on(t.workflowId)],
);
