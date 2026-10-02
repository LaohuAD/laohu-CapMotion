#!/usr/bin/env node
// 上游原卡蒙皮器：把 video-talkcraft 的卡复制进 workspace，套上本片的深底皮肤。
//
// 为什么要有这个脚本：
//   卡库的卡是白底舞台、Apple 蓝强调色。叠在录屏上必须换深底、换强调色、去掉白底，
//   还要把 960×540 的绘制面放大到 1920×1080。手改 12 张会各改各的，颜色和对比度漂移。
//
// 只改皮层，不动运动：
//   · 卡的组件体（时序、缓动、几何、层级）一个字不改——只是把 `export default`
//     改成内部组件，再在外面包一层缩放容器和压暗层
//   · 改的只有色值字面量与舞台背景
//
// 用法：
//   node scripts/talkcraft-skin-card.mjs <slug> [<slug> ...]

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const TEMPLATE = resolve(root, ".agents/skills/video-talkcraft/template/cards");
const OUT = resolve(root, "workflows/laohu-video/模板/remotion-assets/workspace/src/cards");

// 本片深底皮肤（与 source-converge 蒙皮版同一套值）
export const SKIN = {
	stage: "transparent",
	panel: "#0C1417",
	text: "#F4F8F7",
	muted: "#9FB0AF",
	accentFill: "#12857A",
	accentLight: "#8FE3D1",
	hairline: "rgba(255,255,255,0.16)",
	chartLine: "#3A4A4C",
	chartGrid: "#223033",
	negative: "#FF6B6B",
	scrim: "#05090B",
};

/** 卡库里共用的色值 → 本片深底皮肤。顺序有意义：先处理有语境的，再处理通用字面量。 */
export const COLOR_MAP = [
	// ① 人物对侧半幅的白面板 → 深面板 + 发丝分隔线
	[
		'alignItems: "flex-end", justifyContent: "center", background: "#fff" }}>',
		`alignItems: "flex-end", justifyContent: "center", background: "${SKIN.panel}", borderLeft: "1px solid ${SKIN.hairline}" }}>`,
	],
	[
		'alignItems: "flex-end", justifyContent: "flex-start", background: "#fff" }}>',
		`alignItems: "flex-end", justifyContent: "flex-start", background: "${SKIN.panel}", borderLeft: "1px solid ${SKIN.hairline}" }}>`,
	],
	// ② 根 AbsoluteFill 的白底舞台 → 透明（下面露出录屏）
	['background: "#ffffff", color: "#1d1d1f"', `background: "${SKIN.stage}", color: "${SKIN.text}"`],
	['background: "#fff", color: "#1d1d1f"', `background: "${SKIN.stage}", color: "${SKIN.text}"`],
	// ③ CSS 里的裸白底（不带引号）——只按 background 语境替换，避免动到「强调色上的白字」
	["background: #ffffff", `background: ${SKIN.panel}`],
	["background: #fff;", `background: ${SKIN.panel};`],
	["background: #fff ", `background: ${SKIN.panel} `],
	// ④ 其余 JSX 内的白底（卡片内部的浅色块）→ 深面板
	['background: "#ffffff"', `background: "${SKIN.panel}"`],
	['background: "#fff"', `background: "${SKIN.panel}"`],
	// ④ 文字与强调色
	["#1d1d1f", SKIN.text],
	["#171717", SKIN.text],
	["#0066cc", SKIN.accentFill],
	["#1B3CF5", SKIN.accentFill],
	["#0aa3a3", SKIN.accentFill],
	["#8a8a8a", SKIN.muted],
	["#5a5a5f", SKIN.muted],
	// ⑤ 中性灰（描边、网格、次级面）→ 深底上的对应阶
	["#ececef", SKIN.chartLine],
	["#e4e4e7", SKIN.chartLine],
	["#e3e3e6", SKIN.chartLine],
	["#e0e0e0", SKIN.chartLine],
	["#d9d9de", SKIN.chartLine],
	["#d8d8d8", SKIN.chartLine],
	["#d6d6dc", SKIN.chartLine],
	["#d2d2d7", SKIN.chartLine],
	["#cdcdd2", SKIN.chartLine],
	["#c8c8cc", SKIN.chartLine],
	["#f5f5f7", SKIN.panel],
	["#f0f0f2", SKIN.panel],
	// ⑥ 语义色：负向保留红，冷色统一到强调色系
	["#2fb344", SKIN.accentFill],
	["#d8383a", SKIN.negative],
	["#FF3B1F", SKIN.negative],
	["#8A9BFF", SKIN.accentLight],
];

/**
 * 每张卡要注入的内容。卡库的卡把 demo 文案写在模块级常量或 CONFIG 里，
 * 不改这两处就没法拿来讲本片的词。
 *   constName：模块级 `const X = [...]` → 变成 `{ X_default }` 形参 + 组件内同名局部量
 *   configKey：模块级 CONFIG 的某个键 → 组件内用展开覆盖，模块级别名保持可用
 */
export const CONTENT = {
	"type-contrast-emphasis": { configKey: "words", prop: "words" },
	"alt-block-lines": { constName: "ROWS", prop: "rows" },
	"chart-grow": { constName: "COLS", prop: "cols" },
	"line-by-line-slide": { configKey: "lines", prop: "lines" },
	"per-character-rise": { configKey: "text", prop: "text" },
	"numbered-step-stack": { constName: "STEPS", prop: "steps" },
	// 时间轴卡：节点数组带 at（线推到该位置的时刻），只换文案不换 at
	"step-timeline-vertical": { constName: "STEPS", prop: "steps" },
};

/**
 * 版式适配：本片底画是录屏 + 右下角摄像头小窗，没有「整侧人物」。
 * 卡库默认给人物留 47% 一列，这里把那一列收掉，主体区居中占满。
 */
export const LAYOUT = {
	"type-contrast-emphasis": [
		['<div className="host-wrap"><Host src={hostSrc} /></div>', ""],
		["left: 48%;", "left: 8%;"],
		["right: 3%;", "right: 8%;"],
		["justify-content: flex-start;", "justify-content: center;"],
	],
	"alt-block-lines": [
		['<div className="host-wrap"><Host src={hostSrc} /></div>', ""],
		["left: 82px; top: 50%;", "left: 50%; top: 50%;"],
		["transform: translateY(-50%);", "transform: translate(-50%, -50%);"],
	],
	"numbered-step-stack": [
		['<div className="host-col"><Host src={hostSrc} /></div>', ""],
		[".stack {\n  position: absolute;\n  right: 62px;", ".stack {\n  position: absolute;\n  left: 50%;"],
		// 用负外边距居中，不用 transform——卡自己会用内联 transform 做上浮，会把它覆盖掉
		["width: 486px;", "width: 620px;\n  margin-left: -310px;"],
	],
};

/**
 * 语音锚点注入：把卡自己那套 demo 节拍（写死的 0 / 0.62 / 1.12…）换成
 * 口播里关键词的真实时刻。
 *
 * 为什么这是命门：卡原本按自己的钟走，只设卡起点是不够的——第五个词照样会在
 * 早 1.4 秒的地方冒出来，而主讲人还没说到；他真说到的第一个关键词又完全没有动画。
 * 注进去之后，**说一个词，出一个元素**，卡的存活期也跟着最后一个关键词走。
 */
export const ANCHORS = {
	"type-contrast-emphasis": [
		"const at = CONFIG.startDelay + item.beat;",
		"const at = CONFIG.startDelay + (anchors[i] ?? item.beat);",
	],
	"alt-block-lines": [
		"const at = CONFIG.lead + i * CONFIG.rowStagger;",
		"const at = anchors[i] ?? (CONFIG.lead + i * CONFIG.rowStagger);",
	],
	"line-by-line-slide": [
		"const at = CONFIG.lead + i * CONFIG.enterStagger;",
		"const at = anchors[i] ?? (CONFIG.lead + i * CONFIG.enterStagger);",
	],
	"numbered-step-stack": [
		"const at = CONFIG.lead + i * CONFIG.barStagger;",
		"const at = anchors[i] ?? (CONFIG.lead + i * CONFIG.barStagger);",
	],
	// 时间轴卡：节点时刻由线推到该处的缓动反函数算出，锚点注进「线推到哪」
	"step-timeline-vertical": [
		"const WRAP_H = 264;   // .tl-wrap 高度 = 线的全长（本组几何基准）",
		"const WRAP_H = 264;   // .tl-wrap 高度 = 线的全长（本组几何基准）",
	],
	"per-character-rise": [
		"const at = CONFIG.lead + i * CONFIG.stagger;",
		"const at = anchors[i] ?? (CONFIG.lead + i * CONFIG.stagger);",
	],
	// 芯片卡：每个候选按口播念到它的时刻出现；选中那一拍锚在最后一个候选之后
	"chip-grid-single-select": [
		"const inP = tw(t, 0.5 + i * 0.1, 0.25, power1Out);",
		"const inP = tw(t, anchors[i] ?? (0.5 + i * 0.1), 0.25, power1Out);",
	],
};

/**
 * 字体：卡库默认以苹方优先，而本机苹方只有 6 个字重、没有 700 以上——
 * `font-weight: 700/800` 拿到的是浏览器合成的假粗体，这是「看着不专业」的一个可复现成因。
 * 本机 Noto Sans CJK SC 有真实 100/300/350/400/500/700/900，排到最前即可命中真字重。
 * 没有 SemiBold，600 会落到 500，所以字重只留 500 / 700 / 900 三档。
 */
export const FONT_STACK =
	'"Noto Sans CJK SC", "Source Han Sans CN VF", "PingFang SC", "Hiragino Sans GB", sans-serif';
export const FONT_MAP = [
	['"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif', FONT_STACK],
	['"Source Han Sans CN VF", "PingFang SC", "Hiragino Sans GB", sans-serif', FONT_STACK],
	["font-weight: 600", "font-weight: 500"],
	["font-weight: 800", "font-weight: 900"],
	["fontWeight: 600", "fontWeight: 500"],
	["fontWeight: 800", "fontWeight: 900"],
];

/**
 * 退场时刻跟着段落走。
 * 卡自带的退场是写在它自己的 demo 时长上的——段落有 10 秒、卡只有 4 秒，
 * 卡演完就退场，剩下 6 秒是空画面。实测 V018-06 / 09 / 19 都出现过这种情况。
 */
export const EXIT_FOLLOWS_SEGMENT = {
	// 结论胶囊的底色原本也是 #1d1d1f，被全局映射换成了文字色 → 近白底配白字。
	// 它的语义是「深底强调胶囊」，深底皮肤下应当是深面板。
	"word-slot-cycle": [
		["background: #F4F8F7; color: #ffffff;", "background: #0C1417; color: #ffffff;"],
	],
	"chip-grid-single-select": [
		"const exitK = 1 - tw(t, CONFIG.exitAt, CONFIG.end - CONFIG.exitAt, power2In);",
		"const EXIT_AT = Math.max(CONFIG.exitAt, TOTAL - 0.4);\n  const exitK = 1 - tw(t, EXIT_AT, Math.max(0.05, TOTAL - EXIT_AT), power2In);",
	],
	"line-by-line-slide": [
		"const exitStart = enterEnd + CONFIG.hold;",
		"const exitStart = Math.max(enterEnd + CONFIG.hold, TOTAL - 0.4);",
	],
	"title-demote-to-label": [
		"const exitAt = growAt + (items.length - 1) * CONFIG.stagger + CONFIG.holdEnd;",
		"const exitAt = Math.max(growAt + (items.length - 1) * CONFIG.stagger + CONFIG.holdEnd, TOTAL - 0.4);",
	],
	"word-slot-cycle": [
		"const exitAt = lastAt + CONFIG.holdEnd;",
		"const exitAt = Math.max(lastAt + CONFIG.holdEnd, TOTAL - 0.4);",
	],
};

/**
 * 版式修补：卡是按它 demo 的文案长度设计的，换成本片的词会撑破。
 * 逐字升起卡固定 72px + nowrap，为 6~10 字设计；19 字 ×2 放大后是 2736px，远超 1920。
 * 按字数反推字号：可用宽度 = 960 − 两侧安全边距，除以字数，且不超过原字号。
 */
export const FIT_TEXT = {
	"per-character-rise": [
		"  const chars = Array.from(CONFIG.text);",
		"  const chars = Array.from(CONFIG.text);\n  const FS = Math.min(72, (960 - 96) / Math.max(1, chars.length));",
		'<span className="pcr-text">',
		'<span className="pcr-text" style={{ fontSize: FS }}>',
	],
};

/** 每张卡的额外处理：卡特有的一次性替换。 */
export const CARD_OVERRIDES = {
	// 结论胶囊的底色原本也是 #1d1d1f，被全局映射换成了文字色 → 近白底配白字。
	// 它的语义是「深底强调胶囊」，深底皮肤下应当是深面板。
	"word-slot-cycle": [
		["background: #F4F8F7; color: #ffffff;", "background: #0C1417; color: #ffffff;"],
	],
	// 芯片卡：选中的那枚要从「浅底深字」翻成「强调色底深字」。
	// 它的颜色写在 JS 字符串里（不是 CSS，也不是 background: 前缀），通用映射抓不到——
	// 漏掉就会白底配近白字，等于看不见。
	// 结论胶囊的底色原本也是 #1d1d1f，被全局映射换成了文字色 → 近白底配白字。
	// 它的语义是「深底强调胶囊」，深底皮肤下应当是深面板。
	"word-slot-cycle": [
		["background: #F4F8F7; color: #ffffff;", "background: #0C1417; color: #ffffff;"],
	],
	"chip-grid-single-select": [
		['bg = "#ffffff", color = "#F4F8F7", border = "#3A4A4C"',
		 'bg = "#161E21", color = "#F4F8F7", border = "#3A4A4C"'],
		['bg = mix("#ffffff", "#F4F8F7", blackP); color = mix("#F4F8F7", "#ffffff", blackP); border = mix("#3A4A4C", "#F4F8F7", blackP);',
		 'bg = mix("#161E21", "#8FE3D1", blackP); color = mix("#F4F8F7", "#04100E", blackP); border = mix("#3A4A4C", "#8FE3D1", blackP);'],
	]
};

const pascal = (slug) =>
	slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("");

const genericHeader = (slug, source) => {
	// 只补卡里缺的导入。卡源的每一行都必须原样保留——早先按「去掉第一行」写，
	// 把 `import React, { useRef, ... }` 一起丢掉了，组件里就 useRef is not defined。
	const need = [];
	if (!/from "react"/.test(source)) need.push('import React from "react";');
	if (!/AbsoluteFill/.test(source)) need.push('import { AbsoluteFill } from "remotion";');
	return `// ${slug} · 蒙皮版（原卡：video-talkcraft/template/cards/${slug}.tsx）
//
// 只改皮层：白底舞台 → 透明底 + 压暗；Apple 蓝强调色 → 本片强调色；
// 绘制面由 960×540 等比放大到 1920×1080。卡的时序 / 缓动 / 几何 / 层级未改。
${need.join("\n")}${need.length ? "\n" : ""}
`;
};

const buildWrapper = (slug, componentName, innerName, propNames, meta) => {
	const metaDuration = /durationInFrames:\s*(\d+)/.exec(meta)?.[1] ?? "180";
	const propsType = propNames.length ? propNames.join(", ") : "";
	const passThrough = propNames.length
		? `\n\t\t\t\t{${propsType}}`
		: "";
	return `
// —— 蒙皮外壳的默认 props：Root.tsx 与挂载清单都读它 ——
export const ${componentName}DefaultProps = {
	durationInFrames: ${metaDuration},
	scrim: 0.82,
	anchors: [] as number[],
};

// —— 蒙皮外壳：压暗 + 把 960×540 的绘制面等比放大到 1920×1080 ——
export const ${componentName}: React.FC<
	Record<string, unknown> & { scrim?: number; durationInFrames?: number }
> = ({ scrim = 0.82, durationInFrames = ${metaDuration}, ...rest }) => (
	<AbsoluteFill style={{ overflow: "hidden" }}>
		{scrim > 0 ? (
			<div
				style={{
					position: "absolute",
					left: 0,
					top: 0,
					width: 1920,
					height: 1080,
					background: "${SKIN.scrim}",
					opacity: scrim,
				}}
			/>
		) : null}
		<div
			style={{
				position: "absolute",
				left: 0,
				top: 0,
				width: 960,
				height: 540,
				transform: "scale(2)",
				transformOrigin: "top left",
			}}
		>
			<${innerName} {...rest} durationInFrames={durationInFrames} />
		</div>
	</AbsoluteFill>
);
`;
};

async function skinCard(slug) {
	const source = await readFile(`${TEMPLATE}/${slug}.tsx`, "utf8");
	const componentName = pascal(slug);
	const innerName = `${componentName}Inner`;

	// 卡的默认导出改成内部组件，外部只暴露蒙皮外壳。
	// 内部名必须来自这次改名本身——按「第一个带解构参数的函数」去找会抓到卡内部的
	// 辅助组件（chart-grow 就抓到过 ChartGrowInner），外壳会渲染错东西。
	const defaultMatch = /export default function\s+(\w+)\s*\(([^)]*)\)/.exec(source);
	if (!defaultMatch) throw new Error(`${slug}: 找不到 export default function`);
	// 内部组件加 Inner 后缀：外壳要导出同名符号，不改名会「已声明」冲突
	const declaredInner = `${defaultMatch[1]}Inner`;
	const propNames = defaultMatch[2]
		.replace(/^\s*\{|\}\s*$/g, "")
		.split(",")
		.map((x) => x.split(/[=:]/)[0].trim())
		.filter((x) => /^[A-Za-z_$][\w$]*$/.test(x));
	let out = source.replace(
		/export default function\s+(\w+)/,
		(_m, name) => `function ${name}Inner`,
	);

	// 色值与舞台
	for (const [from, to] of LAYOUT[slug] ?? []) {
		if (!out.includes(from)) throw new Error(`${slug}: 版式适配找不到「${from.slice(0, 40)}」`);
		out = out.split(from).join(to);
	}
	for (const [from, to] of COLOR_MAP) {
		out = out.split(from).join(to);
	}
	for (const [from, to] of FONT_MAP) {
		out = out.split(from).join(to);
	}
	// CSS 形态的栈（font-family: 而不是 fontFamily:）单独收一遍
	out = out.replace(
		/font-family:\s*"PingFang SC"[^;`]*;/g,
		`font-family: ${FONT_STACK};`,
	);
	// 去重：源栈里本来就有 Noto，替换后会重复
	out = out.replace(
		/"Noto Sans CJK SC", "Noto Sans CJK SC"/g,
		'"Noto Sans CJK SC"',
	);
	// 字重归一：600/800 在本机没有真实字重，按正则统一到 500/900
	out = out.replace(/font-weight:\s*600/g, "font-weight: 500");
	out = out.replace(/font-weight:\s*800/g, "font-weight: 900");
	out = out.replace(/fontWeight:\s*600/g, "fontWeight: 500");
	out = out.replace(/fontWeight:\s*800/g, "fontWeight: 900");
	// 覆盖写在颜色映射之后：覆盖串表达的是最终色值，先跑会静默匹配不上
	for (const [from, to] of CARD_OVERRIDES[slug] ?? []) {
		if (!out.includes(from)) {
			throw new Error(`${slug}: 覆盖串没匹配上「${from.slice(0, 50)}」`);
		}
		out = out.split(from).join(to);
	}

	// —— 内容注入 ——
	const spec = CONTENT[slug];
	let injectTotal = false;
	let injectParam = null; // 形参片段
	let injectBody = null; // 组件体首行
	if (spec?.constName) {
		const re = new RegExp(`const ${spec.constName} = ([\\s\\S]*?\\n\\];|\\[\\s\\S]*?\\];)`);
		const found = re.exec(out) ?? new RegExp(`const ${spec.constName} = ([^;]*;)`).exec(out);
		if (!found) throw new Error(`${slug}: 找不到 const ${spec.constName}`);
		const defaultName = `${spec.constName}_DEFAULT`;
		out = out.replace(found[0], `const ${defaultName} = ${found[1]}`);
		injectParam = `${spec.prop} = ${defaultName}`;
		injectBody = `const ${spec.constName} = ${spec.prop};`;
	}
	if (spec?.configKey) {
		if (!/const CONFIG = \{/.test(out)) throw new Error(`${slug}: 找不到 const CONFIG`);
		out = out.replace("const CONFIG = {", "const CONFIG_BASE = {");
		out = out.replace(
			/(const CONFIG_BASE = \{[\s\S]*?\n\};)/,
			`$1\nconst CONFIG = CONFIG_BASE;   // 模块级别名：组件外仍可用原名`,
		);
		const defaultName = `DEFAULT_${spec.configKey.toUpperCase()}`;
		out = out.replace(
			"const CONFIG = CONFIG_BASE;   // 模块级别名：组件外仍可用原名",
			`const CONFIG = CONFIG_BASE;   // 模块级别名：组件外仍可用原名\nconst ${defaultName} = CONFIG_BASE.${spec.configKey};`,
		);
		injectParam = `${spec.prop} = ${defaultName}`;
		injectBody = `const CONFIG = { ...CONFIG_BASE, ${spec.configKey}: ${spec.prop} };`;
	}

	// 形参：把注入的内容加进**解构**，类型单独补——直接往参数串尾部塞会落到类型标注里
	if (injectParam) {
		const raw = defaultMatch[2].trim();
		if (raw) {
			const dm = /^(\{[^}]*\})\s*(?::\s*([\s\S]+))?$/.exec(raw);
			if (!dm) throw new Error(`${slug}: 形参形状不认识：${raw}`);
			const destructuring = dm[1].replace(/\}\s*$/, `, ${injectParam} }`);
			const type = dm[2] ? `${dm[2].replace(/\}\s*$/, `; ${spec.prop}?: any }`)}` : "";
			out = out.replace(
				`function ${declaredInner}(${defaultMatch[2]})`,
				`function ${declaredInner}(${destructuring}${type ? `: ${type}` : ""})`,
			);
		} else {
			out = out.replace(
				new RegExp(`function ${declaredInner}\\(\\)`),
				`function ${declaredInner}({ ${injectParam} }: { ${spec.prop}?: any } = {})`,
			);
		}
	}

	// 锚点：形参加 anchors，节拍行改成优先用锚点。
	// 必须在内容注入**之后**基于当前签名插——用原始签名串匹配会因为签名已被改过而静默失败。
	if (ANCHORS[slug]) {
		const [from, to] = ANCHORS[slug];
		if (!out.includes(from)) throw new Error(`${slug}: 找不到节拍行「${from}」`);
		out = out.replace(from, to);
		const sig = new RegExp(`(function ${declaredInner}\\(\\{)([^}]*)(\\})`);
		if (!sig.test(out)) throw new Error(`${slug}: 找不到可注入 anchors 的解构签名`);
		out = out.replace(sig, (_m, a, b, c) => `${a}${b}, anchors = [] ${c}`);
		const typeRe = new RegExp(`(function ${declaredInner}\\(\\{[^}]*\\}:\\s*\\{)([^}]*)(\\})`);
		if (typeRe.test(out)) {
			out = out.replace(typeRe, (_m, a, b, c) => `${a}${b}; anchors?: number[] ${c}`);
		} else {
			out = out.replace(
				new RegExp(`(function ${declaredInner}\\(\\{[^}]*\\})\\)`),
				"$1: { anchors?: number[] })",
			);
		}
	}

	// 段落时长：退场跟着段落走，形参带 durationInFrames
	if (EXIT_FOLLOWS_SEGMENT[slug]) {
		const [from, to] = EXIT_FOLLOWS_SEGMENT[slug];
		if (!out.includes(from)) throw new Error(`${slug}: 找不到退场行「${from.slice(0, 40)}」`);
		out = out.replace(from, to);
		const sig2 = new RegExp(`(function ${declaredInner}\\(\\{)([^}]*)(\\})`);
		if (!sig2.test(out)) throw new Error(`${slug}: 找不到可注入 durationInFrames 的签名`);
		out = out.replace(sig2, (_m, a, b, c) => `${a}${b}, durationInFrames = 180 ${c}`);
		injectTotal = true;
	}

	// 版式修补：按文案长度定字号
	for (let i = 0; i < (FIT_TEXT[slug]?.length ?? 0); i += 2) {
		const [from, to] = [FIT_TEXT[slug][i], FIT_TEXT[slug][i + 1]];
		if (!out.includes(from)) throw new Error(`${slug}: 找不到版式修补点「${from.slice(0, 40)}」`);
		out = out.split(from).join(to);
	}

	// 组件体首行：用注入的内容遮蔽模块级常量
	if (injectTotal) out = out.replace(/(function \w+Inner\([\s\S]*?\)\s*\{\n)/, "$1  const TOTAL = durationInFrames / FPS;\n");
	if (injectBody) {
		const bodyRe = new RegExp(
			`(function ${declaredInner}\\([\\s\\S]*?\\)\\s*\\{\\n)`,
		);
		if (!bodyRe.test(out)) throw new Error(`${slug}: 找不到组件体插入点`);
		out = out.replace(bodyRe, `$1  ${injectBody}\n`);
	}

	const metaMatch = /export const meta = \{([^}]*)\}/.exec(source);
	const meta = metaMatch ? metaMatch[1].trim() : "";

	out = genericHeader(slug, source) + out;
	out += buildWrapper(slug, componentName, declaredInner, propNames, meta);

	await mkdir(OUT, { recursive: true });
	await writeFile(`${OUT}/${slug}.tsx`, out, "utf8");
	return { slug, componentName, inner: declaredInner, props: propNames, bytes: out.length };
}

const slugs = process.argv.slice(2);
if (!slugs.length) {
	process.stderr.write("用法：node scripts/talkcraft-skin-card.mjs <slug> [<slug> ...]\n");
	process.exit(2);
}

const results = [];
for (const slug of slugs) results.push(await skinCard(slug));
process.stdout.write(`${JSON.stringify(results, null, 1)}\n`);
