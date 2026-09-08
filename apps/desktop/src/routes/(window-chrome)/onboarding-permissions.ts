import { isPermissionGranted } from "~/utils/os-permissions";
import type { OSPermission, OSPermissionStatus } from "~/utils/tauri";

export const ONBOARDING_REQUIRED_PERMISSION_KEYS = [
	"screenRecording",
	"accessibility",
] as const satisfies readonly OSPermission[];

export const ONBOARDING_OPTIONAL_PERMISSION_KEYS = [
	"microphone",
	"camera",
] as const satisfies readonly OSPermission[];

export type RequiredOnboardingPermission =
	(typeof ONBOARDING_REQUIRED_PERMISSION_KEYS)[number];

export type PermissionClaimState = Partial<
	Record<RequiredOnboardingPermission, true>
>;

export type PermissionGateOutcome =
	| "blocked"
	| "enter"
	| "restart"
	| "recovery";

export function markPermissionClaimed(
	claimed: PermissionClaimState,
	permission: OSPermission,
): PermissionClaimState {
	if (
		!ONBOARDING_REQUIRED_PERMISSION_KEYS.includes(
			permission as RequiredOnboardingPermission,
		)
	) {
		return claimed;
	}

	return { ...claimed, [permission]: true };
}

export function claimAfterSettingsChoice(
	claimed: PermissionClaimState,
	permission: OSPermission,
	shouldCheckImmediately: boolean,
	observedStatus?: OSPermissionStatus,
): PermissionClaimState {
	if (!shouldCheckImmediately || !isPermissionGranted(observedStatus)) {
		return markPermissionClaimed(claimed, permission);
	}

	return claimed;
}

export function areRequiredOnboardingPermissionsGranted(
	permissions: Partial<Record<OSPermission, OSPermissionStatus>>,
): boolean {
	return ONBOARDING_REQUIRED_PERMISSION_KEYS.every((permission) =>
		isPermissionGranted(permissions[permission]),
	);
}

export function resolvePermissionGate(
	permissions: Partial<Record<OSPermission, OSPermissionStatus>>,
	claimed: PermissionClaimState,
	restartedForPermissions: boolean,
): PermissionGateOutcome {
	if (areRequiredOnboardingPermissionsGranted(permissions)) return "enter";
	if (restartedForPermissions) return "recovery";

	const allRequiredHandled = ONBOARDING_REQUIRED_PERMISSION_KEYS.every(
		(permission) =>
			isPermissionGranted(permissions[permission]) ||
			claimed[permission] === true,
	);

	return allRequiredHandled ? "restart" : "blocked";
}
