import { describe, it, expect } from "vitest";
import { trimEditForDisplay } from "./trim-edit";

describe("trimEditForDisplay", () => {
	it("shows only the appended lines when the search is kept as an anchor", () => {
		expect(trimEditForDisplay("fn() {\n}", "fn() {\n}\nnew() {\n}")).toEqual({
			removed: [],
			added: ["new() {", "}"],
		});
	});

	it("shows only the changed middle lines", () => {
		expect(trimEditForDisplay("a\nb\nc", "a\nX\nc")).toEqual({
			removed: ["b"],
			added: ["X"],
		});
	});

	it("shows everything when nothing is shared", () => {
		expect(trimEditForDisplay("a\nb", "x\ny")).toEqual({
			removed: ["a", "b"],
			added: ["x", "y"],
		});
	});

	it("shows a new file in full", () => {
		expect(trimEditForDisplay("", "\nfirst\nsecond")).toEqual({
			removed: [],
			added: ["", "first", "second"],
		});
	});

	it("returns nothing for identical text", () => {
		expect(trimEditForDisplay("a\nb", "a\nb")).toEqual({
			removed: [],
			added: [],
		});
	});
});
