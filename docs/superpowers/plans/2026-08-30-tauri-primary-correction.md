# Tauri Primary Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tauri the single local development and acceptance entry, move the pre-recording controls to a stable center-upper position in Tauri, and verify that the existing configurable Q/W/E and wheel behavior is complete without extending the unfinished GPUI UI.

**Architecture:** Keep recording, project, timeline, Motion and rendering behavior in shared crates, while Tauri remains the only active UI adapter. Remove the accidental local GPUI-only overlay change, add an explicit Tauri-only dev script, reuse Tauri's existing editor command path, and add focused pure-function tests around the pieces that currently lack coverage.

**Tech Stack:** Bash, pnpm 10.5.2, Tauri 2, SolidJS, TypeScript, Vitest, Rust shared crates.

---

## File map

- Modify `scripts/start-cap.sh`: replace the direct GPUI Cargo entry with a Tauri-only development entry and actionable prerequisite checks.
- Modify `apps/desktop/package.json`: add a `dev:tauri` script that does not build or supervise GPUI.
- Restore `apps/desktop-gpui/src/target_overlay.rs`: remove the uncommitted center-upper experiment from the inactive UI.
- Restore `apps/desktop-gpui/README.md`: remove the documentation row for the reverted experiment.
- Create `apps/desktop/src/routes/pre-recording-controls.tsx`: own the reusable center-upper position calculation and Solid wrapper.
- Create `apps/desktop/src/routes/pre-recording-controls.test.ts`: verify centering and edge clamping independently from the webview.
- Modify `apps/desktop/src/routes/target-select-overlay.tsx`: use the reusable wrapper for camera, display, window and area recording controls while leaving crop dimming untouched.
- Modify `apps/desktop/src/routes/editor/timeline-commands.ts`: expose the generic overlay split primitive already embedded in the editor context.
- Modify `apps/desktop/src/routes/editor/timeline-commands.test.ts`: cover split success, minimum duration rejection and right-segment construction.
- Modify `apps/desktop/src/routes/editor/context.ts`: call the tested split primitive instead of maintaining a private duplicate.
- Modify `README.md`: declare Tauri UI ownership, the Tauri-only launch command and the GPUI migration boundary.

### Task 1: Restore the correct desktop entry

**Files:**
- Modify: `scripts/start-cap.sh`
- Modify: `apps/desktop/package.json`
- Restore: `apps/desktop-gpui/src/target_overlay.rs`
- Restore: `apps/desktop-gpui/README.md`

- [ ] **Step 1: Run an entry audit that fails on the current script**

Run:

```bash
if rg -n 'prepare-gpui|desktop-gpui|cargo run' scripts/start-cap.sh; then
  echo 'FAIL: start-cap.sh still launches GPUI' >&2
  exit 1
fi
```

Expected: FAIL and print the current GPUI preparation and `cargo run` lines.

- [ ] **Step 2: Add a dedicated Tauri-only package script**

Add this entry to `apps/desktop/package.json` immediately after `"dev"`:

```json
"dev:tauri": "pnpm -w cap-setup && pnpm build:sidecar && dotenv -e ../../.env -- pnpm run preparescript && dotenv -e ../../.env -- pnpm tauri dev",
```

This deliberately omits `build:gpui:dev` and `scripts/dev-desktop.mjs`, because both belong to the optional dual-app development harness.

- [ ] **Step 3: Replace the shell entry with Tauri-only startup**

Keep the existing FFmpeg 7 detection, but remove `prepare-gpui-dependency.sh`, `CARGO_TARGET_DIR`, `CARGO_PROFILE_DEV_DEBUG` and the GPUI `cargo run`. The complete script body after `repo_root=...` must be:

```bash
if ! command -v pnpm >/dev/null 2>&1; then
	echo "error: pnpm 10.5.2 is required" >&2
	exit 1
fi

if [[ ! -d "$repo_root/node_modules/.pnpm" ]]; then
	echo "error: project dependencies are missing" >&2
	echo "run: cd \"$repo_root\" && pnpm install --frozen-lockfile" >&2
	exit 1
fi

if [[ "$(uname -s)" == "Darwin" ]]; then
	if ! command -v brew >/dev/null 2>&1; then
		echo "error: Homebrew is required to locate FFmpeg 7" >&2
		exit 1
	fi
	ffmpeg_prefix="$(brew --prefix ffmpeg@7 2>/dev/null || true)"
	if [[ -z "$ffmpeg_prefix" || ! -d "$ffmpeg_prefix/lib/pkgconfig" ]]; then
		echo "error: FFmpeg 7 is required. Install it with: brew install ffmpeg@7" >&2
		exit 1
	fi
	export PATH="$ffmpeg_prefix/bin:$PATH"
	export PKG_CONFIG_PATH="$ffmpeg_prefix/lib/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
fi

export CAP_GPUI_DEV=0
cd "$repo_root"
exec pnpm --filter=@cap/desktop dev:tauri
```

- [ ] **Step 4: Remove only the current branch's uncommitted GPUI overlay experiment**

Use `apply_patch` to remove `CONTROLS_EDGE_MARGIN`, `CONTROLS_VERTICAL_CENTER_RATIO`, `pre_recording_controls_origin`, `render_fixed_controls_cluster` and its unit test from `apps/desktop-gpui/src/target_overlay.rs`. Restore the four call sites to:

```rust
.child(self.render_controls_cluster(self.target(cx), false, cx))
```

Restore `render_area_controls` to its original below/above/inside-crop calculation. Remove only the `Start controls stay center-upper` row from `apps/desktop-gpui/README.md`. Do not touch any other GPUI or user changes.

- [ ] **Step 5: Verify the entry and GPUI cleanup**

Run:

```bash
bash -n scripts/start-cap.sh
node -e 'const p=require("./apps/desktop/package.json"); if (!p.scripts["dev:tauri"] || p.scripts["dev:tauri"].includes("gpui")) process.exit(1)'
if rg -n 'prepare-gpui|desktop-gpui|cargo run' scripts/start-cap.sh; then exit 1; fi
git diff --exit-code -- apps/desktop-gpui/src/target_overlay.rs apps/desktop-gpui/README.md
```

Expected: all commands exit 0; the two GPUI files have no working-tree diff.

- [ ] **Step 6: Commit the startup correction**

```bash
git add scripts/start-cap.sh apps/desktop/package.json
git commit -m "fix: use Tauri as the local desktop entry"
```

### Task 2: Place every Tauri pre-recording control center-upper

**Files:**
- Create: `apps/desktop/src/routes/pre-recording-controls.tsx`
- Create: `apps/desktop/src/routes/pre-recording-controls.test.ts`
- Modify: `apps/desktop/src/routes/target-select-overlay.tsx`

- [ ] **Step 1: Write the failing position tests**

Create `apps/desktop/src/routes/pre-recording-controls.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { preRecordingControlsOrigin } from "./pre-recording-controls";

describe("pre-recording controls position", () => {
	it("centers a 416x88 control at 40 percent of a 1920x1080 display", () => {
		expect(
			preRecordingControlsOrigin(
				{ width: 1920, height: 1080 },
				{ width: 416, height: 88 },
			),
		).toEqual({ left: 752, top: 388 });
	});

	it("keeps controls inside a smaller display", () => {
		expect(
			preRecordingControlsOrigin(
				{ width: 800, height: 600 },
				{ width: 416, height: 88 },
			),
		).toEqual({ left: 192, top: 196 });
	});

	it("clamps both axes to the safe margin", () => {
		expect(
			preRecordingControlsOrigin(
				{ width: 360, height: 180 },
				{ width: 328, height: 160 },
			),
		).toEqual({ left: 16, top: 16 });
	});
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
pnpm --dir apps/desktop exec vitest run src/routes/pre-recording-controls.test.ts
```

Expected: FAIL because `pre-recording-controls.tsx` does not exist.

- [ ] **Step 3: Implement the position helper and wrapper**

Create `apps/desktop/src/routes/pre-recording-controls.tsx`:

```tsx
import { createElementSize } from "@solid-primitives/resize-observer";
import { createMemo, type ParentComponent } from "solid-js";

type Size = { width: number; height: number };
const SAFE_MARGIN = 16;
const VERTICAL_CENTER_RATIO = 0.4;
const clamp = (value: number, minimum: number, maximum: number) =>
	Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

export function preRecordingControlsOrigin(viewport: Size, controls: Size) {
	return {
		left: clamp(
			(viewport.width - controls.width) / 2,
			SAFE_MARGIN,
			viewport.width - controls.width - SAFE_MARGIN,
		),
		top: clamp(
			viewport.height * VERTICAL_CENTER_RATIO - controls.height / 2,
			SAFE_MARGIN,
			viewport.height - controls.height - SAFE_MARGIN,
		),
	};
}

export const CenterUpperRecordingControls: ParentComponent = (props) => {
	let root: HTMLDivElement | undefined;
	const size = createElementSize(() => root);
	const origin = createMemo(() => {
		if (!size.width || !size.height) return null;
		return preRecordingControlsOrigin(
			{ width: window.innerWidth, height: window.innerHeight },
			{ width: size.width, height: size.height },
		);
	});

	return (
		<div
			ref={root}
			class="fixed z-[60] max-w-[calc(100vw-2rem)]"
			style={{
				left: origin() ? `${origin()!.left}px` : "-1000px",
				top: origin() ? `${origin()!.top}px` : "-1000px",
			}}
		>
			{props.children}
		</div>
	);
};
```

- [ ] **Step 4: Run the helper tests**

```bash
pnpm --dir apps/desktop exec vitest run src/routes/pre-recording-controls.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Replace the four independent Tauri placements**

In `apps/desktop/src/routes/target-select-overlay.tsx`:

1. Remove its direct `createElementSize` import.
2. Import `CenterUpperRecordingControls` from `./pre-recording-controls`.
3. Wrap each of the four complete, existing `<RecordingControls ... />` nodes—camera-only, display, window and area—with `<CenterUpperRecordingControls>...</CenterUpperRecordingControls>`. Do not remove, rename or replace any prop on those four nodes; the wrapper changes placement only.

4. In the area branch, delete `controlsEl`, `controlsSize`, `controllerInside`, the placement constants, `setControllerInside`, its RAF cleanup and `controlsStyle`.
5. Remove `ref={controlsEl}`, `style={controlsStyle()}` and `showBackground={controllerInside()}`. Keep `Cropper`, the dimming behavior, selection toolbar, lock/fill/reset actions and capture target updates unchanged.
6. Keep `RecordingControls` itself unchanged so device selection, microphone warnings, countdown, mode menu and start dismissal behavior are preserved.

- [ ] **Step 6: Run position and overlay regressions**

```bash
pnpm --dir apps/desktop exec vitest run \
  src/routes/pre-recording-controls.test.ts \
  src/i18n-literals.test.ts \
  src/utils/manual-zoom-overlay.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the Tauri overlay change**

```bash
git add \
  apps/desktop/src/routes/pre-recording-controls.tsx \
  apps/desktop/src/routes/pre-recording-controls.test.ts \
  apps/desktop/src/routes/target-select-overlay.tsx
git commit -m "fix: keep Tauri recording controls within reach"
```

### Task 3: Close the Tauri Q/W/E test gap without rewriting existing behavior

**Files:**
- Modify: `apps/desktop/src/routes/editor/timeline-commands.ts`
- Modify: `apps/desktop/src/routes/editor/timeline-commands.test.ts`
- Modify: `apps/desktop/src/routes/editor/context.ts`

- [ ] **Step 1: Add failing split primitive tests**

Append to `timeline-commands.test.ts` and import `splitOverlaySegmentAtTime`:

```ts
it("splits an overlay into adjacent left and right segments", () => {
	const segments = [{ id: "left", start: 1, end: 7 }];
	expect(
		splitOverlaySegmentAtTime(segments, 0, 4, 0.5, (segment) => ({
			...segment,
			id: "right",
		})),
	).toBe(true);
	expect(segments).toEqual([
		{ id: "left", start: 1, end: 4 },
		{ id: "right", start: 4, end: 7 },
	]);
});

it("rejects a split that leaves either side below the minimum duration", () => {
	const segments = [{ start: 1, end: 7 }];
	expect(splitOverlaySegmentAtTime(segments, 0, 1.4, 0.5)).toBe(false);
	expect(segments).toEqual([{ start: 1, end: 7 }]);
});
```

- [ ] **Step 2: Run the timeline test to verify it fails**

```bash
pnpm --dir apps/desktop exec vitest run src/routes/editor/timeline-commands.test.ts
```

Expected: FAIL because `splitOverlaySegmentAtTime` is not exported.

- [ ] **Step 3: Move the existing generic split algorithm into the tested module**

Add to `timeline-commands.ts`:

```ts
export function splitOverlaySegmentAtTime<
	T extends { start: number; end: number },
>(
	segments: T[] | null | undefined,
	index: number,
	time: number,
	minimumDuration: number,
	createRight?: (segment: T) => T,
) {
	const segment = segments?.[index];
	if (!segment) return false;
	if (
		time - segment.start < minimumDuration ||
		segment.end - time < minimumDuration
	)
		return false;

	const originalEnd = segment.end;
	const right = createRight ? createRight(segment) : ({ ...segment } as T);
	segment.end = time;
	right.start = time;
	right.end = originalEnd;
	segments?.splice(index + 1, 0, right);
	return true;
}
```

In `context.ts`, import this function, remove the private `splitOverlayAtTime` closure, and replace its call in `editGenericTrack` with `splitOverlaySegmentAtTime` using the same arguments.

- [ ] **Step 4: Run all Tauri shortcut and wheel tests**

```bash
pnpm --dir apps/desktop exec vitest run \
  src/routes/editor/timeline-commands.test.ts \
  src/routes/editor/timeline-wheel.test.ts \
  src/utils/editor-shortcuts.test.ts
```

Expected: PASS. These tests establish configurable Q/W/E, Control+wheel zoom, Command+wheel vertical scrolling and plain-wheel horizontal panning.

- [ ] **Step 5: Verify the actual event and button paths**

```bash
rg -n 'executeTimelineEditCommand' \
  apps/desktop/src/routes/editor/Player.tsx \
  apps/desktop/src/routes/editor/Timeline/index.tsx
rg -n 'resolveTimelineWheelIntent' apps/desktop/src/routes/editor/Timeline/index.tsx
```

Expected: both the three editor buttons and configurable keydown path call `executeTimelineEditCommand`; the timeline wheel calls `resolveTimelineWheelIntent`.

- [ ] **Step 6: Commit the tested extraction**

```bash
git add \
  apps/desktop/src/routes/editor/timeline-commands.ts \
  apps/desktop/src/routes/editor/timeline-commands.test.ts \
  apps/desktop/src/routes/editor/context.ts
git commit -m "test: cover Tauri timeline split commands"
```

### Task 4: Record UI ownership and supported launch path

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the ownership section**

After `## 当前落地方向`, add:

```markdown
### 桌面界面所有权

当前日常使用、功能验收和自定义界面开发统一以 Tauri `apps/desktop` 为准。`apps/desktop-gpui` 是随上游保留的可选原生迁移实现，在达到项目迁移门槛前不作为默认启动入口，也不接受只落在 GPUI 的用户功能。

工程模型、录制、时间线变换、Motion/Remotion、渲染和 Agent/CLI 协议优先放在共享 Rust crate；Tauri 只负责当前界面和输入适配。完整边界见 [`docs/superpowers/specs/2026-08-30-tauri-primary-gpui-migration-design.md`](docs/superpowers/specs/2026-08-30-tauri-primary-gpui-migration-design.md)。
```

Replace the desktop development command block with:

```bash
./scripts/start-cap.sh
```

Explain that this script launches only Tauri and does not build or supervise GPUI. The upstream dual-app command remains available only for deliberate GPUI parity work.

- [ ] **Step 2: Verify documentation consistency**

```bash
rg -n '桌面界面所有权|start-cap.sh|Tauri|GPUI' README.md
git diff --check
```

Expected: ownership, supported command and design link are present with no whitespace errors.

- [ ] **Step 3: Commit the documentation**

```bash
git add README.md
git commit -m "docs: document Tauri desktop ownership"
```

### Task 5: Restore only required dependencies and run the correction gate

**Files:**
- Verify only; create no source file.

- [ ] **Step 1: Record disk state**

```bash
df -h .
du -sh apps/desktop-gpui/target 2>/dev/null || true
```

Expected: record available space and existing GPUI cache size before restoring dependencies.

- [ ] **Step 2: Restore pnpm dependencies only if absent**

Run only when `node_modules/.pnpm` is missing:

```bash
pnpm install --frozen-lockfile
```

Do not invoke the GPUI Cargo entry, `build:gpui:dev` or the dual-app supervisor. Re-run `df -h .` and report the delta.

- [ ] **Step 3: Run the focused Tauri test gate**

```bash
bash -n scripts/start-cap.sh
pnpm --dir apps/desktop exec vitest run \
  src/routes/pre-recording-controls.test.ts \
  src/routes/editor/timeline-commands.test.ts \
  src/routes/editor/timeline-wheel.test.ts \
  src/utils/editor-shortcuts.test.ts \
  src/utils/manual-zoom-overlay.test.ts \
  src/i18n-literals.test.ts
```

Expected: all tests PASS.

- [ ] **Step 4: Run static checks without opening Cap**

```bash
pnpm --filter=@cap/desktop exec tsc --noEmit
git diff --check
git status --short --branch
```

Expected: TypeScript exits 0, no whitespace errors, and only pre-existing unrelated user files remain untracked or modified.

- [ ] **Step 5: Confirm the implementation added no GPUI diff**

```bash
git diff 27fc543c0..HEAD --name-only | rg '^apps/desktop-gpui/' && exit 1 || true
```

Expected: no GPUI file appears.

- [ ] **Step 6: Hand off the visible test without stealing focus**

Do not start the GUI automatically. Report this command:

```bash
/Volumes/Laohu_Work/项目/老胡/老胡自媒体/老胡画面讲解/scripts/start-cap.sh
```

When the user explicitly asks to open Cap, launch it once, leave it open for Tauri HMR, and avoid repeated native restarts.
