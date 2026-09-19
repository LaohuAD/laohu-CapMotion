import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const reliabilityTmp = join(
  process.cwd(),
  "../../../../../target/capmotion-release/animation-reliability/tmp",
);
const makeTempDirectory = async (prefix) => {
  await mkdir(reliabilityTmp, { recursive: true });
  return mkdtemp(join(reliabilityTmp, prefix));
};
const testEnvironment = {
  ...process.env,
  TMPDIR: reliabilityTmp,
};
const nodeArgs = (script, args) => [
  "--experimental-strip-types",
  join(here, script),
  ...args,
];
const run = (script, args) =>
  spawnSync(process.execPath, nodeArgs(script, args), {
    cwd: join(here, ".."),
    encoding: "utf8",
    env: testEnvironment,
  });

const anchorFixture = () => ({
  config: {
    component: "KineticStatement",
    mode: "claim",
    durationInFrames: 120,
    items: [{ id: "claim", label: "结论" }],
  },
  anchors: {
    schema: "laohu.semantic-anchors/1",
    source: { mediaId: "media-1", fingerprint: "sha-1", projectRevision: 3 },
    mapping: { id: "map-1", revision: 3 },
    composition: { targetStartSeconds: 0, fps: 30 },
    anchors: [
      { id: "a-1", itemId: "claim", segmentId: "s-1", wordIds: ["w-1"] },
    ],
  },
  mapping: {
    schema: "laohu.source-to-final-map/1",
    mappingId: "map-1",
    revision: 3,
    source: { mediaId: "media-1", fingerprint: "sha-1" },
    sequence: [
      { id: "s-1", sourceStart: 0, sourceEnd: 4, targetStart: 0, targetEnd: 2 },
    ],
    words: [{ id: "w-1", index: 0, start: 1, end: 1.3, segmentId: "s-1" }],
  },
});

test("semantic anchors CLI emits an existing-renderer config and report", async () => {
  const directory = await makeTempDirectory("semantic-cli-");
  try {
    const fixture = anchorFixture();
    const paths = {};
    for (const [name, value] of Object.entries(fixture)) {
      paths[name] = join(directory, `${name}.json`);
      await writeFile(paths[name], `${JSON.stringify(value)}\n`);
    }
    const configOut = join(directory, "resolved.json");
    const reportOut = join(directory, "resolved.report.json");
    const result = run("semantic-anchors.mjs", [
      "--config",
      paths.config,
      "--anchors",
      paths.anchors,
      "--mapping",
      paths.mapping,
      "--out",
      configOut,
      "--report",
      reportOut,
    ]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(await readFile(configOut, "utf8"));
    const report = JSON.parse(await readFile(reportOut, "utf8"));
    assert.equal(output.items[0].revealAtFrame, 15);
    assert.equal(report.resolved[0].triggerAtFrame, 15);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("semantic retrieval CLI keeps candidates pending review", async () => {
  const directory = await makeTempDirectory("retrieval-cli-");
  try {
    const catalog = join(directory, "catalog.json");
    const cases = join(directory, "cases.json");
    const index = join(directory, "index.json");
    const results = join(directory, "results.json");
    await writeFile(
      catalog,
      JSON.stringify([{ id: "KineticStatement", modes: ["claim"] }]),
    );
    await writeFile(
      cases,
      JSON.stringify([
        {
          id: "case-1",
          componentId: "KineticStatement",
          mode: "claim",
          communication: { goal: "remember", relation: ["CONCLUSION"] },
          fit: { status: "fit", reason: "同为结论锚点" },
          feedback: { state: "OBSERVE" },
          pinned: { version: "v1", sourceFingerprint: "src-1" },
          approval: "APPROVED",
        },
      ]),
    );
    const built = run("semantic-retrieval.mjs", [
      "index",
      "--catalog",
      catalog,
      "--cases",
      cases,
      "--out",
      index,
    ]);
    assert.equal(built.status, 0, built.stderr);
    const searched = run("semantic-retrieval.mjs", [
      "search",
      "--index",
      index,
      "--goal",
      "remember",
      "--out",
      results,
    ]);
    assert.equal(searched.status, 0, searched.stderr);
    const output = JSON.parse(await readFile(results, "utf8"));
    assert.equal(output[0].approvalState, "PENDING_REVIEW");
    assert.equal(output[0].feedbackState, "OBSERVE");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
