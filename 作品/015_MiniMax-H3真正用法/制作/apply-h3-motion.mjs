#!/usr/bin/env node

import {spawnSync} from "node:child_process";
import {writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectPath = process.argv[2];
if (!projectPath) throw new Error("usage: apply-h3-motion.mjs PROJECT.cap [EXPECTED_REVISION]");

let revision = Number(process.argv[3] ?? 3);
if (!Number.isInteger(revision) || revision < 0) throw new Error("expected revision must be a non-negative integer");
const group = process.argv[4] ?? "main";

const capBin = process.env.CAP_BIN ?? "/Users/a1/Applications/Cap - Development.app/Contents/MacOS/cap-cli";
const workspace = resolve(here, "../../../workflows/laohu-video/模板/remotion-assets/workspace");
const mainTasks = [
  {id: "h3-ratio-lock", composition: "H3-ratioLock", start: 142.22, duration: 8},
  {id: "h3-sampling-chain", composition: "H3-samplingChain", start: 230, duration: 12},
  {id: "h3-latent-transfer", composition: "H3-latentTransfer", start: 273.5, duration: 12},
  {id: "h3-task-model-choice", composition: "H3-taskModelChoice", start: 673.2, duration: 12},
  {id: "h3-final-recap", composition: "H3-finalRecap", start: 706.6, duration: 7},
];
const placeholderTasks = [
  {id: "h3-missing-opening-evidence", composition: "H3-missingOpeningEvidence", start: 0, duration: 4.4, role: "evidence"},
  {id: "h3-missing-same-task-comparison", composition: "H3-missingSameTaskComparison", start: 408.3, duration: 5, role: "evidence"},
  {id: "h3-missing-controlled-strength", composition: "H3-missingControlledStrengthComparison", start: 600.33, duration: 6, role: "evidence"},
];
const tasks = group === "placeholders" ? placeholderTasks : mainTasks;

const run = (args) => {
  const result = spawnSync(capBin, args, {encoding: "utf8"});
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `${capBin} failed`).trim());
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`Cap CLI did not return JSON: ${result.stdout}`);
  }
};

const nextRevision = (output) => {
  const value = output.revision ?? output.projectRevision ?? output.project?.projectRevision;
  if (!Number.isInteger(value)) throw new Error(`Cap CLI response has no revision: ${JSON.stringify(output)}`);
  return value;
};

const operations = [];
for (const [index, task] of tasks.entries()) {
  const version = 1;
  const definition = run([
    "motion", "definition", "register", projectPath,
    "--expected-revision", String(revision),
    "--id", task.id,
    "--version", String(version),
    "--source", "src/configs/works/h3Tutorial.ts",
    "--composition-id", task.composition,
    "--status", "approved",
    "--min-duration", String(task.duration),
    "--default-duration", String(task.duration),
    "--max-duration", String(task.duration),
    "--default-policy", "responsive",
    "--format", "json",
  ]);
  revision = nextRevision(definition);
  operations.push({task: task.id, operation: "definition-register", revision});

  const added = run([
    "motion", "add", projectPath,
    "--expected-revision", String(revision),
    "--definition-id", task.id,
    "--definition-version", String(version),
    "--segment-id", task.id,
    "--start", String(task.start),
    "--duration", String(task.duration),
    "--track", "0",
    "--z-index", String(20 + index),
    "--role", task.role ?? "animation",
    "--duration-policy", "responsive",
    "--format", "json",
  ]);
  revision = nextRevision(added);
  operations.push({task: task.id, operation: "segment-add", revision});

  const rendered = run([
    "motion", "render", projectPath,
    "--expected-revision", String(revision),
    "--segment", task.id,
    "--quality", "final",
    "--workspace", workspace,
    "--format", "json",
  ]);
  revision = nextRevision(rendered);
  operations.push({
    task: task.id,
    operation: "render-final",
    revision,
    artifact: rendered.artifact ?? null,
  });
}

const receipt = {
  schema: "laohu.h3-motion-apply-receipt/1",
  projectPath: resolve(projectPath),
  workspace,
  group,
  finalRevision: revision,
  operations,
};
await writeFile(resolve(here, group === "placeholders" ? "placeholder-apply-receipt.json" : "motion-apply-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
