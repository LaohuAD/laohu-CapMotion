export const EDITOR_SHORTCUT_ACTIONS = [
	"trimPrevious",
	"splitAtCursor",
	"trimNext",
] as const;

export type EditorShortcutAction = (typeof EDITOR_SHORTCUT_ACTIONS)[number];

export type EditorShortcutBinding = {
	code: string;
	meta: boolean;
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
};

export type EditorShortcutBindings = Record<
	EditorShortcutAction,
	EditorShortcutBinding | null
>;

export type EditorShortcutsStore = {
	version: 1;
	bindings: Partial<EditorShortcutBindings>;
};

const bare = (code: string): EditorShortcutBinding => ({
	code,
	meta: false,
	ctrl: false,
	alt: false,
	shift: false,
});

export const DEFAULT_EDITOR_SHORTCUTS: Record<
	EditorShortcutAction,
	EditorShortcutBinding
> = {
	trimPrevious: bare("KeyQ"),
	splitAtCursor: bare("KeyW"),
	trimNext: bare("KeyE"),
};

const isBinding = (value: unknown): value is EditorShortcutBinding => {
	if (!value || typeof value !== "object") return false;
	const binding = value as Partial<EditorShortcutBinding>;
	return (
		typeof binding.code === "string" &&
		binding.code.length > 0 &&
		typeof binding.meta === "boolean" &&
		typeof binding.ctrl === "boolean" &&
		typeof binding.alt === "boolean" &&
		typeof binding.shift === "boolean"
	);
};

export function normalizeEditorShortcuts(
	store?: Partial<EditorShortcutsStore> | null,
): EditorShortcutBindings {
	const raw = store?.bindings ?? {};
	return Object.fromEntries(
		EDITOR_SHORTCUT_ACTIONS.map((action) => {
			if (Object.hasOwn(raw, action) && raw[action] === null) {
				return [action, null];
			}
			const binding = raw[action];
			return [
				action,
				isBinding(binding)
					? { ...binding }
					: { ...DEFAULT_EDITOR_SHORTCUTS[action] },
			];
		}),
	) as EditorShortcutBindings;
}

type KeyboardEventLike = Pick<
	KeyboardEvent,
	"code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

type KeyboardEventTargetLike = {
	target?: unknown;
	composedPath?: () => unknown[];
};

type EditableTargetLike = {
	tagName?: unknown;
	isContentEditable?: unknown;
	getAttribute?: (name: string) => string | null;
	parentElement?: unknown;
};

function isEditableTarget(target: unknown): boolean {
	const visited = new Set<unknown>();
	let current = target;

	while (current && typeof current === "object" && !visited.has(current)) {
		visited.add(current);
		const element = current as EditableTargetLike;
		const tagName =
			typeof element.tagName === "string"
				? element.tagName.toUpperCase()
				: undefined;

		if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT")
			return true;
		if (element.isContentEditable === true) return true;
		if (element.getAttribute?.("role") === "textbox") return true;

		const contentEditable = element.getAttribute?.("contenteditable");
		if (
			contentEditable === "" ||
			contentEditable === "true" ||
			contentEditable === "plaintext-only"
		)
			return true;

		current = element.parentElement;
	}

	return false;
}

/**
 * Global editor shortcuts must yield to text editing. Inspect the event path
 * as the primary evidence and activeElement as a fallback because reactive UI
 * updates can make activeElement stale before a window-level listener runs.
 */
export function keyboardEventTargetsEditableContent(
	event: KeyboardEventTargetLike,
	activeElement: unknown = typeof document === "undefined"
		? null
		: document.activeElement,
): boolean {
	if (isEditableTarget(event.target)) return true;
	if (event.composedPath?.().some(isEditableTarget)) return true;
	return isEditableTarget(activeElement);
}

export function editorShortcutMatches(
	binding: EditorShortcutBinding | null | undefined,
	event: KeyboardEventLike,
) {
	return Boolean(
		binding &&
			binding.code === event.code &&
			binding.meta === event.metaKey &&
			binding.ctrl === event.ctrlKey &&
			binding.alt === event.altKey &&
			binding.shift === event.shiftKey,
	);
}

export function editorShortcutChord(binding: EditorShortcutBinding) {
	return [
		binding.meta ? "M" : "-",
		binding.ctrl ? "C" : "-",
		binding.alt ? "A" : "-",
		binding.shift ? "S" : "-",
		binding.code,
	].join(":");
}

export function editorShortcutConflict(
	bindings: EditorShortcutBindings,
	action: EditorShortcutAction,
	candidate: EditorShortcutBinding,
): EditorShortcutAction | null {
	const chord = editorShortcutChord(candidate);
	for (const other of EDITOR_SHORTCUT_ACTIONS) {
		if (other === action) continue;
		const binding = bindings[other];
		if (binding && editorShortcutChord(binding) === chord) return other;
	}
	return null;
}

const codeLabel = (code: string) => {
	if (code.startsWith("Key")) return code.slice(3);
	if (code.startsWith("Digit")) return code.slice(5);
	const labels: Record<string, string> = {
		Space: "Space",
		Enter: "Enter",
		Backspace: "⌫",
		Delete: "⌦",
		ArrowUp: "↑",
		ArrowDown: "↓",
		ArrowLeft: "←",
		ArrowRight: "→",
		Equal: "=",
		Minus: "-",
		Comma: ",",
		Period: ".",
		Slash: "/",
	};
	return labels[code] ?? code;
};

export function editorShortcutDisplayKeys(binding: EditorShortcutBinding) {
	const keys: string[] = [];
	if (binding.meta) keys.push("⌘");
	if (binding.ctrl) keys.push("⌃");
	if (binding.alt) keys.push("⌥");
	if (binding.shift) keys.push("⇧");
	keys.push(codeLabel(binding.code));
	return keys;
}

export function bindingFromKeyboardEvent(
	event: KeyboardEventLike,
): EditorShortcutBinding {
	return {
		code: event.code,
		meta: event.metaKey,
		ctrl: event.ctrlKey,
		alt: event.altKey,
		shift: event.shiftKey,
	};
}
