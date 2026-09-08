#!/usr/bin/env node

import {spawnSync} from "node:child_process";
import {readFile, rename, rm, writeFile} from "node:fs/promises";
import {basename, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const finiteRevision = (value, label) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${label} must be a non-negative integer`);
  return number;
};

const folderDisplayName = (projectPath) => basename(projectPath).replace(/\.cap$/i, "").trim();

const validateDisplayName = (value) => {
  const name = String(value ?? "").trim();
  if (!name) throw new Error("project display name must not be empty");
  if (name.length > 100) throw new Error("project display name must not exceed 100 characters");
  return name;
};

const syncProjectDisplayNameUnlocked = async ({projectPath, expectedRevision, prettyName, receiptPath}) => {
  const absoluteProject = resolve(projectPath);
  const configPath = join(absoluteProject, "project-config.json");
  const metaPath = join(absoluteProject, "recording-meta.json");
  const configTempPath = join(absoluteProject, `.project-config.${process.pid}.tmp`);
  const metaTempPath = join(absoluteProject, `.recording-meta.${process.pid}.tmp`);
  const metaRestorePath = join(absoluteProject, `.recording-meta.${process.pid}.restore.tmp`);

  try {
    const [configText, metaText] = await Promise.all([
      readFile(configPath, "utf8"),
      readFile(metaPath, "utf8"),
    ]);
    const config = JSON.parse(configText);
    const meta = JSON.parse(metaText);
    const currentRevision = finiteRevision(config.projectRevision ?? 0, "projectRevision");
    const requiredRevision = finiteRevision(expectedRevision, "expectedRevision");
    if (currentRevision !== requiredRevision) {
      throw new Error(`revision mismatch: expected ${requiredRevision}, found ${currentRevision}`);
    }

    const nextName = validateDisplayName(prettyName ?? folderDisplayName(absoluteProject));
    const previousName = String(meta.pretty_name ?? "");
    const nextConfig = structuredClone(config);
    const nextMeta = structuredClone(meta);
    nextConfig.projectRevision = currentRevision + 1;
    nextMeta.pretty_name = nextName;

    await Promise.all([
      writeFile(configTempPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8"),
      writeFile(metaTempPath, `${JSON.stringify(nextMeta, null, 2)}\n`, "utf8"),
    ]);
    await rename(metaTempPath, metaPath);
    try {
      await rename(configTempPath, configPath);
    } catch (error) {
      await writeFile(metaRestorePath, metaText, "utf8");
      await rename(metaRestorePath, metaPath);
      throw error;
    }

    const receipt = {
      schema: "laohu.cap-project-name-receipt/1",
      status: "applied",
      projectPath: absoluteProject,
      previousName,
      newName: nextName,
      previousRevision: currentRevision,
      newRevision: nextConfig.projectRevision,
      appliedAt: new Date().toISOString(),
    };
    if (receiptPath) await writeFile(resolve(receiptPath), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    return receipt;
  } finally {
    await Promise.all([
      rm(configTempPath, {force: true}),
      rm(metaTempPath, {force: true}),
      rm(metaRestorePath, {force: true}),
    ]);
  }
};

const PYTHON_FLOCK_WRAPPER = `
import fcntl
import subprocess
import sys

lock_path, node_bin, script_path, project_path, expected_revision, pretty_name, receipt_path = sys.argv[1:]
with open(lock_path, "a+") as lock_file:
    fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
    command = [
        node_bin,
        script_path,
        "--locked-worker",
        "--project", project_path,
        "--expected-revision", expected_revision,
    ]
    if pretty_name:
        command.extend(["--name", pretty_name])
    if receipt_path:
        command.extend(["--receipt", receipt_path])
    result = subprocess.run(command, text=True, capture_output=True)
    sys.stdout.write(result.stdout)
    sys.stderr.write(result.stderr)
    sys.exit(result.returncode)
`;

export const syncProjectDisplayNameTransaction = async ({projectPath, expectedRevision, prettyName, receiptPath}) => {
  const absoluteProject = resolve(projectPath);
  const result = spawnSync("python3", [
    "-c",
    PYTHON_FLOCK_WRAPPER,
    join(absoluteProject, ".project-config.lock"),
    process.execPath,
    fileURLToPath(import.meta.url),
    absoluteProject,
    String(expectedRevision),
    prettyName ? String(prettyName) : "",
    receiptPath ? resolve(receiptPath) : "",
  ], {encoding: "utf8"});
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "project name transaction failed").trim());
  return JSON.parse(result.stdout);
};

const parseArgs = (argv) => {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`invalid argument near ${key ?? "<end>"}`);
    result.set(key.slice(2), value);
  }
  return result;
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    const lockedWorker = process.argv[2] === "--locked-worker";
    const args = parseArgs(process.argv.slice(lockedWorker ? 3 : 2));
    const projectPath = args.get("project");
    const expectedRevision = args.get("expected-revision");
    if (!projectPath || expectedRevision === undefined) {
      throw new Error("usage: cap-project-name.mjs --project PROJECT.cap --expected-revision N [--name DISPLAY_NAME] [--receipt receipt.json]");
    }
    const options = {
      projectPath,
      expectedRevision,
      prettyName: args.get("name"),
      receiptPath: args.get("receipt"),
    };
    const receipt = lockedWorker
      ? await syncProjectDisplayNameUnlocked(options)
      : await syncProjectDisplayNameTransaction(options);
    console.log(JSON.stringify(receipt, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
