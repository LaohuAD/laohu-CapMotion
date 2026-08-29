import { describe, expect, it } from "vitest";
import { translate } from "./i18n";

describe("i18n", () => {
	it("returns the English message", () => {
		expect(translate("en", "settings.nav.shortcuts")).toBe("Shortcuts");
	});

	it("returns the Simplified Chinese message", () => {
		expect(translate("zh-CN", "settings.nav.shortcuts")).toBe("快捷键");
	});
});
