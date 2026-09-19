import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
const run = (args) =>
  spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      join(here, "render-with-cache.mjs"),
      ...args,
    ],
    {
      cwd: join(here, ".."),
      encoding: "utf8",
      env: { ...process.env, TMPDIR: reliabilityTmp },
    },
  );

test("render cache dry-run accepts explicit assets and ignores later placement", async () => {
  const directory = await makeTempDirectory("render-cache-");
  try {
    const props = join(directory, "props.json");
    const asset = join(directory, "asset.txt");
    await writeFile(
      props,
      JSON.stringify({
        component: "KineticStatement",
        mode: "claim",
        durationInFrames: 60,
        items: [],
      }),
    );
    await writeFile(asset, "asset-v1\n");
    const common = [
      "--workspace",
      join(here, ".."),
      "--props",
      props,
      "--composition",
      "KineticStatement",
      "--output",
      join(
        process.cwd(),
        "../../../../../target/capmotion-release/animation-reliability/render-cache-test-output.webm",
      ),
      "--asset",
      asset,
      "--quality",
      "preview",
      "--dry-run",
    ];
    const first = run([
      ...common,
      "--placement",
      JSON.stringify({ x: 10, y: 20 }),
    ]);
    const second = run([
      ...common,
      "--placement",
      JSON.stringify({ x: 900, y: 400 }),
    ]);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(
      JSON.parse(first.stdout).cacheKey,
      JSON.parse(second.stdout).cacheKey,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("render cache rejects an external input that is not explicitly hashed", async () => {
  const directory = await makeTempDirectory("render-cache-untracked-");
  try {
    const props = join(directory, "props.json");
    const external = join(directory, "external.png");
    await writeFile(external, "external-input\n");
    await writeFile(
      props,
      JSON.stringify({
        component: "KineticStatement",
        mode: "claim",
        durationInFrames: 60,
        mediaSrc: external,
        items: [],
      }),
    );
    const result = run([
      "--workspace",
      join(here, ".."),
      "--props",
      props,
      "--composition",
      "KineticStatement",
      "--output",
      "render-cache-untracked.webm",
      "--quality",
      "preview",
      "--dry-run",
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /UNTRACKED_EXTERNAL_INPUT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("render cache rejects a remote input that is not materialized locally", async () => {
  const directory = await makeTempDirectory("render-cache-remote-");
  try {
    const props = join(directory, "props.json");
    await writeFile(
      props,
      JSON.stringify({
        component: "KineticStatement",
        mode: "claim",
        durationInFrames: 60,
        mediaSrc: "https://example.test/asset.png",
        items: [],
      }),
    );
    const result = run([
      "--workspace",
      join(here, ".."),
      "--props",
      props,
      "--composition",
      "KineticStatement",
      "--output",
      "render-cache-remote.webm",
      "--quality",
      "preview",
      "--dry-run",
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /UNTRACKED_EXTERNAL_INPUT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
