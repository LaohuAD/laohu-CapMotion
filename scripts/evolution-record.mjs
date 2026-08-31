const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const nonEmptyArray = (value) => Array.isArray(value) && value.length > 0 && value.every(nonEmpty);
const layerValues = ["SOUL", "STRUCTURE", "FLESH", "SURFACE", "DIRECTION", "CHAIN", "MATERIAL", "SPEC"];
const scopeValues = ["CURRENT_WORK", "STABLE_PREFERENCE", "CANDIDATE_EXPERIENCE", "PROJECT_CAPABILITY", "FACT_CORRECTION"];
const statusValues = ["PASS", "OBSERVE", "FAIL", "UNKNOWN"];

export function validateEvolutionRecord(record) {
  const errors = [];
  if (!nonEmpty(record?.symptom)) errors.push("SYMPTOM_REQUIRED");
  if (!scopeValues.includes(record?.triggerScope)) errors.push("TRIGGER_SCOPE_INVALID");
  if (!nonEmpty(record?.earliestFailure)) errors.push("EARLIEST_FAILURE_REQUIRED");
  if (!layerValues.includes(record?.rootLayer)) errors.push("ROOT_LAYER_INVALID");
  if (!nonEmpty(record?.hypothesis)) errors.push("HYPOTHESIS_REQUIRED");
  if (!nonEmptyArray(record?.protection)) errors.push("PROTECTION_REQUIRED");
  if (!nonEmpty(record?.authorityPath)) errors.push("AUTHORITY_REQUIRED");
  if (!nonEmpty(record?.change)) errors.push("CHANGE_REQUIRED");
  if (!nonEmptyArray(record?.decisionChanges)) errors.push("DECISION_CHANGE_REQUIRED");
  if (
    !nonEmptyArray(record?.regressions?.current)
    || !nonEmptyArray(record?.regressions?.legacy)
    || !nonEmptyArray(record?.regressions?.adjacent)
  ) errors.push("REGRESSION_SET_REQUIRED");
  if (!nonEmptyArray(record?.evidence)) errors.push("EVIDENCE_REQUIRED");
  if (!nonEmpty(record?.rollback)) errors.push("ROLLBACK_REQUIRED");
  for (const level of ["STRUCTURE", "ROUTE", "BEHAVIOR", "QUALITY"]) {
    if (!statusValues.includes(record?.validation?.[level])) errors.push(`VALIDATION_${level}_INVALID`);
  }
  if (!["KEEP", "OBSERVE", "REVERT"].includes(record?.decision)) errors.push("DECISION_INVALID");
  return {ok: errors.length === 0, errors};
}
