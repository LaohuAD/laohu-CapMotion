import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
	new URL("./CaptionsTab.tsx", import.meta.url),
	"utf8",
);
const contextSource = readFileSync(
	new URL("./context.ts", import.meta.url),
	"utf8",
);

describe("caption effect controls", () => {
	it("uses one shadow control instead of exposing a disconnected outline shadow", () => {
		expect(source).not.toContain('getSetting("outlineShadow")');
		expect(source).not.toContain('text("Outline Shadow")');
	});

	it("only exposes animation duration when an animation is selected", () => {
		expect(source).toContain('getSetting("animation") !== "none"');
	});

	it("keeps visual controls track-wide instead of exposing per-caption style overrides", () => {
		expect(source).not.toContain('name="Fade Duration Override"');
		expect(source).toContain('name="Selected Caption"');
	});

	it("shows an independent position editor for every existing caption track", () => {
		expect(source).toContain("captionPositionTracks");
		expect(source).toContain("captionTrackPositionLabel");
		expect(source).toContain("<For each={captionPositionTracks()}");
		expect(source).not.toContain("activeCaptionTrackId");
		expect(source).not.toContain("activeCaptionPosition");
	});

	it("cleans orphaned track positions when caption tracks are deleted", () => {
		expect(contextSource).toContain("pruneCaptionTrackPositions");
		expect(contextSource).toContain("remainingCaptionTrackIds");
	});
});
