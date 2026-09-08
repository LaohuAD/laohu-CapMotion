import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	areRequiredOnboardingPermissionsGranted,
	claimAfterSettingsChoice,
	markPermissionClaimed,
	ONBOARDING_OPTIONAL_PERMISSION_KEYS,
	ONBOARDING_REQUIRED_PERMISSION_KEYS,
	resolvePermissionGate,
} from "./onboarding-permissions";

describe("onboarding permission gate", () => {
	it("requires screen and accessibility while keeping microphone and camera optional", () => {
		expect(ONBOARDING_REQUIRED_PERMISSION_KEYS).toEqual([
			"screenRecording",
			"accessibility",
		]);
		expect(ONBOARDING_OPTIONAL_PERMISSION_KEYS).toEqual([
			"microphone",
			"camera",
		]);

		expect(
			areRequiredOnboardingPermissionsGranted({
				screenRecording: "granted",
				accessibility: "granted",
				microphone: "denied",
				camera: "empty",
			}),
		).toBe(true);
	});

	it("enters as soon as both required permissions are observed", () => {
		expect(
			resolvePermissionGate(
				{
					screenRecording: "granted",
					accessibility: "granted",
					microphone: "empty",
					camera: "denied",
				},
				{},
				false,
			),
		).toBe("enter");
	});

	it("waits until both required permissions were handled before restarting", () => {
		const check = {
			screenRecording: "denied",
			accessibility: "denied",
			microphone: "granted",
			camera: "granted",
		} as const;

		expect(resolvePermissionGate(check, {}, false)).toBe("blocked");
		expect(resolvePermissionGate(check, { screenRecording: true }, false)).toBe(
			"blocked",
		);
		expect(
			resolvePermissionGate(
				check,
				{ screenRecording: true, accessibility: true },
				false,
			),
		).toBe("restart");
	});

	it("uses recovery instead of another restart after a relaunch", () => {
		expect(
			resolvePermissionGate(
				{
					screenRecording: "denied",
					accessibility: "granted",
					microphone: "granted",
					camera: "granted",
				},
				{},
				true,
			),
		).toBe("recovery");
	});

	it("marks only required permissions as handled for a unified restart", () => {
		expect(markPermissionClaimed({}, "screenRecording")).toEqual({
			screenRecording: true,
		});
		expect(markPermissionClaimed({}, "accessibility")).toEqual({
			accessibility: true,
		});
		expect(markPermissionClaimed({}, "microphone")).toEqual({});
		expect(markPermissionClaimed({}, "camera")).toEqual({});
	});

	it("remembers a permission when the user continues directly to the next setting", () => {
		expect(
			claimAfterSettingsChoice({}, "screenRecording", false),
		).toEqual({ screenRecording: true });
		expect(
			claimAfterSettingsChoice({}, "screenRecording", true, "granted"),
		).toEqual({});
		expect(
			claimAfterSettingsChoice({}, "screenRecording", true, "denied"),
		).toEqual({ screenRecording: true });
	});

	it("does not poll permissions or hard-code an English restart dialog", () => {
		const onboarding = readFileSync(
			fileURLToPath(new URL("./onboarding.tsx", import.meta.url)),
			"utf8",
		);

		expect(onboarding).not.toContain("setInterval(fetchPermissions");
		expect(onboarding).not.toContain('title: "Restart Required"');
		expect(onboarding).not.toContain(
			'okLabel: "Restart, I\'ve granted permission"',
		);
	});
});
