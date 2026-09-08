import assert from "node:assert/strict";
import {mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";

import {syncProjectDisplayNameTransaction} from "./cap-project-name.mjs";

const makeProject = async (root, name = "H3 精修成片.cap") => {
  const projectPath = join(root, name);
  await mkdir(projectPath);
  await writeFile(join(projectPath, ".project-config.lock"), "");
  await writeFile(join(projectPath, "project-config.json"), `${JSON.stringify({
    projectRevision: 7,
    timeline: {segments: []},
  }, null, 2)}\n`);
  await writeFile(join(projectPath, "recording-meta.json"), `${JSON.stringify({
    pretty_name: "Cap 2026-09-02 at 18.04.04",
    status: {status: "Complete"},
  }, null, 2)}\n`);
  return projectPath;
};

test("syncs the Cap UI display name from the .cap folder name", async () => {
  const root = await mkdtemp(join(tmpdir(), "cap-project-name-test-"));
  try {
    const projectPath = await makeProject(root);
    const receipt = await syncProjectDisplayNameTransaction({
      projectPath,
      expectedRevision: 7,
    });
    const meta = JSON.parse(await readFile(join(projectPath, "recording-meta.json"), "utf8"));
    const config = JSON.parse(await readFile(join(projectPath, "project-config.json"), "utf8"));

    assert.equal(meta.pretty_name, "H3 精修成片");
    assert.equal(config.projectRevision, 8);
    assert.equal(receipt.previousName, "Cap 2026-09-02 at 18.04.04");
    assert.equal(receipt.newName, "H3 精修成片");
    assert.equal(receipt.previousRevision, 7);
    assert.equal(receipt.newRevision, 8);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("rejects stale revisions without changing the visible project name", async () => {
  const root = await mkdtemp(join(tmpdir(), "cap-project-name-test-"));
  try {
    const projectPath = await makeProject(root);
    await assert.rejects(
      syncProjectDisplayNameTransaction({projectPath, expectedRevision: 6}),
      /revision mismatch/i,
    );
    const meta = JSON.parse(await readFile(join(projectPath, "recording-meta.json"), "utf8"));
    assert.equal(meta.pretty_name, "Cap 2026-09-02 at 18.04.04");
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
