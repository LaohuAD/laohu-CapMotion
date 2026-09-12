import { describe, expect, it } from "vitest";
import {
	advancePlaybackPosition,
	calculatePlaybackSpeed,
	clamp,
	countWords,
	resizeScriptEditor,
} from "./teleprompter-utils";

describe("teleprompter utilities", () => {
	it("preserves the reading position when textarea measurement collapses the viewport", () => {
		const viewport = { scrollTop: 720 } as HTMLDivElement;
		let height = "1800px";
		const editor = {
			style: {
				get height() {
					return height;
				},
				set height(value: string) {
					height = value;
					if (value === "0px") viewport.scrollTop = 0;
				},
			},
			scrollHeight: 1850,
		} as HTMLTextAreaElement;
		resizeScriptEditor(editor, viewport);
		expect(viewport.scrollTop).toBe(720);
		expect(editor.style.height).toBe("1850px");
	});

	it("counts words in pasted scripts", () => {
		expect(countWords("  One   two\nthree ")).toBe(3);
		expect(countWords(" ")).toBe(0);
	});

	it("clamps a setting to its supported range", () => {
		expect(clamp(5, 10, 20)).toBe(10);
		expect(clamp(25, 10, 20)).toBe(20);
	});

	it("calculates a positive scroll speed from reading duration", () => {
		expect(calculatePlaybackSpeed(600, 300, 150)).toBe(5);
		expect(calculatePlaybackSpeed(-10, 300, 150)).toBe(0);
	});

	it("retains sub-pixel movement across animation frames", () => {
		let position = 0;
		for (let frame = 0; frame < 60; frame += 1) {
			position = advancePlaybackPosition(position, 100, 10, 1 / 60);
		}

		expect(position).toBeCloseTo(10);
	});
});
