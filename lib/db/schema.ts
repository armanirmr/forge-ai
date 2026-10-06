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
} from "drizzle-orm/pg-core";

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

// NOTE: no embedding column yet. It is added in the pgvector phase,
// once the embedding model (and therefore vector dimension) is chosen.
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
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
	},
	(t) => [index("code_chunks_file_idx").on(t.repositoryFileId)],
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
