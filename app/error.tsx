"use client";

import { ProductErrorState } from "@/components/product-error-state";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
	return (
		<ProductErrorState
			title="We couldn’t load this page."
			description="The page hit an unexpected problem. Retry it, or return to your repositories and reopen the page."
			reset={reset}
			resetLabel="Reload this page"
		/>
	);
}
