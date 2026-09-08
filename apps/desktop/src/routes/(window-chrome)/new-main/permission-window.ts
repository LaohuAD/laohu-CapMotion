type FocusChangedEvent = { payload: boolean };

export type PermissionWindow = {
	setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>;
	onFocusChanged: (
		listener: (event: FocusChangedEvent) => void,
	) => Promise<() => void>;
};

type PermissionRequestOutcome = { openedSettings: boolean };

/**
 * Temporarily yields the floating recorder window while macOS presents a
 * permission prompt or System Settings. If Settings opens, wait until the user
 * explicitly returns to Cap before restoring the floating level.
 */
export async function runPermissionRequestWithWindowYield<
	T extends PermissionRequestOutcome,
>(window: PermissionWindow, request: () => Promise<T>): Promise<T> {
	await window.setAlwaysOnTop(false);

	let result: T;
	try {
		result = await request();
	} catch (error) {
		await window.setAlwaysOnTop(true);
		throw error;
	}

	if (!result.openedSettings) {
		await window.setAlwaysOnTop(true);
		return result;
	}

	let unlisten: (() => void) | undefined;
	let restored = false;
	const restore = async () => {
		if (restored) return;
		restored = true;
		unlisten?.();
		await window.setAlwaysOnTop(true);
	};

	unlisten = await window.onFocusChanged(({ payload: focused }) => {
		if (focused) void restore();
	});

	return result;
}
