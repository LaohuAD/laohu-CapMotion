import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSettingsSource = (relativePath: string) =>
	readFileSync(
		new URL(`./routes/(window-chrome)/${relativePath}`, import.meta.url),
		"utf8",
	);

describe("CapMotion changelog data source", () => {
	it("does not call the upstream Cap changelog API from the page or badge", () => {
		const sources = [
			readSettingsSource("settings/changelog.tsx"),
			readSettingsSource("new-main/ChangeLogButton.tsx"),
		];

		for (const source of sources) {
			expect(source).not.toContain("~/utils/web-api");
			expect(source).not.toContain("getChangelogPosts");
			expect(source).not.toContain("getChangelogStatus");
		}
	});
});
