import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	CAPMOTION_CHANGELOG,
	localizeChangelogEntry,
} from "./capmotion-changelog";

describe("CapMotion changelog", () => {
	it("uses the package version as the newest release-note version", () => {
		const config = JSON.parse(
			readFileSync(
				resolve(import.meta.dirname, "../src-tauri/tauri.local.conf.json"),
				"utf8",
			),
		) as { version: string };

		expect(CAPMOTION_CHANGELOG[0]?.version).toBe(config.version);
	});

	it("provides Chinese and English copy for every bundled release", () => {
		for (const entry of CAPMOTION_CHANGELOG) {
			expect(
				localizeChangelogEntry(entry, "zh-CN").title.length,
			).toBeGreaterThan(0);
			expect(
				localizeChangelogEntry(entry, "zh-CN").content.length,
			).toBeGreaterThan(0);
			expect(localizeChangelogEntry(entry, "en").title.length).toBeGreaterThan(
				0,
			);
			expect(
				localizeChangelogEntry(entry, "en").content.length,
			).toBeGreaterThan(0);
		}
	});

	it("localizes the current release without changing version metadata", () => {
		const current = CAPMOTION_CHANGELOG[0];
		const localized = localizeChangelogEntry(current, "zh-CN");

		expect(localized.version).toBe("0.1.2");
		expect(localized.title).toContain("预设");
	});
});
