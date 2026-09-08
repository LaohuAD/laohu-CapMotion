#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

export function nextCapMotionVersion(version) {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!match) throw new Error(`Invalid CapMotion version: ${version}`);

	let major = Number(match[1]);
	let minor = Number(match[2]);
	let patch = Number(match[3]) + 1;
	if (patch >= 10) {
		patch = 0;
		minor += 1;
	}
	if (minor >= 10) {
		minor = 0;
		major += 1;
	}
	return `${major}.${minor}.${patch}`;
}

export function assertReleaseHistory(packageVersion, entries) {
	if (!Array.isArray(entries) || entries.length === 0) {
		throw new Error("CapMotion release history is empty");
	}

	const newest = entries[0];
	if (newest.version !== packageVersion) {
		throw new Error(
			`Package version ${packageVersion} does not match newest release note ${newest.version}`,
		);
	}

	for (const entry of entries) {
		const bilingual = [
			entry.title?.en,
			entry.title?.["zh-CN"],
			entry.content?.en,
			entry.content?.["zh-CN"],
		];
		if (bilingual.some((value) => typeof value !== "string" || !value.trim())) {
			throw new Error(
				`Release ${entry.version} must have complete bilingual copy`,
			);
		}
	}
}

export function assertInstallVersion(packageVersion, installedVersion) {
	if (!installedVersion || packageVersion === installedVersion) return;
	const expected = nextCapMotionVersion(installedVersion);
	if (packageVersion !== expected) {
		throw new Error(
			`Installed CapMotion is ${installedVersion}; expected ${expected} for the next update, got ${packageVersion}`,
		);
	}
}

export function checkCapLocalRelease(
	configPath = resolve(
		repoRoot,
		"apps/desktop/src-tauri/tauri.local.conf.json",
	),
	changelogPath = resolve(
		repoRoot,
		"apps/desktop/src/capmotion-changelog.json",
	),
	installedVersion,
) {
	const config = JSON.parse(readFileSync(configPath, "utf8"));
	const changelog = JSON.parse(readFileSync(changelogPath, "utf8"));
	assertReleaseHistory(config.version, changelog);
	assertInstallVersion(config.version, installedVersion);
	return config.version;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	try {
		const previousIndex = process.argv.indexOf("--installed-version");
		const installedVersion =
			previousIndex >= 0 ? process.argv[previousIndex + 1] : undefined;
		const version = checkCapLocalRelease(
			undefined,
			undefined,
			installedVersion,
		);
		console.log(`Verified CapMotion ${version} release history`);
	} catch (error) {
		console.error(`error: ${error instanceof Error ? error.message : error}`);
		process.exitCode = 1;
	}
}
