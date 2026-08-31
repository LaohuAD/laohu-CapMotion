import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readEditorSource = (relativePath: string) =>
	readFileSync(
		new URL(`./routes/editor/${relativePath}`, import.meta.url),
		"utf8",
	);

describe("editor localization coverage", () => {
	it("routes shared field labels through the active language", () => {
		const source = readEditorSource("ui.tsx");
		expect(source).toContain("text(props.name)");
	});

	it("routes the editor header and preset menu through the active language", () => {
		expect(readEditorSource("Header.tsx")).toContain('text("Export")');
		expect(readEditorSource("PresetsDropdown.tsx")).toContain(
			'text("Save settings to preset")',
		);
	});

	it("routes player and track-manager copy through the active language", () => {
		const player = readEditorSource("Player.tsx");
		expect(player).toContain('text("Crop Video")');
		expect(player).toContain('"Enter enlarged preview"');
		expect(player).toContain('"Exit enlarged preview"');
		expect(player.match(/<PreviewCanvas/g)).toHaveLength(1);
		expect(player).toContain('import { MotionOverlay } from "./MotionOverlay"');
		expect(player.match(/<MotionOverlay size=\{size\(\)\}/g)).toHaveLength(1);
		expect(readEditorSource("Timeline/TrackManager.tsx")).toContain(
			'text("Add a track")',
		);
	});

	it("routes zoom help and timeline segment labels through the active language", () => {
		expect(readEditorSource("ZoomModeHelper.tsx")).toContain(
			'text("How does it work?")',
		);
		expect(readEditorSource("Timeline/ZoomTrack.tsx")).toContain(
			'text("Automatic Zoom")',
		);
		expect(readEditorSource("Timeline/SceneTrack.tsx")).toContain(
			'text("Click to add scene segment")',
		);
	});
});
