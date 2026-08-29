import { describe, expect, it } from "vitest";
import { translateLiteral } from "./i18n-literals";

describe("legacy user-interface localization", () => {
	it("translates editor actions and labels into Simplified Chinese", () => {
		expect(translateLiteral("zh-CN", "Crop")).toBe("裁剪");
		expect(translateLiteral("zh-CN", "Crop Video")).toBe("裁剪视频");
		expect(translateLiteral("zh-CN", "Background")).toBe("背景");
		expect(translateLiteral("zh-CN", "Show cursor")).toBe("显示鼠标");
	});

	it("returns the source text when English is selected", () => {
		expect(translateLiteral("en", "Crop Video")).toBe("Crop Video");
	});

	it("preserves technical and user-authored values that are not UI copy", () => {
		expect(translateLiteral("zh-CN", "macOS")).toBe("macOS");
		expect(translateLiteral("zh-CN", "pnpm tauri dev")).toBe("pnpm tauri dev");
		expect(translateLiteral("zh-CN", "/Users/a1/Movies/demo.mp4")).toBe(
			"/Users/a1/Movies/demo.mp4",
		);
		expect(translateLiteral("zh-CN", "Insta360 Link 2 Pro")).toBe(
			"Insta360 Link 2 Pro",
		);
	});
});
