export type RenderCacheKeyInput = {
  sourceTreeFingerprint: string;
  dependencyFingerprint: string;
  assetFingerprints: Record<string, string>;
  params: unknown;
  localTiming: unknown;
  outputSpec: unknown;
  // Placement belongs to the later Cap overlay and is intentionally not part of a Remotion asset key.
  placement?: unknown;
};

export type CacheReceipt = {
  schema: "laohu.remotion-render-receipt/1";
  cacheKey: string;
  output: { sizeBytes: number; sha256: string };
  [key: string]: unknown;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
};

export const cacheKeyMaterial = (input: RenderCacheKeyInput): string =>
  JSON.stringify(
    canonicalize({
      sourceTreeFingerprint: input.sourceTreeFingerprint,
      dependencyFingerprint: input.dependencyFingerprint,
      assetFingerprints: input.assetFingerprints,
      params: input.params,
      localTiming: input.localTiming,
      outputSpec: input.outputSpec,
    }),
  );

export const isCacheReceiptValid = (
  receipt: unknown,
  observed: { sizeBytes: number; sha256: string },
): receipt is CacheReceipt => {
  if (
    !isObject(receipt) ||
    receipt.schema !== "laohu.remotion-render-receipt/1"
  )
    return false;
  if (!isObject(receipt.output)) return false;
  return (
    receipt.output.sizeBytes === observed.sizeBytes &&
    receipt.output.sha256 === observed.sha256
  );
};
