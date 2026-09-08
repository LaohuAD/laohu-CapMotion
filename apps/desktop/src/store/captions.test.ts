import { describe, expect, it } from "vitest";
import {
	CAPTION_STYLE_PRESETS,
	getUserCaptionStylePresets,
	normalizeCaptionSettings,
} from "./captions";

describe("caption style preset ownership", () => {
	it("keeps personal Laohu values out of the public preset catalog", () => {
		expect(CAPTION_STYLE_PRESETS.map((preset) => preset.id)).not.toContain(
			"laohu",
		);
		expect(CAPTION_STYLE_PRESETS.map((preset) => preset.label)).not.toContain(
			"Laohu",
		);
	});

	it("derives a personal caption card from the current user's preset store", () => {
		const presets = getUserCaptionStylePresets({
			revision: 3,
			default: 0,
			presets: [
				{
					name: "Laohu",
					config: {
						captions: {
							settings: {
								font: "Source Han Sans CN VF",
								fontWeight: 700,
								size: 50,
								color: "#FFFFFF",
								backgroundColor: "#000000",
								backgroundOpacity: 0,
								outline: true,
								outlineColor: "#000000",
								outlineWidth: 4,
								shadow: false,
								shadowColor: "#000000",
								shadowOpacity: 75,
								shadowBlur: 15,
								shadowDistance: 5,
								shadowAngle: -45,
								outlineShadow: true,
								outlineShadowColor: "#000000",
								outlineShadowOpacity: 75,
								outlineShadowBlur: 15,
								outlineShadowDistance: 5,
								outlineShadowAngle: -45,
								letterSpacing: 0,
								position: "bottom-center",
								highlightColor: "#FFFFFF",
								activeWordHighlight: false,
								highlightStyle: "color",
								animation: "none",
								uppercase: false,
								fadeDuration: 0.12,
							},
						},
					} as never,
				},
			],
		} as never);

		expect(presets).toHaveLength(1);
		expect(presets[0]).toMatchObject({
			id: "user:Laohu",
			label: "Laohu",
			style: {
				font: "Source Han Sans CN VF",
				outlineWidth: 4,
				shadow: true,
				shadowBlur: 15,
			},
		});
		expect(presets[0].style).not.toHaveProperty("outlineShadow");
	});

	it("migrates the old built-in Laohu id to the user-owned preset id", () => {
		expect(normalizeCaptionSettings({ preset: "laohu" } as never).preset).toBe(
			"user:Laohu",
		);
	});

	it("migrates the old separate outline shadow into the single shadow model", () => {
		const settings = normalizeCaptionSettings({
			outline: true,
			shadow: false,
			outlineShadow: true,
			outlineShadowColor: "#123456",
			outlineShadowOpacity: 62,
			outlineShadowBlur: 18,
			outlineShadowDistance: 7,
			outlineShadowAngle: 35,
		} as never);

		expect(settings).toMatchObject({
			outline: true,
			shadow: true,
			shadowColor: "#123456",
			shadowOpacity: 62,
			shadowBlur: 18,
			shadowDistance: 7,
			shadowAngle: 35,
			outlineShadow: false,
		});
	});
});
