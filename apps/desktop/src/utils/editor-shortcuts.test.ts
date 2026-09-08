import { describe, expect, it } from "vitest";
import {
	DEFAULT_EDITOR_SHORTCUTS,
	editorShortcutConflict,
	editorShortcutDisplayKeys,
	editorShortcutMatches,
	keyboardEventTargetsEditableContent,
	normalizeEditorShortcuts,
} from "./editor-shortcuts";

describe("editor shortcuts", () => {
	it("defaults to Jianying-style Q W E bindings", () => {
		expect(DEFAULT_EDITOR_SHORTCUTS.trimPrevious.code).toBe("KeyQ");
		expect(DEFAULT_EDITOR_SHORTCUTS.splitAtCursor.code).toBe("KeyW");
		expect(DEFAULT_EDITOR_SHORTCUTS.trimNext.code).toBe("KeyE");
	});

	it("backfills missing actions without reviving explicitly cleared bindings", () => {
		const normalized = normalizeEditorShortcuts({
			version: 1,
			bindings: { trimPrevious: null },
		});

		expect(normalized.trimPrevious).toBeNull();
		expect(normalized.splitAtCursor).toEqual(
			DEFAULT_EDITOR_SHORTCUTS.splitAtCursor,
		);
		expect(normalized.trimNext).toEqual(DEFAULT_EDITOR_SHORTCUTS.trimNext);
	});

	it("matches physical keys and every modifier exactly", () => {
		const binding = {
			code: "KeyW",
			meta: true,
			ctrl: false,
			alt: false,
			shift: true,
		};

		expect(
			editorShortcutMatches(binding, {
				code: "KeyW",
				metaKey: true,
				ctrlKey: false,
				altKey: false,
				shiftKey: true,
			}),
		).toBe(true);
		expect(
			editorShortcutMatches(binding, {
				code: "KeyW",
				metaKey: true,
				ctrlKey: true,
				altKey: false,
				shiftKey: true,
			}),
		).toBe(false);
	});

	it("finds conflicts while ignoring the action being edited", () => {
		const bindings = normalizeEditorShortcuts();
		expect(
			editorShortcutConflict(
				bindings,
				"trimNext",
				DEFAULT_EDITOR_SHORTCUTS.splitAtCursor,
			),
		).toBe("splitAtCursor");
		expect(
			editorShortcutConflict(
				bindings,
				"splitAtCursor",
				DEFAULT_EDITOR_SHORTCUTS.splitAtCursor,
			),
		).toBeNull();
	});

	it("renders macOS shortcut chips in platform order", () => {
		expect(
			editorShortcutDisplayKeys({
				code: "KeyE",
				meta: true,
				ctrl: true,
				alt: true,
				shift: true,
			}),
		).toEqual(["⌘", "⌃", "⌥", "⇧", "E"]);
	});

	it("treats the keyboard event target as editable even when activeElement is stale", () => {
		const textarea = { tagName: "TEXTAREA" };

		expect(
			keyboardEventTargetsEditableContent(
				{
					target: textarea,
					composedPath: () => [textarea],
				},
				{ tagName: "BODY" },
			),
		).toBe(true);
	});

	it("protects descendants of contenteditable and textbox controls", () => {
		const contentEditable = {
			tagName: "DIV",
			isContentEditable: true,
		};
		const child = { tagName: "SPAN", parentElement: contentEditable };
		const textbox = {
			tagName: "DIV",
			getAttribute: (name: string) => (name === "role" ? "textbox" : null),
		};

		expect(keyboardEventTargetsEditableContent({ target: child }, null)).toBe(
			true,
		);
		expect(keyboardEventTargetsEditableContent({ target: textbox }, null)).toBe(
			true,
		);
	});

	it("allows timeline shortcuts for non-editable targets", () => {
		const button = { tagName: "BUTTON" };

		expect(
			keyboardEventTargetsEditableContent(
				{ target: button },
				{ tagName: "BODY" },
			),
		).toBe(false);
	});
});
