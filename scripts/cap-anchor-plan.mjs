#!/usr/bin/env node
// 语音锚点生成器：把动画的每个元素对齐到主讲人真正说出它的那一刻。
//
// 为什么这是命门（018 实测）：
//   卡自带一套 demo 节拍（0 / 0.62 / 1.15 / 1.38 / 1.58），只设卡的起点是不够的——
//   实测第五个词比口播早 1.45 秒冒出来，主讲人还没说到；而他真说到的第一个关键词
//   （53.29 秒的「我好牛逼呀」）根本没有对应动画。看起来就像一张自己播放的 PPT。
//
// 做法：
//   把每个元素的文案**逐字对齐**到成片的逐字时间戳上，取首字的真实时刻做锚点。
//   卡的起点 = 第一个元素的锚点，卡的时长 = 最后一个元素说完 + 收尾。
//   于是「说一个关键词，出一个元素」，卡的存活期由最后一个关键词决定。
//
// 用法：
//   node scripts/cap-anchor-plan.mjs --project-dir 作品/018_0930录屏讲解后期

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const args = new Map();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) args.set(argv[i]?.replace(/^--/, ""), argv[i + 1]);
const projectDir = resolve(root, args.get("project-dir") ?? "作品/018_0930录屏讲解后期");

// 每镜：卡、要出现在画面上的文案（按出现顺序）、收尾留白秒数。
// 文案一律取自本片口播——对齐用的是成片逐字流，写别的话就对不上。
const PLAN = [
	{
		seg: "V018-03", slug: "type-contrast-emphasis", hold: 0.9,
		lines: ["我好牛逼", "事实真的是", "我牛逼", "还是", "AI牛逼"],
		emph: [null, null, "serif", null, "color"],
	},
	{
		seg: "V018-04", slug: "source-converge", hold: 1.2, mode: "converge",
		title: "人人都会用 AI 之后",
		lines: ["越来越多的人都会使用AI工具", "信息差越来越小", "大家都能够用AI去完成工作"],
		hub: "核心优势到底在什么地方",
		caption: "问题回到自己身上",
	},
	{
		seg: "V018-05", slug: "word-slot-cycle", hold: 0.8, mode: "cycle",
		stem: "你拿到的图，",
		lines: ["千篇一律", "全是AI脸", "完全没有美感", "无法控制"],
		final: "说不清哪里不对",
	},
	{
		seg: "V018-06", slug: "chip-grid-single-select", hold: 1.2, mode: "single",
		question: "这个skill到底帮他做了什么东西",
		options: ["帮助他出图", "怎么工作的", "换个场景换个要求"],
		selected: 1,
		equation: ["不知道", "下次换个场景"],
	},
	{
		seg: "V018-07", slug: "per-character-rise", hold: 1.0, mode: "chars",
		lines: ["你用AI做什么的时候你就会得到什么"],
	},
	{
		seg: "V018-08", slug: "alt-block-lines", hold: 0.9,
		lines: ["而是在想为什么不行", "反过来向AI提问"],
	},
	{
		seg: "V018-09", slug: "line-by-line-slide", hold: 0.8,
		lines: ["跟你的提示词毫无关系", "我们真正想要什么样的画面", "把我们的需求说得更具体", "让AI真正的明白"],
	},
	{
		seg: "V018-10", slug: "title-demote-to-label", hold: 1.0, mode: "title",
		title: "第一次听到这些词",
		lines: ["什么是景别", "什么是运镜", "什么是冲突", "什么又是张力"],
	},
	{
		seg: "V018-11", slug: "alt-block-lines", hold: 0.9,
		lines: ["知道这些词和知道它的解释", "真正的能够把它用于创作"],
	},
	{
		seg: "V018-12", slug: "source-converge", hold: 1.2, mode: "converge",
		title: "张力是什么",
		lines: ["一个人", "遇到一个问题", "不断的反复的折磨观众"],
		hub: "张力",
		caption: "也在折磨观众",
	},
	{
		seg: "V018-13", slug: "word-slot-cycle", hold: 0.8, mode: "cycle",
		stem: "这段故事，",
		lines: ["张力在哪里", "有没有张力", "如何去构建这个张力"],
		final: "可以直接问AI",
	},
	{
		seg: "V018-14", slug: "title-demote-to-label", hold: 1.0, mode: "title",
		title: "费曼学习法",
		lines: ["费曼学习法", "干中学", "边干边学"],
	},
	{
		seg: "V018-15", slug: "per-character-rise", hold: 1.0, mode: "chars",
		lines: ["在AI时代我们一定要建立起来的核心竞争力"],
	},
	{
		seg: "V018-1", slug: "source-converge", hold: 1.2, mode: "converge",
		title: "左脚踩右脚",
		lines: ["找到问题", "分析问题", "解决问题", "成为自己的经验"],
		hub: "自己的经验",
		caption: "下一次更好用",
	},
	{
		seg: "V018-16", slug: "chip-grid-single-select", hold: 1.2, mode: "single",
		question: "这里给出了三个选择",
		options: ["主动愿意", "简单回应", "拒绝"],
		selected: 0,
		equation: ["可以继续", "礼貌结束"],
	},
	{
		seg: "V018-17", slug: "step-timeline-vertical", hold: 1.0,
		lines: ["通过聊天了解彼此", "关键是有来有往", "分享自己"],
	},
	{
		seg: "V018-18", slug: "alt-block-lines", hold: 0.9,
		lines: ["你自己也会有压力", "带来的就是失望恐惧压力", "每次开口都像考试"],
	},
	{
		seg: "V018-2", slug: "numbered-step-stack", hold: 1.0,
		lines: ["整个步骤下来有10个步骤", "每一个步骤是不是可以把它拆", "第一步", "认识女生"],
	},
	{
		seg: "V018-19", slug: "line-by-line-slide", hold: 0.8,
		lines: ["沉淀成为一个可以被复用的一个技能", "可以去帮助别人", "提升自己的效率"],
	},
];


const ts = JSON.parse(await readFile(`${projectDir}/制作/逐字时间戳.json`, "utf8"));
const windows = JSON.parse(await readFile(`${root}/target/018-restore/all-units.json`, "utf8"));
const winOf = new Map(windows.map((w) => [w.segmentId, w]));

// 成片逐字流：{ch, start}，按时间排好
const STREAM = [];
for (const s of ts.sentences) for (const w of s.words) for (const ch of w.text) STREAM.push({ch, start: w.start});
STREAM.sort((a, b) => a.start - b.start);

const norm = (c) => c.replace(/[\s，。、！？：；…—·「」『』“”‘’（）()《》,.!?:;]/g, "");

// 成片逐字流拼成一条连续字符串，配一张「字符位置 → 成片时刻」表。
// 必须整句连续匹配：早先按单字贪心向后找，会把散落在相邻句子里的同名字凑成一句，
// 「我好牛逼」被匹配到 48.9 秒（他 53.29 才说），锚点整个错位。
export const STREAM_TEXT = STREAM.map((x) => x.ch).join("");
export const STREAM_TIME = STREAM.map((x) => x.start);

/**
 * 在成片逐字流里找一句原话，返回它每个字的成片时刻。
 * fromPos 是字符位置，只向后找——保证元素的先后顺序与口播一致。
 */
export function alignPhrase(phrase, fromPos = 0) {
	const p = [...phrase].map(norm).filter(Boolean).join("");
	if (!p) return { times: [], ratio: 0, nextPos: fromPos };
	const i = STREAM_TEXT.indexOf(p, fromPos);
	if (i < 0) {
		// 逐段回退：允许口播里有少量插入语（例如「这个 skill 到底」中间夹了语气词）
		for (let cut = Math.floor(p.length / 2); cut >= 3; cut--) {
			const head = p.slice(0, cut);
			const j = STREAM_TEXT.indexOf(head, fromPos);
			if (j >= 0) {
				return {
					times: Array.from({length: cut}, (_, k) => STREAM_TIME[j + k]),
					ratio: cut / p.length,
					nextPos: j + cut,
				};
			}
		}
		return { times: [], ratio: 0, nextPos: fromPos };
	}
	return {
		times: Array.from({length: p.length}, (_, k) => STREAM_TIME[i + k]),
		ratio: 1,
		nextPos: i + p.length,
	};
}

const r3 = (v) => Math.round(v * 1000) / 1000;
const results = [];

for (const p of PLAN) {
	const w = winOf.get(p.seg);
	if (!w) throw new Error(`all-units.json 缺少 ${p.seg}`);
	const winStart = w.start;
	// 从窗口起点前 1 秒开始找，容忍 ASR 与窗口边界的几十毫秒差
	let cursor = STREAM.findIndex((x) => x.start >= winStart - 1);
	if (cursor < 0) cursor = 0;

	// 元素文案随卡的形状取：列表卡看 lines，芯片卡看选项与算式，汇聚卡看来源与汇聚点
	// 只有**逐个出现的元素**需要锚点。汇总结论（方程行 / 汇聚胶囊）不是关键词，
	// 它们跟着最后一个元素出现，卡自己有时序，硬给锚点反而会撞车。
	const items = p.mode === "converge" ? p.lines : p.mode === "single" ? p.options : p.lines;

	const anchors = [];
	const hits = [];
	for (const line of items) {
		const {times, ratio, nextPos} = alignPhrase(line, cursor);
		if (ratio < 0.99) {
			throw new Error(
				`${p.seg}「${line}」没有在窗口里找到原话（匹配率 ${(ratio * 100).toFixed(0)}%）——` +
					"卡上的字必须是主讲人真说出口的关键词，编的文案没有可对齐的时刻",
			);
		}
		anchors.push(times[0]);
		hits.push({line, at: r3(times[0]), ratio: r3(ratio)});
		cursor = nextPos;
	}

	const first = anchors[0];
	const rel = anchors.map((a) => r3(a - first));
	const lastItem = items[items.length - 1];
	const lastEnd = anchors[anchors.length - 1] + Math.max(1.0, lastItem.length * 0.18);
	const duration = r3(lastEnd - first + p.hold);

	results.push({
		seg: p.seg,
		slug: p.slug,
		mode: p.mode ?? "list",
		// 非锚点内容一并带出：卡的标题、汇聚点、结论、选项样式都从这里取，
		// 调用方不再各写一份文案
		content: {
			title: p.title,
			stem: p.stem,
			final: p.final,
			hub: p.hub,
			caption: p.caption,
			selected: p.selected,
			equation: p.equation,
			emph: p.emph,
		},
		window: {start: r3(winStart), end: r3(winStart + w.duration)},
		start: r3(first),
		duration,
		anchorsRel: rel,
		align: hits,
	});
}

await writeFile(
	`${root}/target/018-restore/anchor-plan.json`,
	`${JSON.stringify({streamWords: STREAM.length, units: results}, null, 1)}\n`,
	"utf8",
);

process.stdout.write(
	`${JSON.stringify(
		{
			ok: true,
			units: results.length,
			avgAlign:
				Math.round(
					(results.flatMap((r) => r.align).reduce((a, h) => a + h.ratio, 0) /
						results.flatMap((r) => r.align).length) *
						100,
				) / 100,
			sample: results[0],
		},
		null,
		1,
	)}\n`,
);
