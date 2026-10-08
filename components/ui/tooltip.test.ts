import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HelpTooltip, TooltipProvider } from "./tooltip";

describe("contextual help tooltip", () => {
	it("provides an accessible, keyboard-focusable help trigger", () => {
		const html = renderToStaticMarkup(createElement(
			TooltipProvider,
			null,
			createElement(HelpTooltip, { label: "About Approval rate" }, "Undecided workflows are excluded."),
		));

		expect(html).toContain('aria-label="About Approval rate"');
		expect(html).toContain('type="button"');
	});
});
