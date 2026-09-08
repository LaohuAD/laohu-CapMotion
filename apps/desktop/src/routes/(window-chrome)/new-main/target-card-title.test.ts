import { describe, expect, it } from "vitest";
import { isTextTruncated } from "./target-card-title";

describe("recording card title overflow", () => {
	it("enables the full-title tooltip only for real overflow", () => {
		expect(isTextTruncated(241, 240)).toBe(true);
		expect(isTextTruncated(240, 240)).toBe(false);
		expect(isTextTruncated(180, 240)).toBe(false);
	});
});
