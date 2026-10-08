import { ProductErrorState } from "@/components/product-error-state";

export default function NotFound() {
	return (
		<ProductErrorState
			title="We can’t find that page."
			description="It may have moved, been archived, or belong to another account. Open your repositories to find the workspace and workflow history available to you."
		/>
	);
}
