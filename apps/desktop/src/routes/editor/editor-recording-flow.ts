export type EditorRecordingPreparationInput<Config, Target> = {
	projectPath: string;
	ownerId: string;
	requestId: string;
	projectConfig: Config;
	previousMode: string;
	shouldStopPlayback: boolean;
	target: Target | null;
	targetMode: string;
	onCommitPicker: () => void;
	onRollbackPicker: () => void;
	isProjectCurrent?: (projectPath: string) => boolean;
};

export type EditorRecordingFlowOperations<Config, Target> = {
	stopPlayback: () => Promise<unknown>;
	setRecordingMode: (mode: string) => Promise<unknown>;
	setProjectConfig: (config: Config) => Promise<unknown>;
	setEditorRecordingTarget: (
		projectPath: string | null,
		ownerId: string,
		requestId: string,
	) => Promise<unknown>;
	clearEditorRecordingTarget: (
		projectPath: string,
		ownerId: string,
		requestId: string,
	) => Promise<unknown>;
	openTargetSelectOverlays: (
		target: Target | null,
		targetMode: string,
	) => Promise<unknown>;
	closeTargetSelectOverlays: () => Promise<unknown>;
	hideEditorForPicker: () => Promise<unknown>;
	showEditor: () => Promise<unknown>;
	restoreRecordingMode: (mode: string) => Promise<unknown>;
	reportRollbackError: (error: unknown) => void;
};

export type EditorRecordingFlowResult =
	| { kind: "ready"; projectPath: string }
	| { kind: "cancelled"; projectPath: string; rollbackErrors: unknown[] }
	| { kind: "duplicate" }
	| {
			kind: "failed";
			projectPath: string;
			error: unknown;
			rollbackErrors: unknown[];
	  };

class PreparationCancelled extends Error {
	constructor() {
		super("Editor recording preparation was cancelled");
		this.name = "PreparationCancelled";
	}
}

type ActivePreparation<Config, Target> = {
	input: EditorRecordingPreparationInput<Config, Target>;
	cancelled: boolean;
	targetBindingAttempted: boolean;
	pickerOpenAttempted: boolean;
	done?: Promise<EditorRecordingFlowResult>;
};

/**
 * Owns the async boundary between the editor's modal and the native target
 * picker. Only one preparation may run at a time, and every awaited step is
 * checked against the original project identity before a later step commits.
 */
export function createEditorRecordingFlow<Config, Target>(
	operations: EditorRecordingFlowOperations<Config, Target>,
) {
	let active: ActivePreparation<Config, Target> | undefined;

	const isCurrent = (operation: ActivePreparation<Config, Target>) =>
		active === operation &&
		!operation.cancelled &&
		(operation.input.isProjectCurrent?.(operation.input.projectPath) ?? true);

	const ensureCurrent = (operation: ActivePreparation<Config, Target>) => {
		if (!isCurrent(operation)) throw new PreparationCancelled();
	};

	const runSafely = async (
		callback: () => Promise<unknown> | unknown,
		errors: unknown[],
	) => {
		try {
			await callback();
		} catch (error) {
			errors.push(error);
		}
	};

	const rollback = async (operation: ActivePreparation<Config, Target>) => {
		const errors: unknown[] = [];

		// The UI may have changed the selected target before the first native
		// await. Always restore that UI state on a failed or cancelled attempt,
		// even when the picker window was never created.
		await runSafely(operation.input.onRollbackPicker, errors);

		if (operation.targetBindingAttempted) {
			await runSafely(
				() =>
					operations.clearEditorRecordingTarget(
						operation.input.projectPath,
						operation.input.ownerId,
						operation.input.requestId,
					),
				errors,
			);
		}

		if (operation.pickerOpenAttempted) {
			await runSafely(() => operations.closeTargetSelectOverlays(), errors);
		}

		await runSafely(
			() => operations.restoreRecordingMode(operation.input.previousMode),
			errors,
		);
		await runSafely(() => operations.showEditor(), errors);

		return errors;
	};

	const run = async (
		operation: ActivePreparation<Config, Target>,
	): Promise<EditorRecordingFlowResult> => {
		try {
			if (operation.input.shouldStopPlayback) {
				await operations.stopPlayback();
				ensureCurrent(operation);
			}

			await operations.setRecordingMode("studio");
			ensureCurrent(operation);

			await operations.setProjectConfig(operation.input.projectConfig);
			ensureCurrent(operation);

			operation.targetBindingAttempted = true;
			await operations.setEditorRecordingTarget(
				operation.input.projectPath,
				operation.input.ownerId,
				operation.input.requestId,
			);
			ensureCurrent(operation);

			operation.pickerOpenAttempted = true;
			await operations.openTargetSelectOverlays(
				operation.input.target,
				operation.input.targetMode,
			);
			ensureCurrent(operation);

			operation.input.onCommitPicker();
			ensureCurrent(operation);

			await operations.hideEditorForPicker();
			ensureCurrent(operation);

			return {
				kind: "ready",
				projectPath: operation.input.projectPath,
			};
		} catch (error) {
			const cancelled =
				error instanceof PreparationCancelled || !isCurrent(operation);
			const rollbackErrors = await rollback(operation);
			for (const rollbackError of rollbackErrors) {
				operations.reportRollbackError(rollbackError);
			}

			if (cancelled) {
				return {
					kind: "cancelled",
					projectPath: operation.input.projectPath,
					rollbackErrors,
				};
			}

			return {
					kind: "failed",
					projectPath: operation.input.projectPath,
					error,
					rollbackErrors,
			};
		} finally {
			if (active === operation) active = undefined;
		}
	};

	const prepare = (
		input: EditorRecordingPreparationInput<Config, Target>,
	): Promise<EditorRecordingFlowResult> => {
		if (active) return Promise.resolve({ kind: "duplicate" });

		const operation: ActivePreparation<Config, Target> = {
			input,
			cancelled: false,
			targetBindingAttempted: false,
			pickerOpenAttempted: false,
		};
		active = operation;
		const done = run(operation);
		operation.done = done;
		return done;
	};

	const cancel = async (): Promise<EditorRecordingFlowResult | null> => {
		const operation = active;
		if (!operation) return null;
		operation.cancelled = true;
		return (await operation.done) ?? null;
	};

	return {
		prepare,
		cancel,
		isPreparing: () => active !== undefined,
	};
}
