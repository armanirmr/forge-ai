import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { WelcomeWorkflow } from "@/components/welcome-workflow";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandMark } from "@/components/brand-mark";

export default async function Home() {
	const session = await auth();
	if (session) redirect("/repositories");

	return (
		<main className="relative isolate flex flex-1 flex-col overflow-hidden">
			<div className="welcome-atmosphere" aria-hidden="true" />
			<header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 sm:py-7">
				<Link href="/" aria-label="Changeweft home" className="inline-flex items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
					<BrandMark />
					<span className="font-heading text-lg font-semibold tracking-tight">Changeweft</span>
				</Link>
				<ThemeToggle />
			</header>

			<div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 pb-12 sm:px-8 sm:pb-16">
				<section aria-labelledby="welcome-title" className="mx-auto flex w-full max-w-4xl flex-col items-center pb-9 pt-8 text-center sm:pb-12 sm:pt-12">
					<h1 id="welcome-title" className="max-w-4xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
						From repository context to changes you can review.
					</h1>
					<p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
						Changeweft grounds AI-assisted work in your connected GitHub repository, validates the draft, and leaves approval with you.
					</p>
					<form
						action={async () => {
							"use server";
							await signIn("github", { redirectTo: "/repositories" });
						}}
						className="mt-7"
					>
						<Button type="submit" size="lg" className="h-11 gap-2 px-5 text-sm">
							Sign in with GitHub
							<ArrowRight aria-hidden="true" className="size-4" />
						</Button>
					</form>
				</section>

				<WelcomeWorkflow />
			</div>
		</main>
	);
}
