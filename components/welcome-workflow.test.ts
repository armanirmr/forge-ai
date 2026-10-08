import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WelcomeWorkflow } from "./welcome-workflow";

describe("welcome workflow map", () => {
	it("explains the repository-grounded path through human approval", () => {
		const html = renderToStaticMarkup(createElement(WelcomeWorkflow));

		expect(html).toContain("Illustrative workflow");
		expect(html).toContain("Use repository context");
		expect(html).toContain("Run verification");
		expect(html).toContain("A pull request comes after");
		expect(html).toContain("Only you can approve it.");
	});
});
