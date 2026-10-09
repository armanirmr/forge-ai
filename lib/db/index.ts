import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

type PostgresClient = ReturnType<typeof postgres>;

type DatabaseState = {
	client?: PostgresClient;
	database?: ReturnType<typeof createDatabase>;
};

const globalForDb = globalThis as typeof globalThis & { dbState?: DatabaseState };
const requestStates = new WeakMap<object, DatabaseState>();

function getState() {
	try {
		const context = getCloudflareContext();
		let state = requestStates.get(context.ctx);
		if (!state) {
			state = {};
			requestStates.set(context.ctx, state);
		}
		return {
			state,
			connectionString:
				(context.env as CloudflareEnv & {
					HYPERDRIVE?: { connectionString: string };
				}).HYPERDRIVE?.connectionString ?? process.env.DATABASE_URL,
		};
	} catch {
		// Build-time imports and regular Node.js development do not have a Worker context.
		globalForDb.dbState ??= {};
		return { state: globalForDb.dbState, connectionString: process.env.DATABASE_URL };
	}
}

function getClient() {
	const { state, connectionString } = getState();
	if (state.client) return state.client;
	if (!connectionString) throw new Error("DATABASE_URL is not set and HYPERDRIVE is unavailable");

	state.client = postgres(connectionString, {
		max: 5,
		fetch_types: false,
	});
	return state.client;
}

function createDatabase() {
	return drizzle(getClient(), { schema });
}

function getDatabase() {
	const { state } = getState();
	state.database ??= createDatabase();
	return state.database;
}

// Delay database setup until a query runs so Next.js can inspect route modules
// during builds without requiring production credentials at build time.
export const db = new Proxy({} as ReturnType<typeof createDatabase>, {
	get(_target, property) {
		const instance = getDatabase();
		const value = Reflect.get(instance, property, instance);
		return typeof value === "function" ? value.bind(instance) : value;
	},
});

// Keep the Postgres.js tagged-template API while deferring client creation.
export const sql = new Proxy((() => undefined) as unknown as PostgresClient, {
	apply(_target, thisArg, args) {
		return Reflect.apply(getClient(), thisArg, args);
	},
	get(_target, property) {
		const instance = getClient();
		const value = Reflect.get(instance, property, instance);
		return typeof value === "function" ? value.bind(instance) : value;
	},
});
