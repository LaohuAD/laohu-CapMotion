# CapMotion Onboarding Language and Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make first-run language selection persistent and make macOS permission onboarding event-driven, localized, restart-safe, and stable across local CapMotion updates.

**Architecture:** Keep macOS as the permission truth source, but move UI decisions into a small pure permission-gate module. The onboarding page checks only on explicit events and renders four permissions with two required and two optional. The local build keeps free ad-hoc signing while embedding a stable designated requirement so TCC sees later builds as the same application.

**Tech Stack:** SolidJS, TypeScript, Vitest, Tauri 2, Rust macOS permission APIs, Bash `codesign` packaging.

---

## File map

- `apps/desktop/src/routes/(window-chrome)/onboarding-permissions.ts`: permission groups and pure gate-state decisions.
- `apps/desktop/src/routes/(window-chrome)/onboarding-permissions.test.ts`: required/optional and restart/recovery tests.
- `apps/desktop/src/routes/(window-chrome)/onboarding.tsx`: language-first routing and event-driven permission UI.
- `apps/desktop/src/i18n.tsx`: localized confirmation, restart, recovery, and error copy.
- `apps/desktop/src/i18n.test.ts`: language and copy regression coverage.
- `scripts/build-cap-local.sh`: stable ad-hoc designated requirement and post-sign verification.
- `scripts/build-cap-local.test.mjs`: packaging contract regression test.

### Task 1: Define the permission gate as pure state

**Files:**
- Modify: `apps/desktop/src/routes/(window-chrome)/onboarding-permissions.ts`
- Modify: `apps/desktop/src/routes/(window-chrome)/onboarding-permissions.test.ts`

- [ ] **Step 1: Write failing tests for required/optional permissions and outcomes**

```ts
expect(ONBOARDING_REQUIRED_PERMISSION_KEYS).toEqual([
  "screenRecording",
  "accessibility",
]);
expect(ONBOARDING_OPTIONAL_PERMISSION_KEYS).toEqual(["microphone", "camera"]);
expect(areRequiredOnboardingPermissionsGranted({
  screenRecording: "granted",
  accessibility: "granted",
  microphone: "denied",
  camera: "empty",
})).toBe(true);
expect(resolvePermissionGate(check, {}, false)).toBe("blocked");
expect(resolvePermissionGate(check, {
  screenRecording: true,
  accessibility: true,
}, false)).toBe("restart");
expect(resolvePermissionGate(check, {}, true)).toBe("recovery");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --dir apps/desktop exec vitest run 'src/routes/(window-chrome)/onboarding-permissions.test.ts'`

Expected: FAIL because the required/optional constants and `resolvePermissionGate` do not exist.

- [ ] **Step 3: Implement the minimal pure model**

```ts
export const ONBOARDING_REQUIRED_PERMISSION_KEYS = [
  "screenRecording",
  "accessibility",
] as const;
export const ONBOARDING_OPTIONAL_PERMISSION_KEYS = [
  "microphone",
  "camera",
] as const;
export type RequiredOnboardingPermission =
  (typeof ONBOARDING_REQUIRED_PERMISSION_KEYS)[number];
export type PermissionGateOutcome =
  | "blocked" | "enter" | "restart" | "recovery";

export function areRequiredOnboardingPermissionsGranted(check) {
  return ONBOARDING_REQUIRED_PERMISSION_KEYS.every((key) =>
    isPermissionGranted(check[key]),
  );
}

export function resolvePermissionGate(check, claimed, restarted) {
  if (areRequiredOnboardingPermissionsGranted(check)) return "enter";
  if (restarted) return "recovery";
  const handled = ONBOARDING_REQUIRED_PERMISSION_KEYS.every(
    (key) => isPermissionGranted(check[key]) || claimed[key] === true,
  );
  return handled ? "restart" : "blocked";
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: all permission-gate tests pass.

- [ ] **Step 5: Commit only the two permission-model files**

```bash
git add 'apps/desktop/src/routes/(window-chrome)/onboarding-permissions.ts' 'apps/desktop/src/routes/(window-chrome)/onboarding-permissions.test.ts'
git commit -m "fix: model onboarding permission gate"
```

### Task 2: Add complete bilingual permission copy

**Files:**
- Modify: `apps/desktop/src/i18n.tsx`
- Modify: `apps/desktop/src/i18n.test.ts`

- [ ] **Step 1: Write failing translation tests**

```ts
expect(translate("zh-CN", "onboarding.permissions.confirmGranted")).toBe(
  "我已授权，检查一次",
);
expect(translate("zh-CN", "onboarding.permissions.continueSetting")).toBe(
  "继续设置其他权限",
);
expect(translate("zh-CN", "onboarding.permissions.restartOnce")).toBe(
  "完成授权并重启",
);
expect(translate("en", "onboarding.permissions.recheck")).toBe("Check again");
```

- [ ] **Step 2: Run the i18n test and verify RED**

Run: `pnpm --dir apps/desktop exec vitest run src/i18n.test.ts`

Expected: TypeScript/test failure because the new translation keys are missing.

- [ ] **Step 3: Add matching English and Simplified Chinese keys**

Add keys for `required`, `optional`, `confirmTitle`, `confirmDescription`, `confirmGranted`, `continueSetting`, `pendingRestart`, `restartOnce`, `recoveryTitle`, `recoveryDescription`, `recheck`, `openSettingsFailed`, and `checkFailed`. Keep `CapMotion`, macOS, paths, and technical names unchanged.

- [ ] **Step 4: Run the i18n test and verify GREEN**

Run the Step 2 command. Expected: all i18n tests pass.

- [ ] **Step 5: Commit only i18n files**

```bash
git add apps/desktop/src/i18n.tsx apps/desktop/src/i18n.test.ts
git commit -m "feat: localize permission onboarding states"
```

### Task 3: Replace permission polling with explicit checks

**Files:**
- Modify: `apps/desktop/src/routes/(window-chrome)/onboarding.tsx`
- Modify: `apps/desktop/src/routes/(window-chrome)/onboarding-permissions.ts`
- Modify: `apps/desktop/src/routes/(window-chrome)/onboarding-permissions.test.ts`

- [ ] **Step 1: Add a failing state test for user-confirmed permissions**

```ts
expect(markPermissionClaimed({}, "screenRecording")).toEqual({
  screenRecording: true,
});
expect(markPermissionClaimed({}, "microphone")).toEqual({});
```

- [ ] **Step 2: Run the permission test and verify RED**

Run the Task 1 Vitest command. Expected: FAIL because `markPermissionClaimed` is missing.

- [ ] **Step 3: Implement the helper and wire the page**

In `onboarding.tsx`:

- remove the 250 ms `setInterval` effect;
- check only on mount, user confirmation, manual recheck, and post-relaunch startup;
- replace hard-coded English `ask` text with active-language `t(...)` values;
- after confirmation, perform exactly one check and mark only an unresolved required item as claimed;
- render required badges on the first two rows and optional badges on the last two;
- derive the bottom action from `resolvePermissionGate`;
- write `cap.onboarding.permissionRestartRequested` to `localStorage` immediately before `relaunch()` and consume it on the next launch;
- show localized non-blocking errors for failed checks or failed system-settings opens.

The bottom action must follow this branch:

```ts
switch (gate()) {
  case "enter": return handleNext();
  case "restart":
    localStorage.setItem(PERMISSION_RESTART_MARKER, "1");
    return relaunch();
  case "recovery": return fetchPermissions(false);
  case "blocked": return;
}
```

- [ ] **Step 4: Run focused tests and desktop type checking**

```bash
pnpm --dir apps/desktop exec vitest run 'src/routes/(window-chrome)/onboarding-permissions.test.ts' src/i18n.test.ts
pnpm --dir apps/desktop exec tsc --noEmit
```

Expected: tests pass and TypeScript reports no errors.

- [ ] **Step 5: Commit the onboarding interaction**

```bash
git add 'apps/desktop/src/routes/(window-chrome)/onboarding.tsx' 'apps/desktop/src/routes/(window-chrome)/onboarding-permissions.ts' 'apps/desktop/src/routes/(window-chrome)/onboarding-permissions.test.ts'
git commit -m "fix: make onboarding permissions event driven"
```

### Task 4: Protect one-time language choice

**Files:**
- Modify: `apps/desktop/src/i18n.tsx`
- Modify: `apps/desktop/src/i18n.test.ts`

- [ ] **Step 1: Write a failing selection-semantics test**

```ts
expect(hasSelectedAppLanguage(undefined)).toBe(false);
expect(hasSelectedAppLanguage(null)).toBe(false);
expect(hasSelectedAppLanguage("zh-CN")).toBe(true);
expect(hasSelectedAppLanguage("en")).toBe(true);
```

- [ ] **Step 2: Run the i18n test and verify RED**

Run the Task 2 Vitest command. Expected: FAIL because `hasSelectedAppLanguage` is missing.

- [ ] **Step 3: Implement and use the helper**

```ts
export function hasSelectedAppLanguage(
  language: AppLanguage | null | undefined,
): language is AppLanguage {
  return language === "en" || language === "zh-CN";
}
```

Make `I18nProvider.languageSelected()` call this helper for persisted settings while preserving optimistic selection during the write. Do not reset `uiLanguage` during onboarding completion or packaging.

- [ ] **Step 4: Run i18n and onboarding tests**

Run the focused commands from Tasks 2 and 3. Expected: all pass.

- [ ] **Step 5: Commit the language guard**

```bash
git add apps/desktop/src/i18n.tsx apps/desktop/src/i18n.test.ts
git commit -m "test: preserve onboarding language choice"
```

### Task 5: Stabilize the ad-hoc signing identity

**Files:**
- Modify: `scripts/build-cap-local.sh`
- Create: `scripts/build-cap-local.test.mjs`

- [ ] **Step 1: Write the failing packaging contract test**

```js
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("local packaging embeds and verifies a stable designated requirement", () => {
  const script = readFileSync(new URL("./build-cap-local.sh", import.meta.url), "utf8");
  assert.match(script, /designated => identifier \\"com\\.laohu\\.capmotion\\"/);
  assert.match(script, /codesign -d -r-/);
  assert.doesNotMatch(script, /designated => cdhash/);
});
```

- [ ] **Step 2: Run the Node test and verify RED**

Run: `node --test scripts/build-cap-local.test.mjs`

Expected: FAIL because the build script has neither a fixed requirement nor a post-sign requirement check.

- [ ] **Step 3: Embed and verify the stable requirement**

```bash
local_designated_requirement='=designated => identifier "com.laohu.capmotion"'
/usr/bin/codesign --force --deep --sign - \
  --requirements "$local_designated_requirement" \
  "$staged_app"
designated_requirement="$(/usr/bin/codesign -d -r- "$staged_app" 2>&1)"
if [[ "$designated_requirement" != *'designated => identifier "com.laohu.capmotion"'* ]]; then
  echo "error: local app did not retain the stable designated requirement" >&2
  exit 1
fi
```

- [ ] **Step 4: Run the contract test and a disposable codesign probe**

Run `node --test scripts/build-cap-local.test.mjs`, then sign a disposable executable in `/tmp` with the same requirement and inspect it using `codesign -d -r-`.

Expected: the Node test passes and the probe prints `designated => identifier "com.laohu.capmotion"`.

- [ ] **Step 5: Commit the packaging fix**

```bash
git add scripts/build-cap-local.sh scripts/build-cap-local.test.mjs
git commit -m "fix: stabilize local CapMotion permission identity"
```

### Task 6: Regression verification and handoff

**Files:**
- Verify only; do not replace the independent app without a new explicit user request.

- [ ] **Step 1: Run focused frontend tests**

```bash
pnpm --dir apps/desktop exec vitest run 'src/routes/(window-chrome)/onboarding-permissions.test.ts' src/i18n.test.ts src/utils/os-permissions.test.ts
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run desktop type checking**

Run: `pnpm --dir apps/desktop exec tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 3: Run relevant Rust permission tests**

Run: `cargo test -p cap-desktop permissions::tests --lib`

Expected: all permission tests pass.

- [ ] **Step 4: Run packaging contract and diff checks**

```bash
node --test scripts/build-cap-local.test.mjs
git diff --check
```

Expected: test pass and no whitespace errors.

- [ ] **Step 5: Report the migration boundary**

State that the source fix is complete but `/Users/a1/Applications/CapMotion.app` has not been replaced. Explain that the first package using the stable requirement may require one final off/on or remove/re-add of the old TCC entry; later local updates should preserve it.
