#!/usr/bin/env node
// 覆盖资产自动挂载：吃一份 manifest，把上游产出的透明动画资产注册进 Cap 工程并按 T2 挂好。
//
// 为什么要有这个脚本：
//   覆盖资产进工程要跑三条命令（definition register → motion add → props set），每条都要
//   带正确的 expectedRevision。手敲一次两部片还行，十九个单元就是五十七次；漏一次 revision
//   就整批失败、错一次顺序就留下半个状态。这里把它变成一条命令。
//
// 与上游的契约（写进上游调用说明，见 workflows/laohu-video/规范/动画导演转译规范.md §5）：
//   每个单元一个自包含组件，默认导出 React.FC<Props>，props 走 zod schema；
//   1920×1080 / 30fps / 透明底，不含背景、字幕、进度条、人物与音轨；
//   时长由 props.durationInFrames 控制（缺省时按 duration × fps 注入）；
//   触发锚点用相对本单元开头的秒数，不用绝对秒。
//
// manifest 格式：
//   {
//     "schema": "laohu.overlay-manifest/1",
//     "compositionId": "Work018Overlay",
//     "fps": 30,
//     "units": [
//       { "segmentId": "V018-20", "slug": "source-converge",
//         "source": "…/works/Work018/source-converge.tsx",
//         "start": 452.66, "duration": 13.08,
//         "props": { "title": "…", "anchors": [ … ] } }
//     ]
//   }
//
// 用法：
//   node scripts/cap-overlay-mount.mjs --project <工程.cap> --manifest <manifest.json> [--dry-run]

import { readFile, writeFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const DEFAULT_CLI = "/Applications/CapMotion.app/Contents/MacOS/cap-cli";

/** 纯校验：manifest 结构、必填字段、时长为正、segmentId 不重复。不碰文件系统与 CLI。 */
export function validateManifest(manifest) {
	const problems = [];
	if (manifest?.schema !== "laohu.overlay-manifest/1") {
		problems.push(`schema 必须是 laohu.overlay-manifest/1，实际是 ${manifest?.schema}`);
	}
	if (!manifest?.compositionId) problems.push("缺少 compositionId");
	const units = manifest?.units ?? [];
	if (!units.length) problems.push("没有 units");
	const seen = new Set();
	for (const u of units) {
		const id = u.segmentId ?? "?";
		if (!u.segmentId) problems.push("有单元缺少 segmentId");
		else if (seen.has(u.segmentId)) problems.push(`segmentId 重复：${u.segmentId}`);
		else seen.add(u.segmentId);
		if (!u.slug) problems.push(`${id} 缺少 slug`);
		if (!u.source) problems.push(`${id} 缺少 source`);
		if (!(u.duration > 0)) problems.push(`${id} 的 duration 必须为正数`);
		if (!(u.start >= 0)) problems.push(`${id} 的 start 必须 ≥ 0`);
		if (u.compositionId !== undefined && typeof u.compositionId !== "string") {
			problems.push(`${id} 的 compositionId 必须是字符串`);
		}
	}
	return problems;
}

/**
 * 单元 → 该单元要写进工程的东西。
 * compositionId 是**每个定义各自**的：同一份清单里可以既有共享形态组件
 * （一个 Composition 覆盖多种 kind），也有上游原卡这样的独立 Composition。
 * 顶层 compositionId 只作缺省。
 */
export function resolveUnit(u, fps, defaultCompositionId) {
	const durationInFrames =
		u.props?.durationInFrames ?? Math.max(1, Math.ceil(u.duration * fps));
	return {
		definitionId: u.definitionId ?? `work-${String(u.slug).replace(/[^a-z0-9-]/gi, "")}`,
		compositionId: u.compositionId ?? defaultCompositionId,
		durationInFrames,
		props: { ...(u.props ?? {}), durationInFrames },
	};
}

async function main() {
	const args = new Map();
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i += 2) args.set(argv[i]?.replace(/^--/, ""), argv[i + 1]);

	const projectPath = args.get("project");
	const manifestPath = args.get("manifest");
	const cli = args.get("cli") ?? DEFAULT_CLI;
	const dryRun = args.has("dry-run");

	if (!projectPath || !manifestPath) {
		process.stderr.write(
			"用法：node scripts/cap-overlay-mount.mjs --project <工程.cap> --manifest <manifest.json> [--dry-run]\n",
		);
		process.exit(2);
	}

	const abs = (p) => (isAbsolute(p) ? p : resolve(root, p));
	const readJson = async (p) => JSON.parse(await readFile(abs(p), "utf8"));

	const manifest = await readJson(manifestPath);
	const compositionId = manifest.compositionId;
	const fps = manifest.fps ?? 30;
	const units = manifest.units ?? [];

	// 前置校验：结构 + 源文件真的在盘上（存在性只能在这里查）
	const problems = validateManifest(manifest);
	for (const u of units) {
		if (!u.source) continue;
		try {
			await access(abs(u.source));
		} catch {
			problems.push(`${u.segmentId} 的源文件不存在：${u.source}`);
		}
	}
	if (problems.length) {
		process.stderr.write(`manifest 校验失败：\n  ${problems.join("\n  ")}\n`);
		process.exit(1);
	}

	const revOf = async () =>
		(await readJson(`${projectPath}/project-config.json`)).projectRevision;

	const run = (cmdArgs) => {
		const r = spawnSync(cli, cmdArgs, { encoding: "utf8" });
		if (r.status !== 0) {
			throw new Error(
				`${cli} ${cmdArgs.slice(0, 2).join(" ")} 失败：\n${r.stderr || r.stdout}`,
			);
		}
		return r.stdout ? JSON.parse(r.stdout) : null;
	};

	// 定义是版本化的、不可覆盖：同一 id 的 v1 只注册一次。
	// 上一次中途失败留下的定义在这里复用，不让整批挂载卡在一个已经存在的定义上。
	const ALREADY_EXISTS = /already exists/i;
	const registerDefinition = (definitionId, source, duration, unitCompositionId) => {
		const args = [
			"motion",
			"definition",
			"register",
			projectPath,
			"--expected-revision",
			String(0), // 占位，下面按实时 revision 重填
			"--id",
			definitionId,
			"--version",
			"1",
			"--source",
			source,
			"--composition-id",
			unitCompositionId,
			"--min-duration",
			"0.1",
			"--default-duration",
			String(duration),
			"--max-duration",
			"3600",
			"--json",
		];
		return args;
	};

	// 已存在于工程里的 motion 段落：不重复添加，避免留下半个状态
	const existing = new Set(
		((await readJson(`${projectPath}/project-config.json`)).motion?.segments ?? []).map(
			(s) => s.id,
		),
	);

	const results = [];
	const definitionReused = [];
	for (const u of units) {
		const { definitionId, compositionId: unitCompositionId, durationInFrames, props } =
			resolveUnit(u, fps, compositionId);

		if (existing.has(u.segmentId)) {
			results.push({ segmentId: u.segmentId, definitionId, action: "已存在，跳过" });
			continue;
		}
		if (dryRun) {
			results.push({
				segmentId: u.segmentId,
				definitionId,
				action: "将注册并挂载",
				start: u.start,
				duration: u.duration,
				durationInFrames,
			});
			continue;
		}

		const registerArgs = registerDefinition(
			definitionId,
			abs(u.source),
			u.duration,
			unitCompositionId,
		);
		registerArgs[registerArgs.indexOf("--expected-revision") + 1] = String(await revOf());
		try {
			run(registerArgs);
		} catch (error) {
			if (!ALREADY_EXISTS.test(String(error.message))) throw error;
			definitionReused.push(definitionId);
		}

		run([
			"motion",
			"add",
			projectPath,
			"--expected-revision",
			String(await revOf()),
			"--definition-id",
			definitionId,
			"--definition-version",
			"1",
			"--segment-id",
			u.segmentId,
			"--start",
			String(u.start),
			"--duration",
			String(u.duration),
			"--json",
		]);

		run([
			"motion",
			"props",
			"set",
			projectPath,
			"--expected-revision",
			String(await revOf()),
			"--segment",
			u.segmentId,
			"--props-json",
			JSON.stringify(props),
			"--json",
		]);

		results.push({
			segmentId: u.segmentId,
			definitionId,
			action: "已挂载",
			start: u.start,
			duration: u.duration,
			durationInFrames,
		});
	}

	const receipt = {
		schema: "laohu.overlay-mount-receipt/1",
		project: projectPath,
		manifest: abs(manifestPath),
		compositionId,
		fps,
		unitCount: units.length,
		mounted: results.filter((r) => r.action === "已挂载").length,
		skipped: results.filter((r) => r.action === "已存在，跳过").length,
		dryRun,
		finalRevision: await revOf(),
		definitionReused,
		results,
		mountedAt: new Date().toISOString(),
	};

	if (!dryRun) {
		const receiptPath = `${dirname(abs(manifestPath))}/动画挂载回执.json`;
		await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
	}

	process.stdout.write(`${JSON.stringify(receipt, null, 1)}\n`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
