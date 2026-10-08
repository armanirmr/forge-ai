import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { ProductHeader } from "@/components/product-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { userAISettings } from "@/lib/db/schema";
import { shouldShowAISetupGuide } from "@/lib/ai/setup-readiness";
import { clearAISettingsAction, saveAISettingsAction } from "./actions";

const models = {
	gemini: process.env.AI_PROVIDER === "gemini" ? process.env.AI_MODEL ?? "gemini-2.5-flash" : "gemini-2.5-flash",
	groq: process.env.AI_PROVIDER === "groq" ? process.env.AI_MODEL ?? "openai/gpt-oss-120b" : "openai/gpt-oss-120b",
	openai: process.env.AI_PROVIDER === "openai" ? process.env.AI_MODEL ?? "gpt-4.1-mini" : "gpt-4.1-mini",
	anthropic: process.env.AI_PROVIDER === "anthropic" ? process.env.AI_MODEL ?? "claude-sonnet-4-6" : "claude-sonnet-4-6",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; cleared?: string; setup?: string; accountRecovery?: string }> }) {
	const session = await auth();
	if (!session) redirect("/");
	const [{ provider, model, hasEmbeddingKey } = { provider: null, model: null, hasEmbeddingKey: false }] = await db
		.select({ provider: userAISettings.provider, model: userAISettings.model, encryptedEmbeddingApiKey: userAISettings.encryptedEmbeddingApiKey })
		.from(userAISettings)
		.where(eq(userAISettings.userId, session.user.id))
		.then((rows) => rows.map((row) => ({ provider: row.provider, model: row.model, hasEmbeddingKey: Boolean(row.encryptedEmbeddingApiKey) })));
	const query = await searchParams;
	const fallbackChat = Boolean(process.env.AI_PROVIDER && process.env.AI_API_KEY && process.env.AI_MODEL);
	const fallbackEmbedding = Boolean(process.env.EMBEDDING_API_KEY || (process.env.AI_PROVIDER === "gemini" && process.env.AI_API_KEY));
	const configuredProvider = process.env.AI_PROVIDER as keyof typeof models;
	const defaultProvider = Object.hasOwn(models, configuredProvider) ? configuredProvider : "groq";
	const selectedProvider = provider ?? defaultProvider;
	const selectedModel = model ?? models[selectedProvider];
	const hasChat = Boolean(provider || fallbackChat);
	const hasEmbedding = Boolean(hasEmbeddingKey || (provider === "gemini" && hasChat) || fallbackEmbedding);
	const showSetupGuide = shouldShowAISetupGuide(query.setup === "1", Boolean(provider), hasChat, hasEmbedding);
	const providerLabel = provider === "gemini" ? "Google Gemini" : provider === "groq" ? "Groq" : provider === "openai" ? "OpenAI" : provider === "anthropic" ? "Anthropic Claude" : null;
	const embeddingSource = hasEmbeddingKey
		? "Your separate Google key is saved for repository embeddings."
		: provider === "gemini"
			? "Using your saved Gemini chat key for repository embeddings."
			: fallbackEmbedding
				? "Using the server’s Google embedding key."
				: "Add a Google key to import repositories and use semantic search.";

	return (
		<>
			<ProductHeader active="settings" />
			<main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
				{query.accountRecovery === "1" && <p role="status" className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">Your workspace history was restored, but saved AI credentials could not be moved securely. Enter your provider key again; the previous encrypted settings were left untouched.</p>}
				<header className="max-w-3xl space-y-3 border-b border-border pb-7">
					<p className="flex items-center gap-2 text-sm font-semibold tracking-wide text-primary"><Sparkles aria-hidden="true" className="size-4" /> PERSONAL WORKSPACE</p>
					<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">AI settings</h1>
					<p className="text-base leading-7 text-muted-foreground">Connect your own provider credentials. Changeweft uses them for your workflow requests and repository indexing.</p>
				</header>

				{query.error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{query.error.replaceAll("+", " ")}</p>}
				{query.saved && <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-600/30 bg-emerald-500/5 p-4 text-sm"><Check aria-hidden="true" className="size-4 text-emerald-600" /> Saved successfully. Your account settings are active for new AI operations.</p>}
				{query.cleared && <p role="status" className="rounded-lg border border-border bg-muted/40 p-4 text-sm">Personal credentials removed. Changeweft will use server defaults when configured.</p>}
				{showSetupGuide && <Card className="border-primary/30 bg-primary/[0.035] shadow-sm">
					<CardHeader>
						<p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{hasChat && hasEmbedding ? "Quick setup guide" : "Get Changeweft ready · 4 steps"}</p>
						<CardTitle className="font-heading text-xl">{hasChat && hasEmbedding ? "Your AI setup is ready" : "Connect your AI providers before you begin"}</CardTitle>
						<CardDescription className="max-w-3xl text-sm leading-6">Changeweft needs a chat provider for analysis and code workflows, plus Google Gemini Embedding 2 for repository import and semantic search. Follow these steps; your keys stay private and are never displayed after saving.</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-3 sm:grid-cols-2">
						<SetupStep number="1" title="Choose a chat provider" detail="Pick Gemini, Groq, OpenAI, or Anthropic in the form below." ready={hasChat} />
						<SetupStep number="2" title="Add its API key and model" detail="Create an API key with the provider, choose a model ID, and enter both below." ready={hasChat} />
						<SetupStep number="3" title="Set up repository embeddings" detail={hasEmbedding ? embeddingSource : "Add a Google AI Studio key below. Gemini chat keys can also power embeddings automatically."} ready={hasEmbedding} />
						<SetupStep number="4" title="Save and start building" detail="Save your settings. Changeweft will confirm the active providers, then return to Repositories." ready={hasChat && hasEmbedding} />
					</CardContent>
				</Card>}

				{provider && <section aria-label="Active personal AI configuration" role={query.saved ? "status" : undefined} className="flex flex-col gap-4 rounded-xl border border-emerald-600/35 bg-emerald-500/[0.07] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
					<div className="flex items-start gap-4">
						<span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-300"><Check className="size-5" /></span>
						<div className="space-y-1">
							<p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800 dark:text-emerald-300">Personal settings saved · active</p>
							<h2 className="text-lg font-semibold tracking-tight">New AI requests use {providerLabel}</h2>
							<p className="text-sm leading-6 text-muted-foreground">Model <span className="font-medium text-foreground">{model}</span>. Your chat key is stored securely and will not be shown here.</p>
						</div>
					</div>
					<div className="shrink-0 rounded-lg border border-emerald-700/15 bg-background/75 px-4 py-3 text-sm">
						<p className="font-medium">Repository embeddings</p>
						<p className={hasEmbedding ? "mt-1 text-emerald-700 dark:text-emerald-300" : "mt-1 text-amber-700 dark:text-amber-300"}>{hasEmbedding ? "Ready · Gemini Embedding 2" : "Google key needed"}</p>
						{hasChat && hasEmbedding && <Link href="/repositories" className="mt-3 inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover">Continue to repositories</Link>}
					</div>
				</section>}

				<div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(17rem,0.8fr)]">
					<Card className="border-border/80">
						<CardHeader><CardTitle className="font-heading text-xl">Provider credentials</CardTitle><CardDescription>Only providers supported by Changeweft’s current adapters are listed.</CardDescription></CardHeader>
						<CardContent>
							<form action={saveAISettingsAction} className="space-y-6">
								<div className="grid gap-4 sm:grid-cols-2">
									<label className="space-y-2 text-sm font-medium">Chat provider
										<select name="provider" defaultValue={selectedProvider} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring">
											<option value="gemini">Google Gemini</option><option value="groq">Groq</option><option value="openai">OpenAI (ChatGPT models)</option><option value="anthropic">Anthropic (Claude)</option>
										</select>
									</label>
									<label className="space-y-2 text-sm font-medium">Model ID
										<input name="model" required maxLength={128} defaultValue={selectedModel} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" />
										<span className="block text-xs font-normal text-muted-foreground">Use a model supported by the selected provider.</span>
									</label>
								</div>
								<label className="block space-y-2 text-sm font-medium">Chat API key
									<input name="apiKey" type="password" autoComplete="new-password" spellCheck={false} placeholder={provider ? "Leave blank to keep the saved key" : "Paste your provider key"} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base font-normal outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
									<span className="block text-xs font-normal text-muted-foreground">{provider ? "A saved key is on file. Enter a new one to rotate it." : "The key is required to use your personal provider settings."} Create keys at <a className="text-primary underline underline-offset-4" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>, <a className="text-primary underline underline-offset-4" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Groq</a>, <a className="text-primary underline underline-offset-4" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">OpenAI API Platform</a>, or <a className="text-primary underline underline-offset-4" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Anthropic Console</a>. OpenAI API billing is separate from ChatGPT subscriptions.</span>
								</label>
								<div className="space-y-3 rounded-xl border border-border/80 bg-muted/25 p-4">
									<div><h3 className="font-medium">Repository embeddings</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Changeweft currently uses Gemini Embedding 2 for repository imports and semantic search.</p></div>
									<label className="block space-y-2 text-sm font-medium">Google AI Studio key <span className="font-normal text-muted-foreground">(optional if using Gemini chat)</span>
										<input name="embeddingApiKey" type="password" autoComplete="new-password" spellCheck={false} placeholder={hasEmbeddingKey ? "Leave blank to keep the saved key" : "Paste a Google key for embeddings"} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base font-normal outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
									</label>
									{hasEmbeddingKey && <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" name="clearEmbeddingApiKey" className="size-4 accent-primary" />Remove saved embedding key</label>}
								</div>
								<div className="flex flex-wrap items-center gap-3">
									<Button type="submit" size="lg"><KeyRound aria-hidden="true" />Save AI settings</Button>
									<span className="text-sm text-muted-foreground">Keys are never shown again after saving.</span>
								</div>
							</form>
						</CardContent>
					</Card>

					<aside className="space-y-4">
						<Card className="border-border/80">
							<CardHeader><CardTitle className="flex items-center gap-2 font-heading text-lg"><ShieldCheck aria-hidden="true" className="size-5 text-primary" />Connection status</CardTitle><CardDescription>Credentials are checked when an AI operation runs.</CardDescription></CardHeader>
							<CardContent className="space-y-3">
								<StatusRow label={provider ? "Your chat key" : "Chat provider"} ready={hasChat} detail={provider ? `${providerLabel} · ${model} · saved to your account` : fallbackChat ? "Using server configuration" : "Not configured"} />
								<StatusRow label="Gemini Embedding 2" ready={hasEmbedding} detail={embeddingSource} />
								{provider && <form action={clearAISettingsAction} className="border-t border-border pt-4"><Button type="submit" variant="outline" className="w-full">Remove personal settings</Button><p className="mt-2 text-xs leading-5 text-muted-foreground">This removes your saved encrypted keys and returns to server defaults.</p></form>}
							</CardContent>
						</Card>
						<div className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-sm leading-6">
							<h2 className="font-semibold">Your keys stay private</h2>
							<p className="mt-2 text-muted-foreground">Keys are encrypted at rest with AES-256-GCM using a key derived from the server’s authentication secret. They are decrypted only on the server when calling the selected provider.</p>
							<p className="mt-2 text-muted-foreground">Changing <code className="rounded bg-muted px-1">NEXTAUTH_SECRET</code> makes existing saved keys unreadable; save them again afterward.</p>
						</div>
					</aside>
				</div>
				<p className="text-sm text-muted-foreground">Provider docs: <Link href="https://ai.google.dev/gemini-api/docs" target="_blank" className="text-primary underline underline-offset-4">Gemini</Link> · <Link href="https://console.groq.com/docs" target="_blank" className="text-primary underline underline-offset-4">Groq</Link> · <Link href="https://platform.openai.com/docs" target="_blank" className="text-primary underline underline-offset-4">OpenAI</Link> · <Link href="https://platform.claude.com/docs" target="_blank" className="text-primary underline underline-offset-4">Anthropic</Link></p>
			</main>
		</>
	);
}

function StatusRow({ label, ready, detail }: { label: string; ready: boolean; detail: string }) {
	return <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/60 p-3"><span aria-hidden="true" className={`mt-0.5 size-2.5 shrink-0 rounded-full ${ready ? "bg-emerald-500" : "bg-muted-foreground/40"}`} /><div><p className="text-sm font-medium">{label}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p></div></div>;
}

function SetupStep({ number, title, detail, ready }: { number: string; title: string; detail: string; ready: boolean }) {
	return <div className="flex gap-3 rounded-lg border border-border/70 bg-background/80 p-4">
		<span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${ready ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300" : "bg-primary/10 text-primary"}`}>{ready ? <Check aria-hidden="true" className="size-4" /> : number}</span>
		<div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-sm leading-5 text-muted-foreground">{detail}</p></div>
	</div>;
}
