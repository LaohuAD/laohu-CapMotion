#!/usr/bin/env node

import {
  readJson,
  many,
  one,
  parseArgs,
  writeJsonAtomic,
} from "./cli-utils.mjs";

const { buildReusableCaseIndex, searchReusableCases } =
  await import("../src/semantic/semantic-retrieval.ts");

const arrayFrom = (value, keys, label) => {
  if (Array.isArray(value)) return value;
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  throw new Error(`${label} must be an array or contain ${keys.join("/")}`);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (args.help || command === "help" || !command) {
    console.log(
      "Usage: npm run semantic:index -- index --catalog CATALOG.json --cases CASES.json --out INDEX.json\n       npm run semantic:search -- search --index INDEX.json [--goal GOAL] [--relation RELATION] [--out RESULTS.json]",
    );
    return;
  }
  if (command === "index") {
    const catalogValue = await readJson(one(args, "catalog"), "catalog");
    const casesValue = await readJson(one(args, "cases"), "cases");
    const catalog = arrayFrom(
      catalogValue,
      ["entries", "manifests", "componentRegistry"],
      "catalog",
    );
    const cases = arrayFrom(casesValue, ["cases", "candidates"], "cases");
    const index = buildReusableCaseIndex(cases, catalog);
    if (args.out) await writeJsonAtomic(one(args, "out"), index);
    console.log(JSON.stringify(index, null, 2));
    return;
  }
  if (command === "search") {
    const index = await readJson(one(args, "index"), "index");
    const relation = many(args, "relation");
    const limit =
      args.limit === undefined || args.limit === true
        ? undefined
        : Number(args.limit);
    const results = searchReusableCases(index, {
      ...(args.goal ? { goal: one(args, "goal") } : {}),
      ...(relation.length ? { relation } : {}),
      ...(args.fit ? { fit: one(args, "fit") } : {}),
      ...(args.feedback_state
        ? { feedbackState: one(args, "feedback_state") }
        : {}),
      ...(args.pinned_version
        ? { pinnedVersion: one(args, "pinned_version") }
        : {}),
      ...(args.source_fingerprint
        ? { sourceFingerprint: one(args, "source_fingerprint") }
        : {}),
      ...(args.include_stale ? { includeStale: true } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    if (args.out) await writeJsonAtomic(one(args, "out"), results);
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  throw new Error(`unknown semantic retrieval command ${command}`);
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
