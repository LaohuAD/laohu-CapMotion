const overlapDuration = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c));

/**
 * Return the largest removable core inside an acoustic-silence candidate.
 * Every retained ASR word is expanded into a no-cut guard, so a word that
 * crosses the silence midpoint cannot disappear between two neighbours.
 */
export function findSafeSilenceCore({
  silence,
  words,
  silenceHeadGuardSeconds = 0.05,
  silenceTailGuardSeconds = 0.13,
  keepTailSeconds = 0.03,
  keepPrerollSeconds = 0.14,
  minCutSeconds = 0.12,
}) {
  const candidate = {
    start: silence.start + silenceHeadGuardSeconds,
    end: silence.end - silenceTailGuardSeconds,
  };
  if (!(candidate.end > candidate.start)) return null;

  const blockers = words
    .filter((word) => word.end + keepTailSeconds > candidate.start && word.start - keepPrerollSeconds < candidate.end)
    .map((word) => ({
      start: word.start - keepPrerollSeconds,
      end: word.end + keepTailSeconds,
    }))
    .sort((left, right) => left.start - right.start);

  const safe = [];
  let cursor = candidate.start;
  for (const blocker of blockers) {
    if (blocker.start > cursor) safe.push({start: cursor, end: Math.min(blocker.start, candidate.end)});
    cursor = Math.max(cursor, blocker.end);
    if (cursor >= candidate.end) break;
  }
  if (cursor < candidate.end) safe.push({start: cursor, end: candidate.end});

  return safe
    .filter((range) => range.end - range.start >= minCutSeconds)
    .sort((left, right) => right.end - right.start - (left.end - left.start))[0] ?? null;
}

/**
 * Remove only acoustically confirmed blank lead-in/tail from a speech segment.
 * Word guards remain the authority; without sufficient silence evidence the
 * original edge is returned unchanged.
 */
export function trimSilentSequenceEdges({
  sequence,
  words,
  silences,
  keepPrerollSeconds = 0.14,
  keepTailSeconds = 0.1,
  minTrimSeconds = 0.12,
  minSilenceCoverage = 0.6,
}) {
  if (!words.length) return {...sequence};
  const ordered = [...words].sort((left, right) => left.start - right.start);
  let start = sequence.start;
  let end = sequence.end;

  const silenceWithin = (a, b) => silences.reduce(
    (total, silence) => total + overlapDuration(a, b, silence.start, silence.end),
    0,
  );

  const safeStart = ordered[0].start - keepPrerollSeconds;
  const leadingGap = safeStart - start;
  if (
    leadingGap > minTrimSeconds &&
    silenceWithin(start, safeStart) >= Math.min(minTrimSeconds, leadingGap * minSilenceCoverage)
  ) start = safeStart;

  const safeEnd = ordered.at(-1).end + keepTailSeconds;
  const trailingGap = end - safeEnd;
  if (
    trailingGap > minTrimSeconds &&
    silenceWithin(safeEnd, end) >= Math.min(minTrimSeconds, trailingGap * minSilenceCoverage)
  ) end = safeEnd;

  return {...sequence, start, end};
}
