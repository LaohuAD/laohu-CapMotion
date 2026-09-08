import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
	new URL("./text-style.tsx", import.meta.url),
	"utf8",
);

describe("caption font capabilities", () => {
	it("only offers weights that the bundled or generic family can render", () => {
		expect(source).toMatch(
			/System Sans-Serif[\s\S]{0,100}weights:\s*\[400,\s*700\]/,
		);
		expect(source).toMatch(
			/Source Han Sans CN VF[\s\S]{0,120}weights:\s*\[400,\s*500,\s*700\]/,
		);
		expect(source).toMatch(
			/LXGW WenKai[\s\S]{0,100}weights:\s*\[300,\s*400,\s*500\]/,
		);
		expect(source).toContain("getCaptionWeightOptions");
	});
});
