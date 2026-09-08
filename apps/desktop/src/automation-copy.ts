import type { ActionType, AutomationRule, Trigger } from "./utils/automations";

type Translate = (source: string) => string;

export const AUTOMATION_TRIGGER_PHRASE: Record<Trigger, string> = {
	screenshotTaken: "Screenshot taken",
	studioRecordingFinished: "Studio recording ends",
	instantRecordingFinished: "Instant recording ends",
	recordingStarted: "Recording starts",
	uploadCompleted: "Upload completes",
	videoImported: "Video imported",
	recordingDeleted: "Recording deleted",
};

const ACTION_SHORT: Record<ActionType, string> = {
	copyToClipboard: "Copy to clipboard",
	saveToLocation: "Save to folder",
	export: "Export",
	upload: "Upload & copy link",
	revealInFileManager: "Reveal in file manager",
	openFile: "Open file",
	recognizeTextToClipboard: "Copy text (OCR)",
	notify: "Notify",
	openEditor: "Open editor",
	skipEditor: "Skip editor",
	applyPreset: "Apply preset",
	runCommand: "Run command",
	webhook: "Send webhook",
	deleteLocalFiles: "Delete local files",
};

const TRIGGER_NOUN: Record<Trigger, string> = {
	screenshotTaken: "Screenshot",
	studioRecordingFinished: "Studio recording",
	instantRecordingFinished: "Instant recording",
	recordingStarted: "Recording start",
	uploadCompleted: "Upload",
	videoImported: "Import",
	recordingDeleted: "Deletion",
};

const ACTION_NOUN: Record<ActionType, string> = {
	copyToClipboard: "Clipboard",
	saveToLocation: "Folder",
	export: "Export",
	upload: "Upload",
	revealInFileManager: "Reveal",
	openFile: "Open",
	recognizeTextToClipboard: "Text",
	notify: "Notify",
	openEditor: "Editor",
	skipEditor: "Skip editor",
	applyPreset: "Preset",
	runCommand: "Command",
	webhook: "Webhook",
	deleteLocalFiles: "Delete",
};

export function localizedAutomationRuleSummary(
	rule: AutomationRule,
	text: Translate,
): string {
	const trigger = text(AUTOMATION_TRIGGER_PHRASE[rule.trigger]);
	if (rule.actions.length === 0)
		return `${trigger} → ${text("no actions yet")}`;
	const actions = rule.actions.map((action) => text(ACTION_SHORT[action.type]));
	return `${trigger} → ${actions.join(", ")}`;
}

export function localizedAutomationRuleName(
	rule: AutomationRule,
	text: Translate,
): string {
	const authoredName = rule.name.trim();
	if (authoredName) return text(authoredName);

	const trigger = text(TRIGGER_NOUN[rule.trigger]);
	const first = rule.actions[0];
	if (!first) return `${trigger}${text("automation")}`;
	return `${trigger} → ${text(ACTION_NOUN[first.type])}`;
}
