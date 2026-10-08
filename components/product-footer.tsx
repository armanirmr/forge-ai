export function ProductFooter() {
	return (
		<footer className="mt-auto border-t border-border bg-card text-card-foreground">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-4 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
				<span>© {new Date().getFullYear()} Changeweft</span>
				<span>Repository-grounded changes, reviewed by people.</span>
			</div>
		</footer>
	);
}
