#!/usr/bin/env node

import { readJson, one, parseArgs, writeJsonAtomic } from "./cli-utils.mjs";

const { applySemanticAnchors } =
  await import("../src/semantic/semantic-anchors.ts");

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._[0] === "help") {
    console.log(
      "Usage: npm run semantic:anchors -- --config CONFIG.json --anchors ANCHORS.json --mapping MAP.json --out CONFIG.json [--report REPORT.json]",
    );
    return;
  }
  const configPath = one(args, "config");
  const anchorsPath = one(args, "anchors");
  const mappingPath = one(args, "mapping");
  const outputPath = one(args, "out");
  const [config, anchors, mapping] = await Promise.all([
    readJson(configPath, "config"),
    readJson(anchorsPath, "anchors"),
    readJson(mappingPath, "mapping"),
  ]);
  const result = applySemanticAnchors(config, anchors, mapping);
  const report = {
    schema: "laohu.semantic-anchor-resolution/1",
    status: "RESOLVED",
    resolved: result.resolved,
    provenance: result.provenance,
  };
  await writeJsonAtomic(outputPath, result.config);
  if (args.report) await writeJsonAtomic(one(args, "report"), report);
  console.log(
    JSON.stringify(
      { status: report.status, output: outputPath, report },
      null,
      2,
    ),
  );
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
