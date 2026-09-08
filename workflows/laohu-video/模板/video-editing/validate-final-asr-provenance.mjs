#!/usr/bin/env node

import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const sha256File = (file) => new Promise((resolveHash, reject) => {
  const hash = createHash("sha256");
  createReadStream(file).on("data", (chunk) => hash.update(chunk)).on("error", reject).on("end", () => resolveHash(hash.digest("hex")));
});

export async function buildFinalAsrProvenance({media, edl, raw, srt}) {
  const paths = Object.fromEntries(Object.entries({media, edl, raw, srt}).map(([key, value]) => [key, resolve(value)]));
  const [mediaSha256, edlSha256, rawSha256, srtSha256] = await Promise.all([
    sha256File(paths.media),
    sha256File(paths.edl),
    sha256File(paths.raw),
    sha256File(paths.srt),
  ]);
  return {
    schema: "laohu.final-asr-provenance/1",
    generatedAt: new Date().toISOString(),
    ...paths,
    mediaSha256,
    edlSha256,
    rawSha256,
    srtSha256,
  };
}

export async function validateFinalAsrProvenance(receipt) {
  if (receipt?.schema !== "laohu.final-asr-provenance/1") return {valid: false, mismatches: ["schema"]};
  const actual = await buildFinalAsrProvenance(receipt);
  const fields = ["mediaSha256", "edlSha256", "rawSha256", "srtSha256"];
  const mismatches = fields.filter((field) => actual[field] !== receipt[field]);
  return {valid: mismatches.length === 0, mismatches, receipt};
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [command, ...rest] = process.argv.slice(2);
  const args = new Map();
  for (let index = 0; index < rest.length; index += 2) args.set(rest[index]?.replace(/^--/, ""), rest[index + 1]);
  if (command === "create") {
    const required = ["media", "edl", "raw", "srt", "receipt"];
    for (const key of required) if (!args.get(key)) throw new Error(`Missing --${key}`);
    const receipt = await buildFinalAsrProvenance(Object.fromEntries(required.slice(0, 4).map((key) => [key, args.get(key)])));
    await writeFile(resolve(args.get("receipt")), `${JSON.stringify(receipt, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({valid: true, receipt: resolve(args.get("receipt")), ...receipt}, null, 2)}\n`);
  } else if (command === "validate") {
    const receiptPath = args.get("receipt");
    if (!receiptPath) throw new Error("Missing --receipt");
    const result = await validateFinalAsrProvenance(JSON.parse(await readFile(resolve(receiptPath), "utf8")));
    const output = `${JSON.stringify(result, null, 2)}\n`;
    if (result.valid) process.stdout.write(output);
    else { process.stderr.write(output); process.exitCode = 1; }
  } else {
    throw new Error("Usage: validate-final-asr-provenance.mjs create|validate [options]");
  }
}
