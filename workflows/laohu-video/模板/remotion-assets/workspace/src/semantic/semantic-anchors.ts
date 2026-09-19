export type JsonObject = Record<string, unknown>;

export type SourceIdentity = {
  mediaId: string;
  fingerprint?: string;
  revision?: string;
};

export type SemanticAnchorTiming = {
  actionDurationFrames: number;
  holdFrames: number;
};

export type ResolvedSemanticAnchor = SemanticAnchorTiming & {
  anchorId: string;
  itemId: string;
  mappingSegmentId: string;
  mappingSegmentIds: string[];
  sourceWordIds: string[];
  sourceWordIndices: number[];
  sourceRange?: { start: number; end: number };
  targetTimeSeconds: number;
  compositionStartSeconds: number;
  fps: number;
  triggerAtFrame: number;
  actionEndFrame: number;
  holdEndFrame: number;
};

export type SemanticAnchorResult = {
  config: JsonObject & { items: JsonObject[] };
  resolved: ResolvedSemanticAnchor[];
  provenance: {
    source: SourceIdentity;
    mappingId?: string;
    mappingRevision: string;
    fps: number;
    compositionStartSeconds: number;
  };
};

export type SemanticAnchorErrorCode =
  | "INVALID_INPUT"
  | "SOURCE_IDENTITY_MISMATCH"
  | "STALE_MAPPING"
  | "MAPPING_ID_MISSING"
  | "INVALID_MAPPING"
  | "INVALID_SEGMENT"
  | "AMBIGUOUS_SEGMENT"
  | "INVALID_WORD"
  | "AMBIGUOUS_WORD"
  | "WORD_NOT_FOUND"
  | "DELETED_ANCHOR"
  | "WORD_SEGMENT_MISMATCH"
  | "WORD_OUTSIDE_SEGMENT"
  | "RANGE_NOT_RETAINED"
  | "RANGE_SPANS_SEGMENTS"
  | "EXPLICIT_REFERENCE_REQUIRED"
  | "DUPLICATE_ANCHOR"
  | "AMBIGUOUS_ITEM"
  | "INVALID_FPS"
  | "FRAME_BOUNDS";

export class SemanticAnchorError extends Error {
  readonly code: SemanticAnchorErrorCode;

  constructor(code: SemanticAnchorErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "SemanticAnchorError";
    this.code = code;
  }
}

type NormalizedSegment = {
  id: string;
  aliases: string[];
  sourceStart: number;
  sourceEnd: number;
  targetStart: number;
  targetEnd: number;
};

type NormalizedWord = {
  id?: string;
  index?: number;
  start: number;
  end: number;
  segmentAliases: string[];
  deleted: boolean;
};

type NormalizedMapping = {
  id?: string;
  revision: string;
  source: SourceIdentity;
  fps?: number;
  segments: NormalizedSegment[];
  words: NormalizedWord[];
  deletedWordIds: Set<string>;
};

const EPSILON = 1e-7;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const objectOrFail = (value: unknown, label: string): JsonObject => {
  if (!isObject(value)) {
    throw new SemanticAnchorError(
      "INVALID_INPUT",
      `${label} must be an object`,
    );
  }
  return value;
};

const arrayOrFail = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new SemanticAnchorError("INVALID_INPUT", `${label} must be an array`);
  }
  return value;
};

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new SemanticAnchorError(
      "INVALID_INPUT",
      `${label} must be a non-empty string`,
    );
  }
  return value;
};

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;

const optionalIdentity = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
};

const finiteNumber = (value: unknown, label: string): number => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new SemanticAnchorError("INVALID_INPUT", `${label} must be finite`);
  }
  return number;
};

const optionalFiniteNumber = (
  value: unknown,
  label: string,
): number | undefined => {
  if (value === undefined || value === null) return undefined;
  return finiteNumber(value, label);
};

const integer = (value: unknown, label: string, minimum = 0): number => {
  const number = finiteNumber(value, label);
  if (!Number.isInteger(number) || number < minimum) {
    throw new SemanticAnchorError(
      "INVALID_INPUT",
      `${label} must be an integer >= ${minimum}`,
    );
  }
  return number;
};

const pick = (object: JsonObject, ...keys: string[]): unknown => {
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null) return object[key];
  }
  return undefined;
};

const versionString = (value: unknown, label: string): string =>
  requiredString(String(value ?? ""), label);

const equalVersion = (
  left: string | undefined,
  right: string | undefined,
): boolean => left !== undefined && right !== undefined && left === right;

const normalizeSource = (
  input: unknown,
  fallback: JsonObject,
  label: string,
  requireRevision = false,
): SourceIdentity => {
  const source = isObject(input) ? input : {};
  const mediaId =
    optionalString(input) ??
    optionalString(pick(source, "mediaId", "sourceMediaId", "id")) ??
    optionalString(
      pick(fallback, "mediaId", "sourceMediaId", "sourceProjectPath"),
    );
  if (!mediaId) {
    throw new SemanticAnchorError(
      "SOURCE_IDENTITY_MISMATCH",
      `${label} must declare an explicit mediaId/sourceProjectPath`,
    );
  }
  const fingerprint =
    optionalString(
      pick(
        source,
        "fingerprint",
        "sourceFingerprint",
        "sha256",
        "mediaFingerprint",
      ),
    ) ??
    optionalString(
      pick(
        fallback,
        "sourceFingerprint",
        "sourceSha256",
        "mediaFingerprint",
        "fingerprint",
      ),
    );
  const revisionValue =
    pick(source, "projectRevision", "sourceProjectRevision", "revision") ??
    pick(
      fallback,
      "projectRevision",
      "sourceProjectRevision",
      "revision",
      "mappingRevision",
    );
  if (requireRevision && revisionValue === undefined) {
    throw new SemanticAnchorError(
      "STALE_MAPPING",
      `${label} must declare project/mapping revision`,
    );
  }
  return {
    mediaId,
    ...(fingerprint ? { fingerprint } : {}),
    ...(revisionValue !== undefined
      ? { revision: versionString(revisionValue, `${label}.revision`) }
      : {}),
  };
};

const segmentIdentity = (value: JsonObject, index: number): string => {
  const explicit = optionalIdentity(
    pick(value, "id", "segmentId", "mappingSegmentId"),
  );
  if (explicit) return explicit;
  const numeric = pick(value, "index");
  return numeric === undefined ? String(index) : String(numeric);
};

const normalizeSegments = (value: unknown): NormalizedSegment[] => {
  const entries = arrayOrFail(value, "mapping.sequence/segments");
  if (entries.length === 0) {
    throw new SemanticAnchorError(
      "INVALID_MAPPING",
      "mapping sequence is empty",
    );
  }
  const aliases = new Map<string, string>();
  const segments = entries.map((entry, index) => {
    const object = objectOrFail(entry, `mapping segment ${index}`);
    const id = segmentIdentity(object, index);
    const originalIndex = pick(object, "index");
    const segmentAliases = [
      id,
      String(index),
      ...(originalIndex === undefined ? [] : [String(originalIndex)]),
    ].filter((candidate, position, all) => all.indexOf(candidate) === position);
    const sourceStart = finiteNumber(
      pick(object, "sourceGlobalStart", "sourceStart", "globalStart", "start"),
      `mapping segment ${id}.sourceStart`,
    );
    const sourceEnd = finiteNumber(
      pick(object, "sourceGlobalEnd", "sourceEnd", "globalEnd", "end"),
      `mapping segment ${id}.sourceEnd`,
    );
    const targetStart = finiteNumber(
      pick(object, "targetStart", "targetGlobalStart"),
      `mapping segment ${id}.targetStart`,
    );
    const targetEnd = finiteNumber(
      pick(object, "targetEnd", "targetGlobalEnd"),
      `mapping segment ${id}.targetEnd`,
    );
    if (!(sourceEnd > sourceStart) || !(targetEnd > targetStart)) {
      throw new SemanticAnchorError(
        "INVALID_SEGMENT",
        `${id} must have increasing source and target bounds`,
      );
    }
    for (const alias of segmentAliases) {
      const previous = aliases.get(alias);
      if (previous && previous !== id) {
        throw new SemanticAnchorError(
          "AMBIGUOUS_SEGMENT",
          `segment alias ${alias} resolves to both ${previous} and ${id}`,
        );
      }
      aliases.set(alias, id);
    }
    return {
      id,
      aliases: segmentAliases,
      sourceStart,
      sourceEnd,
      targetStart,
      targetEnd,
    };
  });
  return segments;
};

const normalizeWords = (
  value: unknown,
  deletedWordIds: Set<string>,
): NormalizedWord[] => {
  const raw = value === undefined ? [] : arrayOrFail(value, "mapping.words");
  const words = raw.map((entry, index) => {
    const object = objectOrFail(entry, `mapping word ${index}`);
    const id = optionalIdentity(pick(object, "id", "wordId"));
    const indexValue = pick(object, "index", "wordIndex");
    const wordIndex =
      indexValue === undefined
        ? undefined
        : integer(indexValue, `mapping word ${index}.index`);
    if (!id && wordIndex === undefined) {
      throw new SemanticAnchorError(
        "INVALID_WORD",
        `mapping word ${index} needs id or index`,
      );
    }
    const startValue = pick(
      object,
      "startSeconds",
      "start",
      "sourceStart",
      "globalStart",
    );
    const endValue = pick(
      object,
      "endSeconds",
      "end",
      "sourceEnd",
      "globalEnd",
    );
    const startMsValue = pick(
      object,
      "globalStartMs",
      "sourceStartMs",
      "startMs",
    );
    const endMsValue = pick(object, "globalEndMs", "sourceEndMs", "endMs");
    const start =
      startValue !== undefined
        ? finiteNumber(startValue, `mapping word ${id ?? wordIndex}.start`)
        : finiteNumber(
            startMsValue,
            `mapping word ${id ?? wordIndex}.startMs`,
          ) / 1000;
    const end =
      endValue !== undefined
        ? finiteNumber(endValue, `mapping word ${id ?? wordIndex}.end`)
        : finiteNumber(endMsValue, `mapping word ${id ?? wordIndex}.endMs`) /
          1000;
    if (!(end > start)) {
      throw new SemanticAnchorError(
        "INVALID_WORD",
        `mapping word ${id ?? wordIndex} has invalid range`,
      );
    }
    const segment = optionalIdentity(
      pick(object, "segmentId", "mappingSegmentId", "sourceSegmentId"),
    );
    const deleted =
      object.deleted === true ||
      object.retained === false ||
      object.status === "deleted" ||
      (id !== undefined && deletedWordIds.has(id));
    return {
      ...(id ? { id } : {}),
      ...(wordIndex !== undefined ? { index: wordIndex } : {}),
      start,
      end,
      segmentAliases: segment ? [segment] : [],
      deleted,
    };
  });
  const ids = new Set<string>();
  const indices = new Set<number>();
  for (const word of words) {
    if (word.id) {
      if (ids.has(word.id)) {
        throw new SemanticAnchorError(
          "AMBIGUOUS_WORD",
          `word id ${word.id} is repeated`,
        );
      }
      ids.add(word.id);
    }
    if (word.index !== undefined) {
      if (indices.has(word.index)) {
        throw new SemanticAnchorError(
          "AMBIGUOUS_WORD",
          `word index ${word.index} is repeated`,
        );
      }
      indices.add(word.index);
    }
  }
  return words;
};

const normalizeMapping = (value: unknown): NormalizedMapping => {
  const mapping = objectOrFail(value, "mapping");
  const revisionValue = pick(
    mapping,
    "revision",
    "mappingRevision",
    "sourceProjectRevision",
    "projectRevision",
  );
  if (revisionValue === undefined) {
    throw new SemanticAnchorError(
      "STALE_MAPPING",
      "mapping must declare a revision",
    );
  }
  const source = normalizeSource(
    mapping.source,
    mapping,
    "mapping.source",
    true,
  );
  const deletedWordIds = new Set<string>();
  const deleted = pick(
    mapping,
    "deletedWordIds",
    "removedWordIds",
    "deletedWords",
  );
  if (Array.isArray(deleted)) {
    for (const value of deleted) {
      const id = optionalIdentity(value);
      if (!id)
        throw new SemanticAnchorError(
          "INVALID_INPUT",
          "deleted word id must be a non-empty string or finite number",
        );
      deletedWordIds.add(id);
    }
  }
  const segments = normalizeSegments(mapping.sequence ?? mapping.segments);
  const words = normalizeWords(
    mapping.words ?? mapping.sourceWords ?? mapping.wordTimeline,
    deletedWordIds,
  );
  return {
    id: optionalString(pick(mapping, "mappingId", "id", "mapId")),
    revision: versionString(revisionValue, "mapping.revision"),
    source,
    fps: optionalFiniteNumber(mapping.fps, "mapping.fps"),
    segments,
    words,
    deletedWordIds,
  };
};

const sourceSegmentForAlias = (
  mapping: NormalizedMapping,
  alias: string,
): NormalizedSegment => {
  const matches = mapping.segments.filter((segment) =>
    segment.aliases.includes(alias),
  );
  if (matches.length !== 1) {
    throw new SemanticAnchorError(
      "AMBIGUOUS_SEGMENT",
      `anchor segment ${alias} does not resolve exactly once`,
    );
  }
  return matches[0];
};

const mapSourceTime = (
  segment: NormalizedSegment,
  sourceTime: number,
): number => {
  if (
    sourceTime < segment.sourceStart - EPSILON ||
    sourceTime > segment.sourceEnd + EPSILON
  ) {
    throw new SemanticAnchorError(
      "WORD_OUTSIDE_SEGMENT",
      `source time ${sourceTime} is outside ${segment.id}`,
    );
  }
  const fraction =
    (Math.min(segment.sourceEnd, Math.max(segment.sourceStart, sourceTime)) -
      segment.sourceStart) /
    (segment.sourceEnd - segment.sourceStart);
  return (
    segment.targetStart + fraction * (segment.targetEnd - segment.targetStart)
  );
};

const anchorSegmentAliases = (anchor: JsonObject): string[] => {
  const raw = pick(anchor, "segmentIds", "mappingSegmentIds");
  const values =
    raw === undefined
      ? [pick(anchor, "segmentId", "mappingSegmentId")]
      : arrayOrFail(raw, "anchor.segmentIds");
  const result = values.map((value, index) =>
    requiredString(
      optionalIdentity(value) ?? "",
      `anchor.segmentIds[${index}]`,
    ),
  );
  if (result.length === 0) {
    throw new SemanticAnchorError(
      "INVALID_INPUT",
      "anchor requires mapping segment identity",
    );
  }
  return result.filter((value, index) => result.indexOf(value) === index);
};

const timingForAnchor = (anchor: JsonObject): SemanticAnchorTiming => {
  const timing = isObject(anchor.timing) ? anchor.timing : {};
  const actionDurationFrames = integer(
    pick(anchor, "actionDurationFrames") ??
      pick(timing, "actionDurationFrames") ??
      18,
    "anchor.actionDurationFrames",
  );
  const holdFrames = integer(
    pick(anchor, "holdFrames") ?? pick(timing, "holdFrames") ?? 0,
    "anchor.holdFrames",
  );
  return { actionDurationFrames, holdFrames };
};

const triggerMode = (anchor: JsonObject): "first" | "last" => {
  const trigger = anchor.trigger;
  const raw = isObject(trigger) ? pick(trigger, "at", "word") : trigger;
  if (raw === undefined) return "first";
  if (raw !== "first" && raw !== "last") {
    throw new SemanticAnchorError(
      "INVALID_INPUT",
      "anchor.trigger must be first or last",
    );
  }
  return raw;
};

const sourceRangeForAnchor = (
  anchor: JsonObject,
): { start: number; end: number } | undefined => {
  const raw = anchor.sourceRange ?? anchor.range;
  if (raw === undefined) return undefined;
  const range = objectOrFail(raw, "anchor.sourceRange");
  const start = finiteNumber(range.start, "anchor.sourceRange.start");
  const end = finiteNumber(range.end, "anchor.sourceRange.end");
  if (!(end > start)) {
    throw new SemanticAnchorError(
      "RANGE_NOT_RETAINED",
      "anchor source range must increase",
    );
  }
  return { start, end };
};

const referenceForAnchor = (
  anchor: JsonObject,
): {
  wordIds?: string[];
  wordIndices?: number[];
  range?: { start: number; end: number };
} => {
  const rawIds = pick(anchor, "wordIds", "sourceWordIds");
  const rawIndices = pick(anchor, "wordIndices", "sourceWordIndices");
  const range = sourceRangeForAnchor(anchor);
  if (
    (rawIds !== undefined && rawIndices !== undefined) ||
    (rawIds !== undefined && range) ||
    (rawIndices !== undefined && range)
  ) {
    throw new SemanticAnchorError(
      "EXPLICIT_REFERENCE_REQUIRED",
      "anchor must use exactly one reference form",
    );
  }
  if (rawIds !== undefined) {
    const ids = arrayOrFail(rawIds, "anchor.wordIds").map((value, index) =>
      requiredString(optionalIdentity(value) ?? "", `anchor.wordIds[${index}]`),
    );
    if (
      ids.length === 0 ||
      ids.some((id, index) => ids.indexOf(id) !== index)
    ) {
      throw new SemanticAnchorError(
        "AMBIGUOUS_WORD",
        "anchor wordIds must be non-empty and unique",
      );
    }
    return { wordIds: ids };
  }
  if (rawIndices !== undefined) {
    const indices = arrayOrFail(rawIndices, "anchor.wordIndices").map(
      (value, index) => integer(value, `anchor.wordIndices[${index}`),
    );
    if (
      indices.length === 0 ||
      indices.some((value, index) => indices.indexOf(value) !== index)
    ) {
      throw new SemanticAnchorError(
        "AMBIGUOUS_WORD",
        "anchor wordIndices must be non-empty and unique",
      );
    }
    return { wordIndices: indices };
  }
  if (range) return { range };
  throw new SemanticAnchorError(
    "EXPLICIT_REFERENCE_REQUIRED",
    "spokenCue is descriptive only; anchor needs wordIds, wordIndices, or an exact sourceRange",
  );
};

const findWord = (
  words: NormalizedWord[],
  field: "id" | "index",
  value: string | number,
): NormalizedWord => {
  const matches = words.filter((word) => word[field] === value);
  if (matches.length === 0) {
    throw new SemanticAnchorError(
      "WORD_NOT_FOUND",
      `anchor word ${String(value)} is not retained in mapping`,
    );
  }
  if (matches.length !== 1) {
    throw new SemanticAnchorError(
      "AMBIGUOUS_WORD",
      `anchor word ${String(value)} resolves more than once`,
    );
  }
  const word = matches[0];
  if (word.deleted) {
    throw new SemanticAnchorError(
      "DELETED_ANCHOR",
      `anchor word ${String(value)} was deleted by the frozen mapping`,
    );
  }
  return word;
};

const resolveWordTargetTimes = (
  words: NormalizedWord[],
  segmentAliases: string[],
  mapping: NormalizedMapping,
): {
  sourceWordIds: string[];
  sourceWordIndices: number[];
  targetTimes: number[];
  segmentIds: string[];
} => {
  const allowed = new Set(segmentAliases);
  return words.reduce(
    (result, word) => {
      const matchingAliases = word.segmentAliases.filter((alias) =>
        allowed.has(alias),
      );
      if (word.segmentAliases.length > 0 && matchingAliases.length !== 1) {
        throw new SemanticAnchorError(
          "WORD_SEGMENT_MISMATCH",
          `word ${word.id ?? word.index} is not in the declared mapping segment set`,
        );
      }
      const candidates = mapping.segments.filter((segment) => {
        if (
          matchingAliases.length > 0 &&
          !segment.aliases.includes(matchingAliases[0])
        )
          return false;
        return (
          word.start >= segment.sourceStart - EPSILON &&
          word.end <= segment.sourceEnd + EPSILON
        );
      });
      if (candidates.length !== 1) {
        throw new SemanticAnchorError(
          candidates.length === 0
            ? "WORD_OUTSIDE_SEGMENT"
            : "AMBIGUOUS_SEGMENT",
          `word ${word.id ?? word.index} does not resolve to one retained mapping segment`,
        );
      }
      const segment = candidates[0];
      result.targetTimes.push(mapSourceTime(segment, word.start));
      if (word.id) result.sourceWordIds.push(word.id);
      if (word.index !== undefined) result.sourceWordIndices.push(word.index);
      result.segmentIds.push(segment.id);
      return result;
    },
    {
      sourceWordIds: [] as string[],
      sourceWordIndices: [] as number[],
      targetTimes: [] as number[],
      segmentIds: [] as string[],
    },
  );
};

const resolveAnchor = (
  anchorValue: unknown,
  index: number,
  mapping: NormalizedMapping,
  compositionStartSeconds: number,
  fps: number,
  durationInFrames: number,
): ResolvedSemanticAnchor => {
  const anchor = objectOrFail(anchorValue, `anchor ${index}`);
  const anchorId = requiredString(anchor.id, `anchor ${index}.id`);
  const itemId = requiredString(anchor.itemId, `anchor ${anchorId}.itemId`);
  const segmentAliases = anchorSegmentAliases(anchor);
  const reference = referenceForAnchor(anchor);
  let targetTimes: number[];
  let sourceWordIds: string[] = [];
  let sourceWordIndices: number[] = [];
  let resolvedSegmentIds: string[] = [];
  let sourceRange: { start: number; end: number } | undefined;

  if (reference.wordIds || reference.wordIndices) {
    const words = reference.wordIds
      ? reference.wordIds.map((value) => findWord(mapping.words, "id", value))
      : (reference.wordIndices ?? []).map((value) =>
          findWord(mapping.words, "index", value),
        );
    const resolved = resolveWordTargetTimes(words, segmentAliases, mapping);
    targetTimes = resolved.targetTimes;
    sourceWordIds = resolved.sourceWordIds;
    sourceWordIndices = resolved.sourceWordIndices;
    resolvedSegmentIds = resolved.segmentIds;
  } else {
    sourceRange = reference.range;
    if (segmentAliases.length !== 1) {
      throw new SemanticAnchorError(
        "RANGE_SPANS_SEGMENTS",
        "an exact sourceRange needs one mapping segment id",
      );
    }
    const segment = sourceSegmentForAlias(mapping, segmentAliases[0]);
    if (
      sourceRange!.start < segment.sourceStart - EPSILON ||
      sourceRange!.end > segment.sourceEnd + EPSILON
    ) {
      throw new SemanticAnchorError(
        "RANGE_NOT_RETAINED",
        `source range ${sourceRange!.start}-${sourceRange!.end} is not fully retained in ${segment.id}`,
      );
    }
    targetTimes = [mapSourceTime(segment, sourceRange!.start)];
    resolvedSegmentIds = [segment.id];
  }

  const targetTimeSeconds =
    triggerMode(anchor) === "last"
      ? Math.max(...targetTimes)
      : Math.min(...targetTimes);
  const triggerAtFrame = Math.round(
    (targetTimeSeconds - compositionStartSeconds) * fps,
  );
  const timing = timingForAnchor(anchor);
  const actionEndFrame = triggerAtFrame + timing.actionDurationFrames;
  const holdEndFrame = actionEndFrame + timing.holdFrames;
  if (triggerAtFrame < 0 || holdEndFrame > durationInFrames) {
    throw new SemanticAnchorError(
      "FRAME_BOUNDS",
      `${anchorId} resolves to frames ${triggerAtFrame}-${holdEndFrame}, outside 0-${durationInFrames}`,
    );
  }
  const segmentIds = [...new Set(resolvedSegmentIds)];
  return {
    anchorId,
    itemId,
    mappingSegmentId: segmentIds[0],
    mappingSegmentIds: segmentIds,
    sourceWordIds,
    sourceWordIndices,
    ...(sourceRange ? { sourceRange } : {}),
    targetTimeSeconds,
    compositionStartSeconds,
    fps,
    triggerAtFrame,
    ...timing,
    actionEndFrame,
    holdEndFrame,
  };
};

export const applySemanticAnchors = (
  configValue: unknown,
  anchorsValue: unknown,
  mappingValue: unknown,
): SemanticAnchorResult => {
  const config = objectOrFail(configValue, "config");
  const items = arrayOrFail(config.items, "config.items");
  if (items.length === 0) {
    throw new SemanticAnchorError(
      "INVALID_INPUT",
      "config.items must not be empty",
    );
  }
  const itemIds = new Set<string>();
  for (const [index, value] of items.entries()) {
    const item = objectOrFail(value, `config.items[${index}]`);
    const id = requiredString(item.id, `config.items[${index}].id`);
    if (itemIds.has(id))
      throw new SemanticAnchorError(
        "AMBIGUOUS_ITEM",
        `config item ${id} is repeated`,
      );
    itemIds.add(id);
  }
  const anchorsDocument = objectOrFail(anchorsValue, "anchors");
  const mapping = normalizeMapping(mappingValue);
  const source = normalizeSource(
    anchorsDocument.source,
    anchorsDocument,
    "anchors.source",
    true,
  );
  if (source.mediaId !== mapping.source.mediaId) {
    throw new SemanticAnchorError(
      "SOURCE_IDENTITY_MISMATCH",
      `anchors source ${source.mediaId} does not match mapping source ${mapping.source.mediaId}`,
    );
  }
  if (
    source.fingerprint !== undefined ||
    mapping.source.fingerprint !== undefined
  ) {
    if (
      !source.fingerprint ||
      !mapping.source.fingerprint ||
      source.fingerprint !== mapping.source.fingerprint
    ) {
      throw new SemanticAnchorError(
        "SOURCE_IDENTITY_MISMATCH",
        "source fingerprint does not match frozen mapping",
      );
    }
  }
  if (!source.revision || !equalVersion(source.revision, mapping.revision)) {
    throw new SemanticAnchorError(
      "STALE_MAPPING",
      `anchors source revision ${source.revision ?? "missing"} does not match mapping ${mapping.revision}`,
    );
  }
  const mappingReference = isObject(anchorsDocument.mapping)
    ? anchorsDocument.mapping
    : {};
  const expectedMappingId =
    optionalString(pick(mappingReference, "id", "mappingId", "mapId")) ??
    optionalString(pick(anchorsDocument, "mappingId", "mapId"));
  if (mapping.id && !expectedMappingId) {
    throw new SemanticAnchorError(
      "MAPPING_ID_MISSING",
      "anchors must pin the frozen mapping id",
    );
  }
  if (mapping.id && expectedMappingId !== mapping.id) {
    throw new SemanticAnchorError(
      "STALE_MAPPING",
      `expected mapping ${expectedMappingId}, found ${mapping.id}`,
    );
  }
  const expectedRevision =
    pick(
      mappingReference,
      "revision",
      "mappingRevision",
      "sourceProjectRevision",
    ) ?? pick(anchorsDocument, "mappingRevision", "sourceProjectRevision");
  if (
    expectedRevision === undefined ||
    versionString(expectedRevision, "anchors.mapping.revision") !==
      mapping.revision
  ) {
    throw new SemanticAnchorError(
      "STALE_MAPPING",
      "anchors do not pin the current mapping revision",
    );
  }
  const composition = isObject(anchorsDocument.composition)
    ? anchorsDocument.composition
    : {};
  const durationInFrames = integer(
    config.durationInFrames,
    "config.durationInFrames",
    1,
  );
  const fps = finiteNumber(
    pick(composition, "fps") ??
      pick(anchorsDocument, "fps") ??
      config.fps ??
      mapping.fps ??
      30,
    "composition.fps",
  );
  if (!(fps > 0) || fps > 1000) {
    throw new SemanticAnchorError(
      "INVALID_FPS",
      `fps must be > 0 and <= 1000, got ${fps}`,
    );
  }
  const compositionStartSeconds = finiteNumber(
    pick(composition, "targetStartSeconds", "targetStart") ??
      pick(anchorsDocument, "targetStartSeconds", "compositionStartSeconds") ??
      0,
    "composition.targetStartSeconds",
  );
  const rawAnchors = arrayOrFail(anchorsDocument.anchors, "anchors.anchors");
  const seenAnchorIds = new Set<string>();
  const seenItemIds = new Set<string>();
  const resolved = rawAnchors.map((anchor, index) => {
    const object = objectOrFail(anchor, `anchor ${index}`);
    const id = requiredString(object.id, `anchor ${index}.id`);
    if (seenAnchorIds.has(id))
      throw new SemanticAnchorError(
        "DUPLICATE_ANCHOR",
        `anchor ${id} is repeated`,
      );
    seenAnchorIds.add(id);
    const itemId = requiredString(object.itemId, `anchor ${id}.itemId`);
    if (!itemIds.has(itemId))
      throw new SemanticAnchorError(
        "AMBIGUOUS_ITEM",
        `anchor ${id} targets unknown item ${itemId}`,
      );
    if (seenItemIds.has(itemId))
      throw new SemanticAnchorError(
        "AMBIGUOUS_ITEM",
        `item ${itemId} has more than one semantic anchor`,
      );
    seenItemIds.add(itemId);
    return resolveAnchor(
      object,
      index,
      mapping,
      compositionStartSeconds,
      fps,
      durationInFrames,
    );
  });
  const byItem = new Map(resolved.map((item) => [item.itemId, item]));
  const nextItems = items.map((value) => {
    const item = objectOrFail(value, "config item");
    const resolvedAnchor = byItem.get(String(item.id));
    return resolvedAnchor
      ? { ...item, revealAtFrame: resolvedAnchor.triggerAtFrame }
      : item;
  });
  return {
    config: { ...config, items: nextItems },
    resolved,
    provenance: {
      source,
      ...(mapping.id ? { mappingId: mapping.id } : {}),
      mappingRevision: mapping.revision,
      fps,
      compositionStartSeconds,
    },
  };
};
