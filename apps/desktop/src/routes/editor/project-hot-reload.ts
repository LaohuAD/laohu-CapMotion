export type ExternalProjectUpdateDecision = "ignore" | "auto-apply" | "prompt";

export function decideExternalProjectUpdate({
	persistedRevision,
	incomingRevision,
	hasPendingSave,
	saveInFlight,
}: {
	persistedRevision: number;
	incomingRevision: number;
	hasPendingSave: boolean;
	saveInFlight: boolean;
}): ExternalProjectUpdateDecision {
	if (incomingRevision <= persistedRevision) return "ignore";
	if (hasPendingSave || saveInFlight) return "prompt";
	return "auto-apply";
}
