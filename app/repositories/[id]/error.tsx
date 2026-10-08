"use client";

import { ProductErrorState } from "@/components/product-error-state";

export default function RepositoryError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
	return (
		<ProductErrorState
			title="This workspace didn’t finish loading."
			description="We couldn’t retrieve this repository’s index and workflow history. Retry the page; if it still fails, go back to your repositories and reopen the workspace."
			reset={reset}
			resetLabel="Retry workspace"
		/>
	);
}
