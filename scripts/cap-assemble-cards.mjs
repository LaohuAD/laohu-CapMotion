#!/usr/bin/env node
// 018 覆盖单元装配：把「每镜用哪张卡、喂什么内容」写成 Composition 注册与挂载清单。
//
// 内容全部来自本片口播（分析/预剪辑审稿.json 冻结稿），不是编的。
// 动画是一拍，不是墙纸：每张卡按自己的自然时长挂载，起点对齐到口播的关键句，
// 演完就离场——不把 2 秒的卡拉成 80 秒的窗口。

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const WS = `${root}/workflows/laohu-video/模板/remotion-assets/workspace`;
const OUT = `${root}/作品/018_0930录屏讲解后期/制作`;

// 单元内容不再在这里写第二份：卡名、模式、文案、强调方式全部来自 anchor-plan.json。
// 窗口起点来自 all-units.json（冻结审稿推出的覆盖窗口）
const windows = JSON.parse(await readFile(`${root}/target/018-restore/all-units.json`, "utf8"));
const winOf = new Map(windows.map((w) => [w.segmentId, w]));

// 语音锚点：卡的起点、时长、每个元素的出现时刻全部由口播决定（见 cap-anchor-plan.mjs）
const anchorPlan = JSON.parse(
	await readFile(`${root}/target/018-restore/anchor-plan.json`, "utf8"),
);
const anchorOf = new Map(anchorPlan.units.map((u) => [u.seg, u]));

const cards = [...new Set(anchorPlan.units.map((u) => u.slug))];
const pascal = (s) => s.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("");

// ① Root.tsx 的 Composition 注册块
const imports = cards
	.map(
		(c) => `import {
  ${pascal(c)} as ${pascal(c)}Card,
  ${pascal(c)}DefaultProps as ${pascal(c)}Defaults,
} from "./cards/${c}";`,
	)
	.join("\n");

const registrations = cards
	.map(
		(c) => `        <Composition
          id="Card${pascal(c)}"
          component={${pascal(c)}Card}
          durationInFrames={${pascal(c)}Defaults.durationInFrames}
          fps={30}
          width={1920}
          height={1080}
          calculateMetadata={({ props }: { props: { durationInFrames: number } }) => ({
            durationInFrames: props.durationInFrames,
            defaultOutName: "Card${pascal(c)}",
          })}
        />`,
	)
	.join("\n");

// ② 挂载清单
const clamped = [];
const POS = {对比: "a", 参照: "b"};
const units = anchorPlan.units.map((a) => {
	const u = a;

	// **单一真源**：卡上显示什么字，由锚点表的 lines 决定，不在这里再写一份。
	// 早先两边各写一套，锚点注进去了、字没换，第一个元素就错位了。
	const lines = a.align.map((h) => h.line);
	const C = a.content ?? {};
	const mode = a.mode ?? "list";
	const props =
		mode === "single"
			? {
					question: lines[0],
					options: lines.slice(1),
					selected: C.selected ?? 0,
					equation: C.equation ?? [],
				}
			: mode === "cycle"
				? {stem: C.stem, words: lines, final: C.final, accent: "#8FE3D1"}
				: mode === "chars"
					? {text: lines.join("")}
					: mode === "title"
						? {
								title: C.title,
								items: lines,
								// 底板与强调色必须显式给：卡自带的是浅色系，
								// 深底皮肤下会变成「浅底 + 近白字」= 看不见
								itemBg: ["#12312C", "#143036", "#1A2A33", "#2A2438"],
								accent: "#8FE3D1",
							}
						: mode === "converge"
							? {
									title: C.title,
									sources: lines,
									hub: C.hub ?? lines[lines.length - 1],
									caption: C.caption,
									convAt: a.anchorsRel[a.anchorsRel.length - 1],
								}
							: u.slug === "type-contrast-emphasis"
								? {
										words: lines.map((w, i) => ({
											w,
											beat: a.anchorsRel[i],
											emph: C.emph?.[i] ?? undefined,
										})),
									}
								: u.slug === "alt-block-lines"
									? {rows: lines.map((t, i) => ({cls: POS[i] ?? "a", text: t}))}
									: u.slug === "numbered-step-stack"
										? {
												// 这张卡的真实 prop 是 steps（带编号的对象），不是 lines——
												// 传错名字它会静默回落到自带的 demo 文案（「把手机放到另一个房间」）
												steps: lines.map((t, i) => ({
													no: String(i + 1).padStart(2, "0"),
													txt: t,
												})),
											}
										: u.slug === "step-timeline-vertical"
											? {
													// 节点在线上的位置按锚点比例排——线推到的节奏与口播一致
													steps: lines.map((x, i) => ({
														at:
															22 +
															(a.anchorsRel[i] / Math.max(0.001, a.anchorsRel[a.anchorsRel.length - 1])) *
																220,
														kicker: `第${i + 1}步`,
														title: x,
													})),
												}
											: {lines};

	const w = winOf.get(u.seg);
	const start = a.start;
	const wanted = a.duration;
	if (start < w.start - 3 || start > w.start + w.duration) {
		throw new Error(`${u.seg}: 锚点起点 ${start} 落得离覆盖窗口太远`);
	}

	return {
		segmentId: u.seg,
		slug: u.slug,
		definitionId: `card-${u.slug}`,
		compositionId: `Card${pascal(u.slug)}`,
		source: `${WS}/src/cards/${u.slug}.tsx`,
		start,
		rawDuration: wanted,
		duration: Math.round(wanted * 1000) / 1000,
		props: {
			durationInFrames: Math.round(wanted * 30),
			scrim: 0.82,
			anchors: a.anchorsRel,
			...props,
		},
		anchorSource: a ? "口播逐字锚点" : "固定节拍",
	};
});

// 相邻不重叠：按起点排序，每张卡最多铺到下一张卡的起点
units.sort((x, y) => x.start - y.start);
for (let i = 0; i < units.length; i++) {
	const next = units[i + 1];
	const wanted = units[i].rawDuration;
	const room = next ? next.start - units[i].start : wanted;
	const got = Math.round(Math.min(wanted, room) * 1000) / 1000;
	if (got <= 0.2) throw new Error(`${units[i].segmentId}: 卡放不下（起点 ${units[i].start}）`);
	if (wanted - got > 0.6) {
		clamped.push({seg: units[i].segmentId, wanted, got, trimmed: Math.round((wanted - got) * 1000) / 1000});
	}
	units[i].duration = got;
	units[i].props.durationInFrames = Math.round(got * 30);
}

await writeFile(
	`${root}/target/018-restore/card-registrations.tsx`,
	`${imports}\n\n${registrations}\n`,
	"utf8",
);
await writeFile(
	`${OUT}/动画manifest.json`,
	`${JSON.stringify({schema: "laohu.overlay-manifest/1", compositionId: "CardSourceConverge", fps: 30, units}, null, 1)}\n`,
	"utf8",
);

process.stdout.write(
	`${JSON.stringify(
		{
			ok: true,
			cards: cards.length,
			units: units.length,
			cardList: cards,
			totalCardSeconds: Math.round(units.reduce((a, u) => a + u.duration, 0) * 10) / 10,
			clampedByWindow: clamped,
			sample: units.slice(0, 3),
		},
		null,
		1,
	)}\n`,
);
