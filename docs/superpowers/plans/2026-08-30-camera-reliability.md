# Camera Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Cap from restarting the same camera unnecessarily and present distinct, actionable states for permission, external occupation, disconnection, and initialization failure.

**Architecture:** Make camera `SetInput` idempotent at the shared feed actor so every caller benefits, then classify backend failures into a typed preview issue. The Webview and GPUI camera windows render that shared classification while technical device IDs and raw diagnostic strings remain in logs.

**Tech Stack:** Rust/Kameo camera actor, Tauri events, SolidJS i18n, GPUI, Cargo tests, Vitest coverage tests.

---

## File map

- Modify `crates/recording/src/feeds/camera.rs`: idempotent same-device request planning and capture reuse.
- Modify `apps/desktop/src-tauri/src/lib.rs`: typed camera issue classification and event payload.
- Modify `apps/desktop/src/routes/camera.tsx`: localized typed issue rendering.
- Modify `apps/desktop-gpui/src/camera_window.rs`: mirror typed categories in native UI.
- Modify `apps/desktop/src/i18n.tsx`: user-facing English and Chinese issue text.
- Modify `apps/desktop/src/utils/tauri.ts` and `apps/src/utils/tauri.ts`: generated contracts when applicable.

### Task 1: Make same-camera setup requests idempotent

**Files:**
- Modify: `crates/recording/src/feeds/camera.rs:120-310,1117-1205`
- Test: `crates/recording/src/feeds/camera.rs`

- [ ] **Step 1: Write failing request-planning tests**

Add a pure planner independent of real hardware:

```rust
#[test]
fn same_attached_camera_and_settings_are_reused() {
    assert_eq!(plan_camera_set_input(
        Some((&camera_id("cam"), settings(1280, 720, 30.0), CameraInputPhase::Attached)),
        &camera_id("cam"), settings(1280, 720, 30.0)
    ), CameraSetInputPlan::ReuseAttached);
}

#[test]
fn same_connecting_camera_waits_for_existing_setup() {
    assert_eq!(plan_camera_set_input(
        Some((&camera_id("cam"), None, CameraInputPhase::Connecting)),
        &camera_id("cam"), None
    ), CameraSetInputPlan::AwaitConnecting);
}

#[test]
fn changed_device_or_format_restarts_capture() {
    assert_eq!(plan_camera_set_input(
        Some((&camera_id("cam-a"), None, CameraInputPhase::Attached)),
        &camera_id("cam-b"), None
    ), CameraSetInputPlan::Restart);
}
```

- [ ] **Step 2: Run and verify RED**

Run: `cargo test -p cap-recording camera_set_input --lib`

Expected: planner and phase types are missing.

- [ ] **Step 3: Store settings with connecting and attached state**

Add `settings: Option<CameraDeviceSettings>` to `ConnectingState` and `AttachedState`, carrying it through `InputConnected`. This lets equality include the selected format rather than assuming every same-device request is identical.

- [ ] **Step 4: Reuse in-flight or attached input**

Before cancelling `done_tx` or incrementing the generation:

- `ReuseAttached`: return an immediately ready boxed future containing the attached `CameraInfo` and `VideoInfo`.
- `AwaitConnecting`: clone the existing shared ready future and return `camera_ready_future` for it.
- `Restart`: retain the current teardown and new-generation path.

Do not make permission or externally occupied failures loop forever; failed setup clears the matching generation exactly as today.

- [ ] **Step 5: Run camera-feed tests**

Run: `cargo test -p cap-recording camera_set_input --lib`

Expected: reuse, await, and restart tests pass without accessing a physical camera.

- [ ] **Step 6: Commit idempotent ownership**

```bash
git add crates/recording/src/feeds/camera.rs
git commit -m "fix: reuse identical camera capture requests"
```

### Task 2: Classify camera failures into typed user states

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs:790-835`
- Test: `apps/desktop/src-tauri/src/lib.rs:195-235`

- [ ] **Step 1: Write failing classification tests**

```rust
#[test]
fn camera_errors_are_not_all_reported_as_permissions() {
    assert_eq!(classify_camera_preview_error("DeviceNotFound"), CameraPreviewIssueKind::Disconnected);
    assert_eq!(classify_camera_preview_error("StartCapturing/Cannot use Camera"), CameraPreviewIssueKind::InUse);
    assert_eq!(classify_camera_preview_error("CameraTimeout"), CameraPreviewIssueKind::NoFrames);
    assert_eq!(classify_camera_preview_error("InvalidFormat"), CameraPreviewIssueKind::UnsupportedFormat);
}
```

- [ ] **Step 2: Run and verify RED**

Run: `cargo test -p cap-desktop camera_errors_are_not --lib`

Expected: typed issue enum/classifier does not exist.

- [ ] **Step 3: Add the typed event payload**

Define a Specta/Serde enum:

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
enum CameraPreviewIssueKind {
    PermissionDenied,
    InUse,
    Disconnected,
    NoFrames,
    UnsupportedFormat,
    InitialisationFailed,
}
```

Change `CameraPreviewErrorPayload` to `{ kind, device_name: Option<String>, diagnostic: String }`. `diagnostic` is for logs/diagnostics and must not be rendered as the primary localized UI message. Permission status comes from the existing OS permission check; do not infer permission denial merely from `StartCapturing`.

- [ ] **Step 4: Keep retries bounded by category**

Disconnected, permission-denied, and externally-in-use errors should not repeat three full capture attempts. `NoFrames` may use the existing native → compatibility retry and bounded outer retry. Preserve one user notification after the final decision rather than one notification per attempt.

- [ ] **Step 5: Run classification tests and regenerate bindings**

Run: `cargo test -p cap-desktop camera_ --lib`

Run: `pnpm --dir apps/desktop run preparescript`

Expected: tests pass and the generated payload contains the typed kind.

- [ ] **Step 6: Commit typed issues**

```bash
git add apps/desktop/src-tauri/src/lib.rs apps/desktop/src/utils/tauri.ts apps/src/utils/tauri.ts
git commit -m "feat: classify camera preview failures"
```

### Task 3: Localize actionable Webview and GPUI camera errors

**Files:**
- Modify: `apps/desktop/src/routes/camera.tsx:55-160`
- Modify: `apps/desktop-gpui/src/camera_window.rs:340-375`
- Modify: `apps/desktop/src/i18n.tsx`
- Modify: `apps/desktop/src/i18n.test.ts`

- [ ] **Step 1: Write failing translation tests**

Add required keys to the existing parity test expectations:

```ts
for (const key of [
  "camera.issue.permissionDenied",
  "camera.issue.inUse",
  "camera.issue.disconnected",
  "camera.issue.noFrames",
  "camera.issue.unsupportedFormat",
  "camera.issue.initialisationFailed",
]) {
  expect(en[key]).toBeTruthy();
  expect(zhCN[key]).toBeTruthy();
}
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --dir apps/desktop exec vitest run src/i18n.test.ts`

Expected: the new keys are missing.

- [ ] **Step 3: Add user-facing translations**

Chinese messages must explain the next action, for example:

- `permissionDenied`: “尚未获得摄像头权限，请在系统设置中允许 Cap 使用摄像头”
- `inUse`: “摄像头正被其他软件占用，请关闭占用摄像头的软件后重试”
- `disconnected`: “摄像头已断开，请重新连接或选择其他摄像头”
- `noFrames`: “摄像头已启动但没有返回画面，请检查遮挡、连接或设备状态”

Add equivalent natural English strings. Keep `Insta360 Link 2 Pro`, USB IDs, model IDs, and raw error codes untranslated.

- [ ] **Step 4: Render typed issues**

Map `CameraPreviewIssueKind` to i18n keys in `camera.tsx`. Only show an authorization action when the permission API reports denied/not-determined. Map the same categories in GPUI so the startup window and Webview camera bubble do not disagree.

- [ ] **Step 5: Run frontend and GPUI checks**

Run: `pnpm --dir apps/desktop exec vitest run src/i18n.test.ts src/i18n-literals.test.ts`

Run: `cargo check -p cap-desktop-gpui -p cap-desktop`

Run: `pnpm exec tsc -b`

Expected: translation tests and both desktop frontends compile.

- [ ] **Step 6: Commit localized errors**

```bash
git add apps/desktop/src/routes/camera.tsx apps/desktop-gpui/src/camera_window.rs apps/desktop/src/i18n.tsx apps/desktop/src/i18n.test.ts
git commit -m "fix: show actionable camera failure states"
```

### Task 4: Verify camera reliability without claiming external hardware success

**Files:**
- No source changes expected.

- [ ] **Step 1: Run deterministic checks**

```bash
cargo test -p cap-recording camera_set_input --lib
cargo test -p cap-desktop camera_ --lib
pnpm --dir apps/desktop exec vitest run src/i18n.test.ts src/i18n-literals.test.ts
cargo check -p cap-desktop-gpui -p cap-desktop
pnpm --dir apps/desktop build
```

Expected: all commands pass without opening the camera or Cap UI.

- [ ] **Step 2: Record the manual hardware boundary**

Do not claim the Insta360 problem is fixed solely from unit tests. After all three plans pass, ask the user before opening Cap once, then verify:

1. Insta360 preview opens once without a second restart.
2. Starting Studio recording reuses the feed.
3. Another app occupying the camera produces the “in use” state, not “authorize”.
4. Releasing the other app and retrying recovers without restarting Cap.
