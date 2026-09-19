import { randomUUID } from "node:crypto";
import { readFile, rename, rm, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const parseArgs = (argv) => {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      result._.push(...argv.slice(index + 1));
      break;
    }
    if (!token.startsWith("--")) {
      result._.push(token);
      continue;
    }
    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    const key = rawKey.replaceAll("-", "_");
    const value = inlineValue ?? argv[index + 1];
    if (
      inlineValue === undefined &&
      (value === undefined || value.startsWith("--"))
    ) {
      result[key] = true;
      continue;
    }
    if (inlineValue === undefined) index += 1;
    if (result[key] === undefined) result[key] = value;
    else if (Array.isArray(result[key])) result[key].push(value);
    else result[key] = [result[key], value];
  }
  return result;
};

export const one = (args, key, label = key) => {
  const value = args[key];
  if (Array.isArray(value)) return value.at(-1);
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`--${label.replaceAll("_", "-")} is required`);
  return value;
};

export const many = (args, key) => {
  const value = args[key];
  if (value === undefined || value === true) return [];
  return (Array.isArray(value) ? value : [value])
    .flatMap((item) => String(item).split(","))
    .filter(Boolean);
};

export const readJson = async (path, label = path) => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`cannot read ${label}: ${error.message}`);
  }
};

export const writeJsonAtomic = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
};

export const parseJsonOption = (value, label) => {
  if (value === undefined || value === true) return undefined;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`--${label} must be JSON: ${error.message}`);
  }
};
