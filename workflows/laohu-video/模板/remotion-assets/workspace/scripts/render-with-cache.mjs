#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  mkdir,
  copyFile,
} from "node:fs/promises";
import {
  extname,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import {
  cacheKeyMaterial,
  isCacheReceiptValid,
} from "../src/semantic/semantic-render-cache.ts";
import {
  many,
  one,
  parseArgs,
  parseJsonOption,
  readJson,
  writeJsonAtomic,
} from "./cli-utils.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceDefault = resolve(scriptDirectory, "..");
const repositoryRoot = (workspace) => resolve(workspace, "../../../../..");
const reliabilityRoot = (workspace) =>
  join(
    repositoryRoot(workspace),
    "target",
    "capmotion-release",
    "animation-reliability",
  );

const pathInside = (candidate, root) => {
  const resolvedCandidate = resolve(candidate);
  const resolvedRoot = resolve(root);
  return (
    resolvedCandidate === resolvedRoot ||
    resolvedCandidate.startsWith(`${resolvedRoot}${sep}`)
  );
};

const hashBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");

const hashFile = async (path) => hashBytes(await readFile(path));

const collectFiles = async (root) => {
  const files = [];
  const skip = new Set(["node_modules", ".git", "out", "target", ".cache"]);
  const visit = async (directory) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      if (skip.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  await visit(root);
  return files.sort();
};

export const fingerprintTree = async (root) => {
  const files = await collectFiles(root);
  const digest = createHash("sha256");
  for (const path of files) {
    const contents = await readFile(path);
    const name = relative(root, path).split(sep).join("/");
    digest.update(`${name.length}:`);
    digest.update(name);
    digest.update(`:${contents.length}:`);
    digest.update(contents);
  }
  return digest.digest("hex");
};

export const dependencyFingerprint = async (workspace) => {
  const files = [
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
  ];
  const digest = createHash("sha256");
  let found = false;
  for (const name of files) {
    const path = join(workspace, name);
    try {
      const contents = await readFile(path);
      found = true;
      digest.update(`${name.length}:`);
      digest.update(name);
      digest.update(`:${contents.length}:`);
      digest.update(contents);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (!found)
    throw new Error(
      `DEPENDENCY_INPUT_MISSING: no package manifest/lockfile under ${workspace}`,
    );
  return digest.digest("hex");
};

const externalUrl = (value) => /^(?:https?|s3|gs|oss):\/\//i.test(value);

const pathLike = (value) =>
  isAbsolute(value) ||
  /^[A-Za-z]:[\\/]/.test(value) ||
  value.startsWith("file://") ||
  value.startsWith("~/") ||
  value.startsWith("../") ||
  externalUrl(value) ||
  value.startsWith("./");

export const externalPathValues = (value, workspace, found = []) => {
  if (Array.isArray(value)) {
    for (const item of value) externalPathValues(item, workspace, found);
    return found;
  }
  if (!value || typeof value !== "object") {
    if (typeof value !== "string" || !pathLike(value)) return found;
    if (externalUrl(value)) {
      found.push(value);
      return found;
    }
    if (value.startsWith("~/")) {
      found.push(value);
      return found;
    }
    const normalized = value.startsWith("file://") ? new URL(value) : value;
    const path =
      normalized instanceof URL
        ? fileURLToPath(normalized)
        : resolve(workspace, value);
    if (!pathInside(path, workspace)) found.push(path);
    return found;
  }
  for (const child of Object.values(value))
    externalPathValues(child, workspace, found);
  return found;
};

const assertExternalInputsTracked = async (props, workspace, assetPaths) => {
  const allowed = new Set(assetPaths.map((path) => resolve(path)));
  for (const candidate of externalPathValues(props, workspace)) {
    if (allowed.has(resolve(candidate))) continue;
    if (externalUrl(candidate)) {
      throw new Error(
        `UNTRACKED_EXTERNAL_INPUT: ${candidate}; materialize the remote input locally and pass it with --asset so its hash is pinned`,
      );
    }
    throw new Error(
      `UNTRACKED_EXTERNAL_INPUT: ${candidate}; pass it with --asset so its hash is pinned`,
    );
  }
};

const assetFingerprints = async (assetPaths, workspace) => {
  const result = {};
  for (const value of assetPaths) {
    const path = resolve(value);
    const info = await stat(path).catch((error) => {
      throw new Error(`EXTERNAL_ASSET_INVALID: ${path}: ${error.message}`);
    });
    if (!info.isFile())
      throw new Error(`EXTERNAL_ASSET_INVALID: ${path} is not a file`);
    const key = pathInside(path, workspace)
      ? relative(workspace, path).split(sep).join("/")
      : path;
    result[key] = await hashFile(path);
  }
  return result;
};

const parseNumber = (args, key, fallback) => {
  if (args[key] === undefined || args[key] === true) return fallback;
  const value = Number(args[key]);
  if (!Number.isFinite(value))
    throw new Error(`--${key.replaceAll("_", "-")} must be finite`);
  return value;
};

const parsePositiveInteger = (args, key, fallback) => {
  const value = parseNumber(args, key, fallback);
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`--${key.replaceAll("_", "-")} must be a positive integer`);
  return value;
};

export const buildCachePlan = async (args) => {
  const workspace = resolve(args.workspace ?? workspaceDefault);
  const root = reliabilityRoot(workspace);
  const temporaryRoot = join(root, "tmp");
  await mkdir(temporaryRoot, { recursive: true });
  // Keep Chromium, webpack, and Remotion intermediates on the external work disk.
  process.env.TMPDIR = temporaryRoot;
  const outputValue = one(args, "output");
  const outputPath = isAbsolute(outputValue)
    ? resolve(outputValue)
    : resolve(root, outputValue);
  const cacheValue = args.cache_dir ?? join(root, "remotion-cache");
  const cacheDirectory = isAbsolute(cacheValue)
    ? resolve(cacheValue)
    : resolve(root, cacheValue);
  if (!pathInside(outputPath, root))
    throw new Error(`OUTPUT_OUTSIDE_RELIABILITY_ROOT: ${outputPath}`);
  if (!pathInside(cacheDirectory, root))
    throw new Error(`CACHE_OUTSIDE_RELIABILITY_ROOT: ${cacheDirectory}`);
  const propsPath = one(args, "props");
  const props = await readJson(propsPath, "props");
  const compositionId = one(args, "composition");
  const quality =
    args.quality === undefined || args.quality === true
      ? "preview"
      : String(args.quality);
  if (quality !== "preview" && quality !== "final")
    throw new Error("--quality must be preview or final");
  const fps = parseNumber(args, "fps", Number(props.fps ?? 30));
  if (!(fps > 0) || fps > 1000) throw new Error(`INVALID_FPS: ${fps}`);
  const durationInFrames = parsePositiveInteger(
    args,
    "duration",
    Number(props.durationInFrames),
  );
  const width = parsePositiveInteger(
    args,
    "width",
    quality === "preview" ? 960 : 1920,
  );
  const height = parsePositiveInteger(
    args,
    "height",
    quality === "preview" ? 540 : 1080,
  );
  const startFrame = parseNumber(args, "start_frame", 0);
  const endFrame = parseNumber(args, "end_frame", durationInFrames);
  if (
    !Number.isInteger(startFrame) ||
    !Number.isInteger(endFrame) ||
    startFrame < 0 ||
    endFrame <= startFrame ||
    endFrame > durationInFrames
  ) {
    throw new Error(
      `LOCAL_TIMING_INVALID: ${startFrame}-${endFrame} outside 0-${durationInFrames}`,
    );
  }
  const assets = many(args, "asset");
  await assertExternalInputsTracked(props, workspace, assets);
  const renderProps =
    Number(props.durationInFrames) === durationInFrames
      ? props
      : { ...props, durationInFrames };
  const [sourceTreeFingerprint, dependencyFp, assetFp] = await Promise.all([
    fingerprintTree(workspace),
    dependencyFingerprint(workspace),
    assetFingerprints(assets, workspace),
  ]);
  const outputSpec = {
    compositionId,
    width,
    height,
    fps,
    durationInFrames,
    startFrame,
    endFrame,
    quality,
    codec: quality === "preview" ? "vp8" : "prores",
    pixelFormat: quality === "preview" ? "yuva420p" : "yuva444p10le",
    outputExtension: extname(outputPath),
  };
  const localTiming = { fps, durationInFrames, startFrame, endFrame };
  const params = { props: renderProps, compositionId };
  const material = cacheKeyMaterial({
    sourceTreeFingerprint,
    dependencyFingerprint: dependencyFp,
    assetFingerprints: assetFp,
    params,
    localTiming,
    outputSpec,
    // args.placement is deliberately omitted: it belongs to Cap placement, not rendered pixels.
    placement: parseJsonOption(args.placement, "placement"),
  });
  const cacheKey = hashBytes(material);
  const extension =
    extname(outputPath) || (quality === "preview" ? ".webm" : ".mov");
  const entryDirectory = join(cacheDirectory, cacheKey);
  const artifactPath = join(entryDirectory, `artifact${extension}`);
  return {
    workspace,
    root,
    outputPath,
    cacheDirectory,
    entryDirectory,
    artifactPath,
    receiptPath: join(entryDirectory, "receipt.json"),
    cacheKey,
    material,
    props: renderProps,
    compositionId,
    quality,
    outputSpec,
    localTiming,
    assetFingerprints: assetFp,
    sourceTreeFingerprint,
    dependencyFingerprint: dependencyFp,
  };
};

const observedFile = async (path) => {
  const contents = await readFile(path);
  return { sizeBytes: contents.length, sha256: hashBytes(contents) };
};

const validCachedArtifact = async (plan) => {
  try {
    const [receipt, observed] = await Promise.all([
      readJson(plan.receiptPath, "cache receipt"),
      observedFile(plan.artifactPath),
    ]);
    return receipt.cacheKey === plan.cacheKey &&
      isCacheReceiptValid(receipt, observed)
      ? { receipt, observed }
      : null;
  } catch (error) {
    if (
      error.code === "ENOENT" ||
      error.message?.startsWith("cannot read cache receipt")
    )
      return null;
    return null;
  }
};

const acquireLock = async (path) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const handle = await open(path, "wx");
      await handle.writeFile(
        `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
      );
      return async () => {
        await handle.close();
        await rm(path, { force: true });
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    }
  }
  throw new Error(`CACHE_LOCK_TIMEOUT: ${path}`);
};

const copyAtomic = async (source, destination) => {
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await copyFile(source, temporary);
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
};

const runProcess = (command, args, options) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, options);
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else
        reject(
          new Error(
            `Remotion renderer exited with ${signal ?? `status ${code}`}`,
          ),
        );
    });
  });

const renderUncached = async (plan) => {
  await mkdir(plan.entryDirectory, { recursive: true });
  const tempOutput = join(
    plan.entryDirectory,
    `.rendering-${process.pid}-${randomUUID()}${extname(plan.artifactPath)}`,
  );
  const executable = join(
    plan.workspace,
    "node_modules",
    "@remotion",
    "cli",
    "remotion-cli.js",
  );
  const entry = join(plan.workspace, "src", "index.ts");
  try {
    const args = [
      "render",
      entry,
      plan.compositionId,
      tempOutput,
      "--props",
      JSON.stringify(plan.props),
      "--image-format",
      "png",
      "--log",
      "error",
    ];
    if (
      plan.localTiming.startFrame !== 0 ||
      plan.localTiming.endFrame !== plan.localTiming.durationInFrames
    ) {
      args.push(
        "--frames",
        `${plan.localTiming.startFrame}-${plan.localTiming.endFrame - 1}`,
      );
    }
    if (plan.quality === "preview")
      args.push(
        "--codec",
        "vp8",
        "--pixel-format",
        "yuva420p",
        "--scale",
        "0.5",
      );
    else
      args.push(
        "--codec",
        "prores",
        "--prores-profile",
        "4444",
        "--pixel-format",
        "yuva444p10le",
      );
    const tempDirectory = join(plan.root, "tmp");
    await mkdir(tempDirectory, { recursive: true });
    await runProcess(
      process.env.CAP_REMOTION_NODE ?? "node",
      [executable, ...args],
      {
        cwd: plan.workspace,
        env: { ...process.env, TMPDIR: tempDirectory },
        stdio: "inherit",
      },
    );
    const observed = await observedFile(tempOutput);
    if (observed.sizeBytes <= 0)
      throw new Error(`RENDER_OUTPUT_EMPTY: ${tempOutput}`);
    await rename(tempOutput, plan.artifactPath);
    const receipt = {
      schema: "laohu.remotion-render-receipt/1",
      cacheKey: plan.cacheKey,
      keyMaterial: JSON.parse(plan.material),
      sourceTreeFingerprint: plan.sourceTreeFingerprint,
      dependencyFingerprint: plan.dependencyFingerprint,
      assetFingerprints: plan.assetFingerprints,
      localTiming: plan.localTiming,
      outputSpec: plan.outputSpec,
      output: { path: plan.artifactPath, ...observed },
      createdAt: new Date().toISOString(),
    };
    await writeJsonAtomic(plan.receiptPath, receipt);
    return { receipt, observed, cacheHit: false };
  } finally {
    await rm(tempOutput, { force: true });
  }
};

export const executeRenderWithCache = async (plan, { dryRun = false } = {}) => {
  if (dryRun)
    return {
      cacheKey: plan.cacheKey,
      cacheHit: false,
      dryRun: true,
      outputSpec: plan.outputSpec,
    };
  await mkdir(plan.cacheDirectory, { recursive: true });
  const release = await acquireLock(
    join(plan.cacheDirectory, `.${plan.cacheKey}.lock`),
  );
  try {
    const cached = await validCachedArtifact(plan);
    const rendered = cached ?? (await renderUncached(plan));
    if (resolve(plan.outputPath) !== resolve(plan.artifactPath))
      await copyAtomic(plan.artifactPath, plan.outputPath);
    const published = await observedFile(plan.outputPath);
    if (!isCacheReceiptValid(rendered.receipt, published)) {
      throw new Error(`PUBLISHED_OUTPUT_INTEGRITY_FAILED: ${plan.outputPath}`);
    }
    return {
      cacheKey: plan.cacheKey,
      cacheHit: Boolean(cached),
      output: plan.outputPath,
      receipt: rendered.receipt,
    };
  } finally {
    await release();
  }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "Usage: npm run render:cached -- --props CONFIG.json --composition ID --output /.../target/capmotion-release/animation-reliability/out.webm [--asset FILE] [--placement JSON] [--quality preview|final]",
    );
    return;
  }
  const plan = await buildCachePlan(args);
  const result = await executeRenderWithCache(plan, {
    dryRun: Boolean(args.dry_run),
  });
  console.log(JSON.stringify(result, null, 2));
};

const isMainModule = process.argv[1]
  ? resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
  : false;

if (isMainModule) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
