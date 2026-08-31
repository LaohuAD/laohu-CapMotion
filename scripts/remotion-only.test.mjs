import assert from "node:assert/strict";
import {readdir, readFile} from "node:fs/promises";
import {extname, join} from "node:path";
import {test} from "node:test";

const roots = [
  "AGENTS.md",
  "README.md",
  "scripts",
  ".agents/skills",
  "workflows/laohu-video",
  "模板",
  "知识沉淀",
  "docs/superpowers/specs",
];

const textExtensions = new Set([".json", ".md", ".mjs", ".js", ".ts", ".tsx", ".rs", ".toml", ".yaml", ".yml"]);
const ignoredDirectories = new Set(["node_modules", "target", "out", "dist"]);

async function collectTextFiles(path, result = []) {
  const entries = await readdir(path, {withFileTypes: true}).catch(() => null);
  if (entries === null) {
    result.push(path);
    return result;
  }
  for (const entry of entries) {
    if (entry.name.startsWith("target") || ignoredDirectories.has(entry.name)) continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) await collectTextFiles(child, result);
    else if (textExtensions.has(extname(entry.name))) result.push(child);
  }
  return result;
}

test("managed runtime exposes Remotion as the only program animation system", async () => {
  const forbidden = new RegExp(["hyper", "frames"].join(""), "i");
  const dualEngine = new RegExp(["双", "引擎"].join(""));
  const files = [];
  for (const root of roots) await collectTextFiles(root, files);
  const violations = [];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (forbidden.test(content) || dualEngine.test(content)) violations.push(file);
  }
  assert.deepEqual(violations, []);
});
