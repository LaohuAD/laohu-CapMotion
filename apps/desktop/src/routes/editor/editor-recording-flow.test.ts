import { describe, expect, it } from "vitest";

import {
	createEditorRecordingFlow,
	type EditorRecordingFlowOperations,
	type EditorRecordingPreparationInput,
} from "./editor-recording-flow";

type TestConfig = { title: string; segments: number[] };
type TestTarget = { variant: "display"; id: string };

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function input(
	overrides: Partial<
		EditorRecordingPreparationInput<TestConfig, TestTarget>
	> = {},
) {
	return {
		projectPath: "/projects/one.cap",
		ownerId: "editor-owner-one",
		requestId: "recording-request-one",
		projectConfig: { title: "Original", segments: [1, 2] },
		previousMode: "instant",
		shouldStopPlayback: false,
		target: { variant: "display", id: "display-1" },
		targetMode: "display",
		onCommitPicker: () => {},
		onRollbackPicker: () => {},
		...overrides,
	} satisfies EditorRecordingPreparationInput<TestConfig, TestTarget>;
}

function operations(
	overrides: Partial<
		EditorRecordingFlowOperations<TestConfig, TestTarget>
	> = {},
) {
	const calls: string[] = [];
	const base: EditorRecordingFlowOperations<TestConfig, TestTarget> = {
		stopPlayback: async () => calls.push("stopPlayback"),
		setRecordingMode: async (mode) => calls.push(`setRecordingMode:${mode}`),
		setProjectConfig: async () => calls.push("setProjectConfig"),
		setEditorRecordingTarget: async (path, ownerId, requestId) =>
			calls.push(
				`setEditorRecordingTarget:${path ?? "null"}:${ownerId}:${requestId}`,
			),
		clearEditorRecordingTarget: async (path, ownerId, requestId) =>
			calls.push(`clearEditorRecordingTarget:${path}:${ownerId}:${requestId}`),
		openTargetSelectOverlays: async (_target, mode) =>
			calls.push(`openTargetSelectOverlays:${mode}`),
		closeTargetSelectOverlays: async () =>
			calls.push("closeTargetSelectOverlays"),
		hideEditorForPicker: async () => calls.push("hideEditorForPicker"),
		showEditor: async () => calls.push("showEditor"),
		restoreRecordingMode: async (mode) =>
			calls.push(`restoreRecordingMode:${mode}`),
		reportRollbackError: (error) =>
			calls.push(`reportRollbackError:${String(error)}`),
	};
	return { calls, ops: { ...base, ...overrides } };
}

describe("editor recording preparation flow", () => {
	it("rolls back and keeps the editor usable when saving the original config fails", async () => {
		const originalConfig = { title: "Original", segments: [1, 2] };
		const { calls, ops } = operations({
			setProjectConfig: async () => {
				calls.push("setProjectConfig");
				throw new Error("save failed");
			},
		});
		const flow = createEditorRecordingFlow(ops);
		let committed = false;

		const result = await flow.prepare(
			input({
				projectConfig: originalConfig,
				onCommitPicker: () => {
					committed = true;
				},
			}),
		);

		expect(result.kind).toBe("failed");
		expect(committed).toBe(false);
		expect(calls).toEqual([
			"setRecordingMode:studio",
			"setProjectConfig",
			"restoreRecordingMode:instant",
			"showEditor",
		]);
		expect(originalConfig).toEqual({ title: "Original", segments: [1, 2] });
	});

	it("clears the native target and overlays when opening the picker fails", async () => {
		const { calls, ops } = operations({
			openTargetSelectOverlays: async () => {
				calls.push("openTargetSelectOverlays:display");
				throw new Error("overlay failed");
			},
		});
		const flow = createEditorRecordingFlow(ops);

		const result = await flow.prepare(
			input({
				onCommitPicker: () => calls.push("onCommitPicker"),
			}),
		);

		expect(result.kind).toBe("failed");
		expect(calls).toEqual([
			"setRecordingMode:studio",
			"setProjectConfig",
			"setEditorRecordingTarget:/projects/one.cap:editor-owner-one:recording-request-one",
			"openTargetSelectOverlays:display",
			"clearEditorRecordingTarget:/projects/one.cap:editor-owner-one:recording-request-one",
			"closeTargetSelectOverlays",
			"restoreRecordingMode:instant",
			"showEditor",
		]);
	});

	it("shows the editor again when hiding it for the picker fails", async () => {
		const { calls, ops } = operations({
			hideEditorForPicker: async () => {
				calls.push("hideEditorForPicker");
				throw new Error("hide failed");
			},
		});
		const flow = createEditorRecordingFlow(ops);

		const result = await flow.prepare(
			input({
				onCommitPicker: () => calls.push("onCommitPicker"),
			}),
		);

		expect(result.kind).toBe("failed");
		expect(calls).toEqual([
			"setRecordingMode:studio",
			"setProjectConfig",
			"setEditorRecordingTarget:/projects/one.cap:editor-owner-one:recording-request-one",
			"openTargetSelectOverlays:display",
			"onCommitPicker",
			"hideEditorForPicker",
			"clearEditorRecordingTarget:/projects/one.cap:editor-owner-one:recording-request-one",
			"closeTargetSelectOverlays",
			"restoreRecordingMode:instant",
			"showEditor",
		]);
	});

	it("reports rollback failures instead of swallowing them", async () => {
		const { calls, ops } = operations({
			setProjectConfig: async () => {
				calls.push("setProjectConfig");
				throw new Error("save failed");
			},
			restoreRecordingMode: async () => {
				calls.push("restoreRecordingMode:instant");
				throw new Error("restore failed");
			},
		});
		const flow = createEditorRecordingFlow(ops);

		const result = await flow.prepare(input());

		expect(result.kind).toBe("failed");
		expect(calls).toEqual([
			"setRecordingMode:studio",
			"setProjectConfig",
			"restoreRecordingMode:instant",
			"showEditor",
			"reportRollbackError:Error: restore failed",
		]);
	});

	it("cancels while binding and clears the late binding without committing the picker", async () => {
		const binding = deferred<void>();
		const { calls, ops } = operations({
			setEditorRecordingTarget: async (path, ownerId, requestId) => {
				calls.push(
					`setEditorRecordingTarget:${path ?? "null"}:${ownerId}:${requestId}`,
				);
				if (path) await binding.promise;
			},
		});
		const flow = createEditorRecordingFlow(ops);
		let committed = false;

		const preparation = flow.prepare(
			input({
				onCommitPicker: () => {
					committed = true;
				},
			}),
		);
		while (
			!calls.includes(
				"setEditorRecordingTarget:/projects/one.cap:editor-owner-one:recording-request-one",
			)
		)
			await Promise.resolve();
		const cancellation = flow.cancel();
		binding.resolve();

		const [result] = await Promise.all([preparation, cancellation]);

		expect(result.kind).toBe("cancelled");
		expect(committed).toBe(false);
		expect(calls).toEqual([
			"setRecordingMode:studio",
			"setProjectConfig",
			"setEditorRecordingTarget:/projects/one.cap:editor-owner-one:recording-request-one",
			"clearEditorRecordingTarget:/projects/one.cap:editor-owner-one:recording-request-one",
			"restoreRecordingMode:instant",
			"showEditor",
		]);
	});

	it("serializes duplicate clicks so only the first preparation can commit", async () => {
		const save = deferred<void>();
		const { calls, ops } = operations({
			setProjectConfig: async () => {
				calls.push("setProjectConfig");
				await save.promise;
			},
		});
		const flow = createEditorRecordingFlow(ops);
		let commits = 0;

		const first = flow.prepare(
			input({
				onCommitPicker: () => {
					commits += 1;
				},
			}),
		);
		const duplicate = await flow.prepare(
			input({
				onCommitPicker: () => {
					commits += 1;
				},
			}),
		);
		save.resolve();

		const result = await first;

		expect(duplicate.kind).toBe("duplicate");
		expect(result.kind).toBe("ready");
		expect(commits).toBe(1);
		expect(
			calls.filter((call) => call === "openTargetSelectOverlays:display"),
		).toHaveLength(1);
	});

	it("rejects a late completion after the editor identity changes", async () => {
		let currentProjectPath = "/projects/one.cap";
		let nativeBinding: string | null = null;
		const open = deferred<void>();
		const { calls, ops } = operations({
			openTargetSelectOverlays: async (_target, mode) => {
				calls.push(`openTargetSelectOverlays:${mode}`);
				await open.promise;
			},
			clearEditorRecordingTarget: async (projectPath, ownerId, requestId) => {
				calls.push(
					`clearEditorRecordingTarget:${projectPath}:${ownerId}:${requestId}`,
				);
				if (nativeBinding === projectPath) nativeBinding = null;
			},
		});
		const flow = createEditorRecordingFlow(ops);
		let committed = false;
		let hidden = false;

		const preparation = flow.prepare(
			input({
				isProjectCurrent: (projectPath) => projectPath === currentProjectPath,
				onCommitPicker: () => {
					committed = true;
				},
				onRollbackPicker: () => {
					hidden = false;
				},
			}),
		);
		while (!calls.includes("openTargetSelectOverlays:display"))
			await Promise.resolve();
		currentProjectPath = "/projects/two.cap";
		nativeBinding = currentProjectPath;
		open.resolve();

		const result = await preparation;

		expect(result.kind).toBe("cancelled");
		expect(committed).toBe(false);
		expect(hidden).toBe(false);
		expect(calls).toContain(
			"clearEditorRecordingTarget:/projects/one.cap:editor-owner-one:recording-request-one",
		);
		expect(nativeBinding).toBe("/projects/two.cap");
		expect(calls).toContain("showEditor");
	});
});
