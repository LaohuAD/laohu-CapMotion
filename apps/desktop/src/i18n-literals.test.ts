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

	it("translates recording source audio controls", () => {
		expect(translateLiteral("zh-CN", "Microphone")).toBe("麦克风");
		expect(translateLiteral("zh-CN", "System Audio")).toBe("系统声音");
		expect(translateLiteral("zh-CN", "Collapse Track")).toBe("收起轨道");
		expect(
			translateLiteral(
				"zh-CN",
				"Expand the recorded microphone audio from Video.",
			),
		).toBe("从视频轨道中展开已录制的麦克风声音");
		expect(
			translateLiteral("zh-CN", "Expand the recorded system audio from Video."),
		).toBe("从视频轨道中展开已录制的系统声音");
		expect(translateLiteral("zh-CN", "Mute microphone")).toBe("将麦克风静音");
		expect(translateLiteral("zh-CN", "Unmute microphone")).toBe(
			"取消麦克风静音",
		);
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
