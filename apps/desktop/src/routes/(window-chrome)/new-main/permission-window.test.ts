import { describe, expect, it, vi } from "vitest";

import { runPermissionRequestWithWindowYield } from "./permission-window";

function createWindowHarness() {
	let focusListener: ((event: { payload: boolean }) => void) | undefined;
	const unlisten = vi.fn();
	const window = {
		setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
		onFocusChanged: vi.fn(async (listener) => {
			focusListener = listener;
			return unlisten;
		}),
	};

	return {
		window,
		unlisten,
		focus: (focused: boolean) => focusListener?.({ payload: focused }),
	};
}

describe("permission window level", () => {
	it("keeps the main window below System Settings until the user returns", async () => {
		const harness = createWindowHarness();

		await runPermissionRequestWithWindowYield(harness.window, async () => ({
			openedSettings: true,
		}));

		expect(harness.window.setAlwaysOnTop).toHaveBeenCalledTimes(1);
		expect(harness.window.setAlwaysOnTop).toHaveBeenCalledWith(false);

		harness.focus(false);
		expect(harness.window.setAlwaysOnTop).toHaveBeenCalledTimes(1);

		harness.focus(true);
		await vi.waitFor(() =>
			expect(harness.window.setAlwaysOnTop).toHaveBeenLastCalledWith(true),
		);
		expect(harness.unlisten).toHaveBeenCalledTimes(1);
	});

	it("restores always-on-top immediately when no settings window opens", async () => {
		const harness = createWindowHarness();

		await runPermissionRequestWithWindowYield(harness.window, async () => ({
			openedSettings: false,
		}));

		expect(harness.window.setAlwaysOnTop.mock.calls).toEqual([[false], [true]]);
		expect(harness.window.onFocusChanged).not.toHaveBeenCalled();
	});

	it("restores always-on-top when requesting permission fails", async () => {
		const harness = createWindowHarness();

		await expect(
			runPermissionRequestWithWindowYield(harness.window, async () => {
				throw new Error("permission failed");
			}),
		).rejects.toThrow("permission failed");

		expect(harness.window.setAlwaysOnTop.mock.calls).toEqual([[false], [true]]);
	});
});
