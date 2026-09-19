export type ReusableCaseCatalogEntry = {
  id: string;
  modes?: readonly string[];
};

export type ReusableCaseInput = {
  id: string;
  componentId: string;
  mode: string;
  communication: {
    goal?: string;
    relation: string[];
  };
  fit: {
    status: "fit" | "non-fit" | "unknown";
    reason: string;
  };
  feedback?: {
    state: "UNTESTED" | "OBSERVE" | "PASS" | "FAIL";
    note?: string;
  };
  pinned: {
    version: string;
    sourceFingerprint: string;
  };
  configRef?: string;
  notes?: string;
};

export type IndexedReusableCase = Omit<ReusableCaseInput, "feedback"> & {
  feedbackState: "UNTESTED" | "OBSERVE" | "PASS" | "FAIL";
  feedbackNote?: string;
  approvalState: "PENDING_REVIEW";
};

export type ReusableCaseIndex = {
  schema: "laohu.remotion-reusable-case-index/1";
  catalogComponentIds: string[];
  candidates: IndexedReusableCase[];
};

export type ReusableCaseQuery = {
  goal?: string;
  relation?: string | string[];
  fit?: IndexedReusableCase["fit"]["status"];
  feedbackState?: IndexedReusableCase["feedbackState"];
  pinnedVersion?: string;
  sourceFingerprint?: string;
  includeStale?: boolean;
  limit?: number;
};

export type ReusableCaseSearchResult = IndexedReusableCase & {
  score: number;
  stale: boolean;
};

/**
 * Adapts the existing componentRegistry shape without copying its component
 * ids or modes into the retrieval authority.
 */
export const catalogFromComponentRegistry = (
  registry: readonly ReusableCaseCatalogEntry[],
): ReusableCaseCatalogEntry[] =>
  registry.map(({ id, modes }) => ({
    id,
    ...(modes ? { modes: [...modes] } : {}),
  }));

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`${label} must be a non-empty string`);
  return value;
};

const relations = (value: unknown, label: string): string[] => {
  const values = Array.isArray(value) ? value : [value];
  const result = values.map((item, index) =>
    requiredString(item, `${label}[${index}]`),
  );
  if (result.length === 0) throw new Error(`${label} must not be empty`);
  return [...new Set(result)];
};

const fitStatus = (
  value: unknown,
  label: string,
): ReusableCaseInput["fit"]["status"] => {
  if (value !== "fit" && value !== "non-fit" && value !== "unknown") {
    throw new Error(`${label} must be fit, non-fit, or unknown`);
  }
  return value;
};

const feedbackState = (
  value: unknown,
  label: string,
): IndexedReusableCase["feedbackState"] => {
  if (
    value !== "UNTESTED" &&
    value !== "OBSERVE" &&
    value !== "PASS" &&
    value !== "FAIL"
  ) {
    throw new Error(`${label} must be UNTESTED, OBSERVE, PASS, or FAIL`);
  }
  return value;
};

const normalizeCatalog = (
  catalog: readonly ReusableCaseCatalogEntry[],
): Map<string, ReusableCaseCatalogEntry> => {
  const result = new Map<string, ReusableCaseCatalogEntry>();
  for (const [index, entry] of catalog.entries()) {
    if (!isObject(entry))
      throw new Error(
        `CATALOG_ENTRY_INVALID: catalog[${index}] must be an object`,
      );
    const id = requiredString(entry.id, `catalog[${index}].id`);
    if (result.has(id)) throw new Error(`CATALOG_COMPONENT_DUPLICATE: ${id}`);
    const modes = entry.modes;
    if (
      modes !== undefined &&
      (!Array.isArray(modes) || modes.some((mode) => typeof mode !== "string"))
    ) {
      throw new Error(
        `CATALOG_MODES_INVALID: ${id}.modes must be an array of strings`,
      );
    }
    result.set(id, { id, ...(modes ? { modes: [...modes] } : {}) });
  }
  return result;
};

const normalizeCase = (
  value: unknown,
  index: number,
  catalog: Map<string, ReusableCaseCatalogEntry>,
): IndexedReusableCase => {
  if (!isObject(value))
    throw new Error(`CASE_INVALID: cases[${index}] must be an object`);
  const id = requiredString(value.id, `cases[${index}].id`);
  const componentId = requiredString(
    value.componentId,
    `cases[${id}].componentId`,
  );
  const catalogEntry = catalog.get(componentId);
  if (!catalogEntry)
    throw new Error(`CATALOG_COMPONENT_UNKNOWN: ${componentId}`);
  const mode = requiredString(value.mode, `cases[${id}].mode`);
  if (catalogEntry.modes && !catalogEntry.modes.includes(mode)) {
    throw new Error(`CATALOG_MODE_UNKNOWN: ${componentId}.${mode}`);
  }
  const communication = isObject(value.communication)
    ? value.communication
    : {};
  const relation = relations(
    communication.relation,
    `cases[${id}].communication.relation`,
  );
  const goal =
    communication.goal === undefined
      ? undefined
      : requiredString(communication.goal, `cases[${id}].communication.goal`);
  const fit = isObject(value.fit) ? value.fit : {};
  const status = fitStatus(fit.status, `cases[${id}].fit.status`);
  const reason = requiredString(fit.reason, `cases[${id}].fit.reason`);
  const feedback = isObject(value.feedback) ? value.feedback : {};
  const state = feedbackState(
    feedback.state ?? "UNTESTED",
    `cases[${id}].feedback.state`,
  );
  const note =
    feedback.note === undefined
      ? undefined
      : requiredString(feedback.note, `cases[${id}].feedback.note`);
  const pinned = isObject(value.pinned) ? value.pinned : {};
  const version = requiredString(pinned.version, `cases[${id}].pinned.version`);
  const sourceFingerprint = requiredString(
    pinned.sourceFingerprint,
    `cases[${id}].pinned.sourceFingerprint`,
  );
  return {
    id,
    componentId,
    mode,
    communication: { ...(goal ? { goal } : {}), relation },
    fit: { status, reason },
    feedbackState: state,
    ...(note ? { feedbackNote: note } : {}),
    pinned: { version, sourceFingerprint },
    ...(value.configRef === undefined
      ? {}
      : {
          configRef: requiredString(value.configRef, `cases[${id}].configRef`),
        }),
    ...(value.notes === undefined
      ? {}
      : { notes: requiredString(value.notes, `cases[${id}].notes`) }),
    // A historical approval flag is deliberately not carried across the index boundary.
    approvalState: "PENDING_REVIEW",
  };
};

export const buildReusableCaseIndex = (
  cases: readonly ReusableCaseInput[] | readonly unknown[],
  catalog: readonly ReusableCaseCatalogEntry[],
): ReusableCaseIndex => {
  const catalogMap = normalizeCatalog(catalog);
  const ids = new Set<string>();
  const candidates = cases.map((value, index) => {
    const candidate = normalizeCase(value, index, catalogMap);
    if (ids.has(candidate.id))
      throw new Error(`CASE_DUPLICATE: ${candidate.id}`);
    ids.add(candidate.id);
    return candidate;
  });
  return {
    schema: "laohu.remotion-reusable-case-index/1",
    catalogComponentIds: [...catalogMap.keys()].sort(),
    candidates,
  };
};

export const searchReusableCases = (
  index: ReusableCaseIndex,
  query: ReusableCaseQuery = {},
): ReusableCaseSearchResult[] => {
  const requestedRelations =
    query.relation === undefined
      ? []
      : relations(query.relation, "query.relation");
  const relationSet = new Set(requestedRelations);
  const results = index.candidates.flatMap((candidate) => {
    const stale = Boolean(
      (query.pinnedVersion !== undefined &&
        candidate.pinned.version !== query.pinnedVersion) ||
      (query.sourceFingerprint !== undefined &&
        candidate.pinned.sourceFingerprint !== query.sourceFingerprint),
    );
    if (stale && !query.includeStale) return [];
    if (query.fit !== undefined && candidate.fit.status !== query.fit)
      return [];
    if (
      query.feedbackState !== undefined &&
      candidate.feedbackState !== query.feedbackState
    )
      return [];
    if (query.goal !== undefined && candidate.communication.goal !== query.goal)
      return [];
    if (
      relationSet.size > 0 &&
      !candidate.communication.relation.some((relation) =>
        relationSet.has(relation),
      )
    )
      return [];
    let score = 0;
    if (query.goal !== undefined && candidate.communication.goal === query.goal)
      score += 4;
    if (relationSet.size > 0) {
      for (const relation of candidate.communication.relation) {
        if (relationSet.has(relation)) score += 5;
      }
    }
    if (candidate.fit.status === "fit") score += 1;
    if (candidate.feedbackState === "PASS") score += 1;
    if (stale) score -= 100;
    return [{ ...candidate, score, stale }];
  });
  results.sort(
    (left, right) =>
      right.score - left.score || left.id.localeCompare(right.id),
  );
  const limit =
    query.limit === undefined
      ? results.length
      : Math.max(0, Math.floor(query.limit));
  return results.slice(0, limit);
};
