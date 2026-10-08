"use client";

import { ProductErrorState } from "@/components/product-error-state";

export default function WorkflowError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
	return (
		<ProductErrorState
			title="We lost the view of this workflow."
			description="The workflow page could not load its saved evidence. Reloading the view won’t start the AI run again; use the workflow controls after the page is back."
			reset={reset}
			resetLabel="Reload workflow"
		/>
	);
}
