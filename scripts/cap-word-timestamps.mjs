#!/usr/bin/env node
// 逐字时间戳生成器：从源 ASR 的真实词级时码，派生上游动画 Skill 要的 timestamps.json。
//
// 为什么不能用校正字幕：
//   屏幕字幕是改写过的（去口语冗余、修错词、合并或拆分句子）。它的时间区间是「这段文字
//   显示多久」，不是「这些字什么时候被念出来」。按字幕触发动画，合并句会在第一句刚开始
//   就弹出、拆分句会弹两次、改过的字会永久错位。
//   所以发声证据只取源 ASR 的原词与真实词级时码；校正字幕另作显示语义，两者互不覆盖。
//
// 时钟：
//   词的 sourceStartMs 是麦克风本地时钟；加各段 sourceTimelineOffsetSeconds 得到该段的
//   显示时钟，也就是冻结 EDL 与审稿 sourceRanges 使用的基准。再经 EDL 映射到成片时间 T2。
//
// 用法：
//   node scripts/cap-word-timestamps.mjs --project-dir 作品/018_0930录屏讲解后期

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * 纯函数核心：给四份原始数据，产出逐字时间戳与三分账。
 * 不读文件、不写文件，便于测试与复用。
 */
export function buildWordTimestamps({ asr, sourceIndex, edl, review }) {
	const offsetOf = new Map(
		sourceIndex.segments.map((s) => [s.recordingSegment, s.sourceTimelineOffsetSeconds]),
	);

	// 删除台账与审稿 sourceRanges 同口径（显示时钟），用于把未保留的词归因
	const fileToSegment = new Map(
		sourceIndex.segments.map((s) => [s.microphonePath, s.recordingSegment]),
	);
	const ledgerBySegment = new Map();
	for (const entry of review?.deletionLedger?.entries ?? []) {
		for (const r of entry.sourceRanges ?? []) {
			const seg = fileToSegment.get(r.file);
			if (seg === undefined) continue;
			const list = ledgerBySegment.get(seg) ?? [];
			list.push({ start: r.start, end: r.end });
			ledgerBySegment.set(seg, list);
		}
	}

	// 保留区间按录制段分组
	const rangesBySegment = new Map();
	for (const e of edl.sequence) {
		const list = rangesBySegment.get(e.recordingSegment) ?? [];
		list.push(e);
		rangesBySegment.set(e.recordingSegment, list);
	}
	for (const list of rangesBySegment.values()) list.sort((a, b) => a.sourceStart - b.sourceStart);

	// 显示时钟的一个区间 → 成片时间区间，取重叠最大的保留区间。
	// 口径与冻结 EDL 的覆盖审计一致：**重叠即保留**。按「词首在区间内」判会丢掉被剪口
	// 切掉尾巴的词，动画就可能漏掉关键词。
	const toTargetRange = (segment, displayStart, displayEnd) => {
		let best = null;
		for (const e of rangesBySegment.get(segment) ?? []) {
			const a = Math.max(displayStart, e.sourceStart);
			const b = Math.min(displayEnd, e.sourceEnd);
			if (b - a <= 1e-6) continue;
			if (!best || b - a > best.overlap) {
				best = {
					overlap: b - a,
					start: e.targetStart + (a - e.sourceStart),
					end: e.targetStart + (b - e.sourceStart),
				};
			}
		}
		return best;
	};

	const inLedger = (segment, displayStart, displayEnd) =>
		(ledgerBySegment.get(segment) ?? []).some(
			(r) => Math.min(displayEnd, r.end) - Math.max(displayStart, r.start) > 1e-6,
		);

	const sentences = [];
	let totalWords = 0;
	let keptWords = 0;
	let droppedWords = 0;
	let ledgerDeletedWords = 0;
	let uncoveredWords = 0;
	let spanStart = Number.POSITIVE_INFINITY;
	let spanEnd = 0;

	for (const utterance of asr.utterances) {
		const segment = utterance.recordingSegment;
		const offset = offsetOf.get(segment);
		if (offset === undefined) throw new Error(`source-index 缺少录制段 ${segment} 的偏移`);

		const mapped = [];
		for (const w of utterance.words ?? []) {
			const text = String(w.text ?? "");
			// 只有真实发声的词进分母：空文本与零／负时长的占位项既不是字，也不参与统计
			if (!text.trim()) continue;
			if (!(w.sourceEndMs > w.sourceStartMs)) continue;
			totalWords += 1;

			const displayStart = w.sourceStartMs / 1000 + offset;
			const displayEnd = w.sourceEndMs / 1000 + offset;
			const hit = toTargetRange(segment, displayStart, displayEnd);
			if (!hit) {
				if (inLedger(segment, displayStart, displayEnd)) ledgerDeletedWords += 1;
				else uncoveredWords += 1;
				droppedWords += 1;
				continue;
			}
			mapped.push({ text, start: round3(hit.start), end: round3(hit.end) });
		}

		if (!mapped.length) continue;
		keptWords += mapped.length;

		// 成句单位是**源语句**，不是保留区间。
		// 按保留区间切会把「大错特错」拆成「…告诉你大」+「错特错」——每个剪口都制造一个
		// 碎句，动画锚点就落在半个词上。同一条源语句里幸存的词合成一句。
		sentences.push({
			text: mapped.map((w) => w.text).join(""),
			start: mapped[0].start,
			end: mapped[mapped.length - 1].end,
			words: mapped,
		});
		spanStart = Math.min(spanStart, mapped[0].start);
		spanEnd = Math.max(spanEnd, mapped[mapped.length - 1].end);
	}

	sentences.sort((a, b) => a.start - b.start);

	const payload = {
		sr: 16000,
		total: round3(edl.durationSeconds),
		source: {
			asr: "输入/cap-asr.raw.json",
			sourceIndex: "输入/source-index.json",
			edl: "制作/剪辑清单.json",
			timeBasis:
				"词 sourceStartMs 为麦克风本地时钟，加该段 sourceTimelineOffsetSeconds 得显示时钟，再经冻结 EDL 映射到成片时间",
			note: "文本取源 ASR 原词，不取校正字幕；校正字幕另作显示语义，两者互不覆盖",
		},
		sentences: sentences.map((s, i) => ({
			i,
			text: s.text,
			start: s.start,
			end: s.end,
			// match / ok 是上游的自检位。本生成器不引入任何改写，词流与发声同源，故恒为 true；
			// 保留字段是为了让下游能区分「原样继承」与「人工改写」
			match: true,
			ok: true,
			words: s.words,
		})),
	};

	return {
		payload,
		coverage: {
			sentences: sentences.length,
			totalWordsInSource: totalWords,
			keptWords,
			droppedWords,
			ledgerDeletedWords,
			uncoveredWords,
			keptRatio: round3(keptWords / Math.max(1, totalWords)),
			spanStart: round3(Number.isFinite(spanStart) ? spanStart : 0),
			spanEnd: round3(spanEnd),
			// 三分账：保留 + 台账删除 + 未覆盖 = 源词总数
			reconciles: keptWords + ledgerDeletedWords + uncoveredWords === totalWords,
		},
	};
}

const isMain =
	process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
	const here = dirname(fileURLToPath(import.meta.url));
	const root = resolve(here, "..");
	const args = new Map();
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i += 2) args.set(argv[i]?.replace(/^--/, ""), argv[i + 1]);

	const projectDir = resolve(root, args.get("project-dir") ?? "作品/018_0930录屏讲解后期");
	const outPath = resolve(root, args.get("out") ?? `${projectDir}/制作/逐字时间戳.json`);
	const receiptPath = resolve(
		root,
		args.get("receipt") ?? `${projectDir}/制作/逐字时间戳回执.json`,
	);

	const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));
	const [asr, sourceIndex, edl, review] = await Promise.all([
		readJson(`${projectDir}/输入/cap-asr.raw.json`),
		readJson(`${projectDir}/输入/source-index.json`),
		readJson(`${projectDir}/制作/剪辑清单.json`),
		readJson(`${projectDir}/分析/预剪辑审稿.json`),
	]);

	const { payload, coverage } = buildWordTimestamps({ asr, sourceIndex, edl, review });

	const pick = [0, Math.floor(payload.sentences.length / 2), payload.sentences.length - 1].filter(
		(i) => i >= 0 && i < payload.sentences.length,
	);
	const receipt = {
		schema: "laohu.word-timestamps-receipt/1",
		out: outPath.replace(`${root}/`, ""),
		durationSeconds: round3(edl.durationSeconds),
		coverage,
		samples: pick.map((i) => payload.sentences[i]),
		checkedAt: new Date().toISOString(),
	};

	await writeFile(outPath, `${JSON.stringify(payload, null, 1)}\n`, "utf8");
	await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

	process.stdout.write(
		`${JSON.stringify({ ok: true, out: outPath, receipt: receiptPath, ...coverage }, null, 1)}\n`,
	);
}
