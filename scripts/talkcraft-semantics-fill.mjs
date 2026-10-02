#!/usr/bin/env node
// 语义标注预填：把上游 ②-1 的骨架填成可校验的 semantics.json。
//
// 分工：
//   · 落在覆盖动画窗口内的句子 = main，语义由**我按这个单元要解决的观看问题**指定（下方 UNIT_SEM）
//   · 其余句子 = sub。本片绝大多数时间由录屏画面承担讲解，这些句子只允许已有元素变化，不进新元素
//   · 上游的词法硬规（自我介绍 / 号召 / 数据）不分 main sub 都要标对，这里兜底
//
// 用法：
//   node scripts/talkcraft-semantics-fill.mjs --project-dir 作品/018_0930录屏讲解后期

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const args = new Map();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) args.set(argv[i]?.replace(/^--/, ""), argv[i + 1]);

const projectDir = resolve(root, args.get("project-dir") ?? "作品/018_0930录屏讲解后期");
const workDir = `${projectDir}/制作/动画工程`;

// 语义词表（26 词封闭词表，唯一来源 cards_index.py 的 VOCAB_SET）
const VOCAB = new Set([
	"介绍他人", "例证", "列举", "号召", "定义", "对比", "引用", "强调", "数据",
	"时间地点", "机制", "标题", "步骤", "氛围", "空间叙事", "章节", "结尾",
	"自我介绍", "论点", "设问", "转场", "转折", "过程演示", "选择", "金句", "钩子",
]);

// 每个覆盖单元要解决的观看问题决定它的**主语义**（单元 id 与 all-units.json 一致，补零）
const UNIT_SEM = {
	"V018-1": "机制",
	"V018-2": "步骤",
	"V018-03": "对比",
	"V018-04": "机制",
	"V018-05": "列举",
	"V018-06": "选择",
	"V018-07": "金句",
	"V018-08": "对比",
	"V018-09": "对比",
	"V018-10": "列举",
	"V018-11": "对比",
	"V018-12": "机制",
	"V018-13": "列举",
	"V018-14": "定义",
	"V018-15": "金句",
	"V018-16": "选择",
	"V018-17": "步骤",
	"V018-18": "对比",
	"V018-19": "列举",
};

// 上游词法硬规：不分 main / sub 都要标对
	/[0-9０-９]|[一二三四五六七八九十百千万亿]+(?:个|万|亿|千|百|年|月|天|秒|分|次|步|条|张|位|款|块|倍|%)/;
const hardSems = (t) => {
	const out = [];
	if (/我(?:是|叫)[^的了个们它他她这那什么谁很不在会要想觉为因怎如]/.test(t)) out.push("自我介绍");
	if (/点赞|订阅|三连|关注我/.test(t)) out.push("号召");
	if (numberRe.test(t)) out.push("数据");
	return out;
};

const NEED_OF = {
	数据: "量化",
	对比: "对比",
	机制: "结构",
	步骤: "结构",
	选择: "结构",
	金句: "强调",
	定义: "结构",
	列举: "结构",
	证明: "证据",
	例证: "证据",
	自我介绍: "身份",
	介绍他人: "身份",
};

const [timestamps, units, skeleton, shotbook] = await Promise.all([
	readFile(`${workDir}/audio/timestamps.json`, "utf8").then(JSON.parse),
	readFile(`${root}/target/018-restore/all-units.json`, "utf8").then(JSON.parse),
	readFile(`${workDir}/semantics.json`, "utf8").then(JSON.parse),
	readFile(`${workDir}/SHOTBOOK.md`, "utf8"),
]);

// 镜头范围来自 SHOTBOOK.md（唯一真源）：## sNN · 起–止 · 标题
const shots = [];
for (const line of shotbook.split("\n")) {
	const m = /^##\s+([Ss]\d+)\s*·\s*([0-9.]+)\s*[–—~-]\s*([0-9.]+)/.exec(line);
	if (m) shots.push({id: m[1].toLowerCase(), start: Number(m[2]), end: Number(m[3])});
}
if (!shots.length) throw new Error("SHOTBOOK.md 里没有可解析的镜头标题（## sNN · 起–止 · …）");

// 覆盖窗口：单元 id → [起, 止]
const windows = units.map((u) => ({
	id: u.segmentId,
	sem: UNIT_SEM[u.segmentId],
	start: u.start,
	end: u.start + u.duration,
}));

const numberRe = /[0-9０-９]|[一二三四五六七八九十百千万亿]+(?:个|万|亿|千|百|年|月|天|秒|分|次|步|条|张|位|款|块|倍|%)/;

// 每镜只有一个主句：镜头里第一句。卡片出现的那一拍才是新元素的挂点；
// 同一镜里其余句子都是陪衬句——「一句一个新元素」正是不停往上堆的凌乱根源。
const shotOf = (t) => shots.find((sh) => t >= sh.start - 0.001 && t < sh.end);
const mainSentenceIndex = new Map();
for (const sh of shots) {
	const first = skeleton.sentences.find(
		(x) => x.t >= sh.start - 0.001 && x.t < sh.end,
	);
	if (first) mainSentenceIndex.set(sh.id, first.i);
}

const filled = skeleton.sentences.map((s) => {
	const hints = (s.hint ?? []).filter((x) => VOCAB.has(x));
	const hard = hardSems(s.text);
	const shot = shotOf(s.t);
	const isMain = shot ? mainSentenceIndex.get(shot.id) === s.i : false;
	// 覆盖窗口内的句子是这个单元在讲的内容：主语义由单元决定
	const unit = windows.find((w) => s.t >= w.start - 0.35 && s.t < w.end);
	const sem = [...new Set([...(unit ? [unit.sem] : []), ...hints, ...hard])];
	if (!sem.length) sem.push("论点");

	const entities = [
		...new Set(
			(s.text.match(/[0-9]+(?:\.[0-9]+)?\s*(?:万|亿|千|%|个|年|月|天|次|步|倍)?/g) ?? [])
				.map((x) => x.trim())
				.filter(Boolean),
		),
	];
	const need = [...new Set(sem.map((x) => NEED_OF[x]).filter(Boolean))];

	return {
		i: s.i,
		t: s.t,
		text: s.text,
		shot: "",
		sem,
		entities,
		need: need.length ? need : ["无"],
		weight: isMain ? "main" : "sub",
	};
});

const out = {
	version: skeleton.version ?? 1,
	source: { timestamps: "audio/timestamps.json" },
	sentences: filled,
};

await writeFile(`${workDir}/semantics.json`, `${JSON.stringify(out, null, 1)}\n`, "utf8");

const stats = filled.reduce(
	(acc, s) => {
		acc[s.weight] = (acc[s.weight] ?? 0) + 1;
		for (const sem of s.sem) acc[`sem:${sem}`] = (acc[`sem:${sem}`] ?? 0) + 1;
		return acc;
	},
	{},
);

process.stdout.write(
	`${JSON.stringify({ ok: true, sentences: filled.length, main: stats.main ?? 0, sub: stats.sub ?? 0, coveredUnits: windows.length, shots: shots.length }, null, 1)}\n`,
);
