import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductErrorState } from "./product-error-state";

describe("product error recovery", () => {
	it("shows route-specific guidance and safe recovery actions", () => {
		const html = renderToStaticMarkup(createElement(ProductErrorState, {
			title: "We lost the view of this workflow.",
			description: "Reloading the view won’t start the AI run again.",
			reset: () => undefined,
			resetLabel: "Reload workflow",
		}));

		expect(html).toContain("We lost the view of this workflow.");
		expect(html).toContain("Reloading the view won’t start the AI run again.");
		expect(html).toContain("Reload workflow");
		expect(html).toContain("Back to repositories");
	});
});
