import { describe, expect, it } from "vitest";

describe("external project hot reload", () => {
	it("auto-applies only a newer revision when the editor has no local save work", async () => {
		const module = await import("./project-hot-reload").catch(() => ({
			decideExternalProjectUpdate: undefined,
		}));
		const decide = module.decideExternalProjectUpdate;
		expect(typeof decide).toBe("function");
		if (!decide) return;

		expect(
			decide({
				persistedRevision: 4,
				incomingRevision: 5,
				hasPendingSave: false,
				saveInFlight: false,
			}),
		).toBe("auto-apply");
		expect(
			decide({
				persistedRevision: 4,
				incomingRevision: 5,
				hasPendingSave: true,
				saveInFlight: false,
			}),
		).toBe("prompt");
		expect(
			decide({
				persistedRevision: 5,
				incomingRevision: 5,
				hasPendingSave: false,
				saveInFlight: false,
			}),
		).toBe("ignore");
	});
});
