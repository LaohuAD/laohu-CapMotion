import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("desktop Vite dependency interop", () => {
	it("prebundles the lazy changelog markdown dependency graph", () => {
		const configPath = fileURLToPath(
			new URL("../app.config.ts", import.meta.url),
		);
		const config = readFileSync(configPath, "utf8");

		expect(config).toContain('"solid-markdown > unified > extend"');
		expect(config).toContain('"debug"');
	});
});
