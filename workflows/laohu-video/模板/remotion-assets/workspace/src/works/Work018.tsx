import React from "react";
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from "remotion";
import {z} from "zod";

// 018 从使用 AI 工具到建立判断力 —— 上层覆盖动画
//
// 两条放置纪律：
//   1. 只在录屏画面静止、且不是操作演示的段落出现；画面推近或拉远时不出动画。
//   2. 前半段鼠标停在右上角，用全幅压暗 + 居中图形；后半段鼠标在中间偏左，
//      改用右侧竖条面板，不遮鼠标、不遮摄像头、不遮字幕。
//
// 形态（kind）：
//   loop       三个 skill 的循环
//   steps      十个步骤一览（全幅）
//   panel      右侧步骤面板，逐条累加，落满后转为进度高亮
//   statement  单句大字卡
//   list       条目清单，逐条点亮
//   contrast   左右对照
//   chain      箭头链
//   branch     一个条件，两条出路

const FRAME_WIDTH = 1920;
const FRAME_HEIGHT = 1080;
const FPS = 30;

const entrySchema = z.object({
	label: z.string(),
	sub: z.string().optional(),
	note: z.string().optional(),
	// 该条落地的时刻（秒，相对本单元开头）。缺省时按总时长均分。
	at: z.number().optional(),
});

export const work018OverlaySchema = z.object({
	kind: z.enum([
		"loop",
		"steps",
		"panel",
		"statement",
		"list",
		"contrast",
		"chain",
		"branch",
	]),
	durationInFrames: z.number().int().min(30),
	title: z.string().optional(),
	subtitle: z.string().optional(),
	footnote: z.string().optional(),
	items: z.array(entrySchema).optional(),
	left: z
		.object({title: z.string(), lines: z.array(z.string()).optional()})
		.optional(),
	right: z
		.object({title: z.string(), lines: z.array(z.string()).optional()})
		.optional(),
	accent: z.string().optional(),
	// 本单元内部「画面正在推近」的帧区间（单元本地帧号）。
	// 推近时画面被放大，覆盖层按同一机制缩小并让到旁边，不遮住正在看的鼠标位置。
	zoomRanges: z.array(z.array(z.number())).optional(),
});

export type Work018OverlayProps = z.infer<typeof work018OverlaySchema>;

export const work018DefaultProps: Work018OverlayProps = {
	kind: "statement",
	durationInFrames: 300,
	title: "判断力",
};

const colors = {
	text: "#F4F8F7",
	muted: "#A9BAB9",
	dim: "#6E8180",
	panel: "rgba(8, 16, 20, 0.90)",
	panelSoft: "rgba(8, 16, 20, 0.80)",
	line: "rgba(196, 218, 216, 0.28)",
	teal: "#8FE3D1",
	violet: "#B6B2FF",
	amber: "#F5C36A",
	rose: "#FF9E9E",
};

const ease = Easing.bezier(0.22, 1, 0.36, 1);

const useReveal = (from: number, length = 14) => {
	const frame = useCurrentFrame();
	return interpolate(frame, [from, from + length], [0, 1], {
		easing: ease,
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
};

const FONT = '"Source Han Sans CN VF", "PingFang SC", system-ui, sans-serif';

const ZOOM_RAMP_FRAMES = 12;

// 与摄像头小窗 scaleDuringZoom 同一机制：画面推近时覆盖层缩小并让位。
const useZoomAmount = (ranges?: number[][]) => {
	const frame = useCurrentFrame();
	if (!ranges?.length) return 0;
	let amount = 0;
	for (const [a, b] of ranges) {
		const ramp = Math.min(
			interpolate(frame, [a - ZOOM_RAMP_FRAMES, a], [0, 1], {
				easing: ease,
				extrapolateLeft: "clamp",
				extrapolateRight: "clamp",
			}),
			interpolate(frame, [b, b + ZOOM_RAMP_FRAMES], [1, 0], {
				easing: ease,
				extrapolateLeft: "clamp",
				extrapolateRight: "clamp",
			}),
		);
		amount = Math.max(amount, ramp);
	}
	return amount;
};

const ZOOM_SCALE = 0.58;
const ZOOM_SHIFT_X = 300;
const ZOOM_SHIFT_Y = -30;

const Scrim: React.FC<{children: React.ReactNode; zoom: number}> = ({
	children,
	zoom,
}) => (
	<AbsoluteFill
		style={{
			fontFamily: FONT,
			alignItems: "center",
			justifyContent: "center",
			flexDirection: "column",
		}}
	>
		{/* 全幅压暗只在没有推近时使用；推近时改为只压暗动画自己所在的区域 */}
		<div
			style={{
				position: "absolute",
				inset: 0,
				background: "rgba(3, 8, 10, 0.78)",
				opacity: 1 - zoom,
			}}
		/>
		<div
			style={{
				position: "relative",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				background: `rgba(3, 8, 10, ${0.9 * zoom})`,
				borderRadius: 24,
				padding: zoom > 0.01 ? "32px 38px" : 0,
				transform: `translate(${zoom * ZOOM_SHIFT_X}px, ${
					zoom * ZOOM_SHIFT_Y
				}px) scale(${1 - (1 - ZOOM_SCALE) * zoom})`,
			}}
		>
			{children}
		</div>
	</AbsoluteFill>
);

const Title: React.FC<{text?: string; from?: number}> = ({text, from = 0}) => {
	const r = useReveal(from, 14);
	if (!text) return null;
	return (
		<div
			style={{
				fontSize: 42,
				fontWeight: 700,
				color: colors.text,
				opacity: r,
				transform: `translateY(${(1 - r) * 14}px)`,
				marginBottom: 34,
				textAlign: "center",
			}}
		>
			{text}
		</div>
	);
};

const Footnote: React.FC<{text?: string; from: number}> = ({text, from}) => {
	const r = useReveal(from, 16);
	if (!text) return null;
	return (
		<div
			style={{
				marginTop: 30,
				fontSize: 27,
				color: colors.amber,
				opacity: r,
				textAlign: "center",
			}}
		>
			{text}
		</div>
	);
};

// ---------------------------------------------------------------- 大字卡
const Statement: React.FC<Work018OverlayProps & {zoom: number}> = ({
	title,
	subtitle,
	footnote,
	zoom,
}) => {
	const r = useReveal(0, 16);
	const r2 = useReveal(24, 16);
	return (
		<Scrim zoom={zoom}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 28,
					opacity: r,
					transform: `scale(${0.94 + r * 0.06})`,
				}}
			>
				<div
					style={{
						width: 8,
						height: 96,
						background: colors.teal,
						borderRadius: 4,
					}}
				/>
				<div
					style={{
						fontSize: 92,
						fontWeight: 700,
						color: colors.text,
						letterSpacing: 2,
					}}
				>
					{title}
				</div>
			</div>
			{subtitle ? (
				<div
					style={{
						marginTop: 28,
						fontSize: 34,
						color: colors.muted,
						opacity: r2,
						textAlign: "center",
						maxWidth: 1300,
						lineHeight: 1.5,
					}}
				>
					{subtitle}
				</div>
			) : null}
			<Footnote text={footnote} from={48} />
		</Scrim>
	);
};

// ---------------------------------------------------------------- 清单（逐条点亮）
const List: React.FC<Work018OverlayProps & {zoom: number}> = ({
	title,
	items = [],
	footnote,
	accent,
	zoom,
}) => {
	const frame = useCurrentFrame();
	const step = 16;
	return (
		<Scrim zoom={zoom}>
			<Title text={title} />
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 16,
					width: 1020,
				}}
			>
				{items.map((item, index) => {
					const r = useReveal(18 + index * step, 12);
					const activeUntil = 18 + (index + 1) * step + 26;
					const lit = frame < activeUntil;
					return (
						<div
							key={item.label}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 20,
								background: colors.panel,
								border: `1px solid ${lit ? accent ?? colors.teal : colors.line}`,
								borderRadius: 14,
								padding: "16px 24px",
								opacity: r * (lit ? 1 : 0.52),
								transform: `translateX(${(1 - r) * -20}px)`,
							}}
						>
							<div
								style={{
									width: 34,
									height: 34,
									borderRadius: 9,
									background: lit ? accent ?? colors.teal : colors.line,
									color: "#04100E",
									fontSize: 20,
									fontWeight: 700,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									flex: "0 0 auto",
								}}
							>
								{index + 1}
							</div>
							<div style={{fontSize: 34, color: colors.text, fontWeight: 600}}>
								{item.label}
							</div>
							{item.sub ? (
								<div style={{fontSize: 23, color: colors.muted, marginLeft: "auto"}}>
									{item.sub}
								</div>
							) : null}
						</div>
					);
				})}
			</div>
			<Footnote text={footnote} from={24 + items.length * step + 20} />
		</Scrim>
	);
};

// ---------------------------------------------------------------- 左右对照
const Contrast: React.FC<Work018OverlayProps & {zoom: number}> = ({
	title,
	left,
	right,
	footnote,
	accent,
	zoom,
}) => {
	const l = useReveal(16, 16);
	const r = useReveal(40, 16);
	const Column: React.FC<{
		data?: {title: string; lines?: string[]};
		progress: number;
		color: string;
	}> = ({data, progress, color}) => (
		<div
			style={{
				width: 620,
				background: colors.panel,
				border: `1px solid ${color}`,
				borderRadius: 18,
				padding: "30px 28px",
				opacity: progress,
				transform: `translateY(${(1 - progress) * 20}px)`,
			}}
		>
			<div style={{fontSize: 46, fontWeight: 700, color}}>{data?.title}</div>
			{(data?.lines ?? []).map((line) => (
				<div
					key={line}
					style={{
						marginTop: 14,
						fontSize: 26,
						color: colors.muted,
						lineHeight: 1.5,
					}}
				>
					{line}
				</div>
			))}
		</div>
	);
	return (
		<Scrim zoom={zoom}>
			<Title text={title} from={0} />
			<div style={{display: "flex", alignItems: "center", gap: 40}}>
				<Column data={left} progress={l} color={accent ?? colors.violet} />
				<div style={{fontSize: 42, color: colors.dim, opacity: l * r}}>↔</div>
				<Column data={right} progress={r} color={colors.teal} />
			</div>
			<Footnote text={footnote} from={72} />
		</Scrim>
	);
};

// ---------------------------------------------------------------- 箭头链
const Chain: React.FC<Work018OverlayProps & {zoom: number}> = ({
	title,
	items = [],
	footnote,
	zoom,
}) => (
	<Scrim zoom={zoom}>
		<Title text={title} />
		<div style={{display: "flex", alignItems: "center", gap: 14}}>
			{items.map((item, index) => {
				const r = useReveal(16 + index * 18, 14);
				return (
					<React.Fragment key={item.label}>
						{index > 0 ? (
							<div style={{fontSize: 34, color: colors.teal, opacity: r}}>→</div>
						) : null}
						<div
							style={{
								width: 224,
								background: colors.panel,
								border: `1px solid ${colors.line}`,
								borderRadius: 16,
								padding: "22px 16px",
								textAlign: "center",
								opacity: r,
								transform: `translateY(${(1 - r) * 18}px)`,
							}}
						>
							<div style={{fontSize: 32, fontWeight: 600, color: colors.text}}>
								{item.label}
							</div>
							{item.sub ? (
								<div style={{marginTop: 8, fontSize: 21, color: colors.muted}}>
									{item.sub}
								</div>
							) : null}
						</div>
					</React.Fragment>
				);
			})}
		</div>
		<Footnote text={footnote} from={28 + items.length * 18} />
	</Scrim>
);

// ---------------------------------------------------------------- 分支
const Branch: React.FC<Work018OverlayProps & {zoom: number}> = ({
	title,
	left,
	right,
	footnote,
	zoom,
}) => {
	const r = useReveal(16, 16);
	return (
		<Scrim zoom={zoom}>
			<Title text={title} />
			<div
				style={{
					width: 660,
					background: colors.panel,
					border: `1px solid ${colors.line}`,
					borderRadius: 16,
					padding: "22px 26px",
					textAlign: "center",
					opacity: r,
				}}
			>
				<div style={{fontSize: 34, fontWeight: 600, color: colors.text}}>
					{left?.title}
				</div>
			</div>
			<div
				style={{
					fontSize: 34,
					color: colors.dim,
					margin: "16px 0",
					opacity: r,
				}}
			>
				↓
			</div>
			<div style={{display: "flex", gap: 44}}>
				{(right?.lines ?? []).map((line, index) => {
					const rr = useReveal(44 + index * 22, 16);
					const good = index === 0;
					return (
						<div
							key={line}
							style={{
								width: 460,
								background: colors.panel,
								border: `1px solid ${good ? colors.teal : colors.rose}`,
								borderRadius: 16,
								padding: "24px 22px",
								textAlign: "center",
								opacity: rr,
								transform: `translateY(${(1 - rr) * 18}px)`,
							}}
						>
							<div
								style={{
									fontSize: 30,
									fontWeight: 600,
									color: good ? colors.teal : colors.rose,
									lineHeight: 1.45,
								}}
							>
								{line}
							</div>
						</div>
					);
				})}
			</div>
			<Footnote text={footnote} from={110} />
		</Scrim>
	);
};

// ---------------------------------------------------------------- 三个 skill 的循环
const LOOP_NODES = [
	{label: "找到问题", sub: "提出问题 skill", color: colors.teal},
	{label: "分析问题", sub: "分析问题 skill", color: colors.violet},
	{label: "沉淀经验", sub: "沉淀经验 skill", color: colors.amber},
];

const Loop: React.FC = () => {
	// 该单元落在画面静止窗口内，不涉及推近让位
	const zoom = 0;
	const frame = useCurrentFrame();
	const positions = [
		{x: 0, y: -180},
		{x: 300, y: 140},
		{x: -300, y: 140},
	];
	const intro = [18, 78, 138];
	const arrows = useReveal(210, 24);
	const caption = useReveal(300, 20);
	const pulse = interpolate(Math.sin((frame / FPS) * 2.6), [-1, 1], [0.6, 1]);
	return (
		<Scrim zoom={zoom}>
			<div style={{position: "relative", width: 900, height: 560}}>
				<svg
					width={900}
					height={560}
					viewBox="-450 -280 900 560"
					style={{position: "absolute", inset: 0}}
				>
					<defs>
						<marker
							id="w018-arrow"
							markerWidth="10"
							markerHeight="10"
							refX="8"
							refY="5"
							orient="auto"
						>
							<path d="M0,0 L10,5 L0,10 z" fill={colors.teal} />
						</marker>
					</defs>
					{[
						[0, 1],
						[1, 2],
						[2, 0],
					].map(([a, b], index) => {
						const p = positions[a];
						const q = positions[b];
						const dx = q.x - p.x;
						const dy = q.y - p.y;
						const len = Math.hypot(dx, dy) || 1;
						const ux = dx / len;
						const uy = dy / len;
						const pad = 148;
						const sx = p.x + ux * pad;
						const sy = p.y + uy * pad;
						const ex = q.x - ux * pad;
						const ey = q.y - uy * pad;
						const mx = (sx + ex) / 2 - uy * 44;
						const my = (sy + ey) / 2 + ux * 44;
						const revealed = interpolate(
							arrows,
							[index * 0.24, index * 0.24 + 0.4],
							[0, 1],
							{extrapolateLeft: "clamp", extrapolateRight: "clamp"},
						);
						return (
							<path
								key={index}
								d={`M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`}
								fill="none"
								stroke={colors.teal}
								strokeWidth={3}
								strokeDasharray="10 8"
								markerEnd="url(#w018-arrow)"
								opacity={revealed * 0.9}
							/>
						);
					})}
				</svg>
				{LOOP_NODES.map((node, index) => {
					const r = useReveal(intro[index], 16);
					const p = positions[index];
					return (
						<div
							key={node.label}
							style={{
								position: "absolute",
								left: 450 + p.x - 140,
								top: 280 + p.y - 58,
								width: 280,
								textAlign: "center",
								opacity: r,
								transform: `scale(${0.9 + r * 0.1})`,
							}}
						>
							<div
								style={{
									background: colors.panel,
									border: `1px solid ${node.color}`,
									borderRadius: 18,
									padding: "20px 16px",
									boxShadow:
										caption > 0 ? `0 0 ${26 * pulse}px ${node.color}44` : "none",
								}}
							>
								<div
									style={{fontSize: 38, fontWeight: 700, color: node.color}}
								>
									{node.label}
								</div>
								<div style={{fontSize: 20, color: colors.muted, marginTop: 6}}>
									{node.sub}
								</div>
							</div>
						</div>
					);
				})}
			</div>
			<div
				style={{
					fontSize: 44,
					fontWeight: 700,
					color: colors.text,
					opacity: caption,
					transform: `translateY(${(1 - caption) * 16}px)`,
				}}
			>
				左脚踩右脚
			</div>
			<div
				style={{
					marginTop: 10,
					fontSize: 24,
					color: colors.muted,
					opacity: caption,
				}}
			>
				找到问题 · 分析问题 · 沉淀为可复用的 skill
			</div>
		</Scrim>
	);
};

// ---------------------------------------------------------------- 十个步骤一览
const Steps: React.FC<Work018OverlayProps & {zoom: number}> = ({
	items = [],
	footnote,
	zoom,
}) => {
	const frame = useCurrentFrame();
	const title = useReveal(0, 14);
	const tagAt = 150;
	const tagged = useReveal(tagAt, 20);
	const footer = useReveal(tagAt + 90, 20);
	return (
		<Scrim zoom={zoom}>
			<div
				style={{
					fontSize: 40,
					fontWeight: 700,
					color: colors.text,
					opacity: title,
					marginBottom: 34,
				}}
			>
				整个流程 10 个步骤
			</div>
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					gap: 18,
					width: 1180,
					justifyContent: "center",
				}}
			>
				{items.map((item, index) => {
					const r = useReveal(16 + index * 10, 12);
					const isTagged =
						frame >= tagAt + index * 5 && frame < tagAt + index * 5 + 8;
					return (
						<div
							key={item.label}
							style={{
								width: 208,
								background: colors.panel,
								border: `1px solid ${tagged > 0 ? colors.teal : colors.line}`,
								borderRadius: 16,
								padding: "16px 14px",
								opacity: r,
								transform: `translateY(${(1 - r) * 16}px) scale(${
									isTagged ? 1.06 : 1
								})`,
								boxShadow: tagged > 0 ? `0 0 18px ${colors.teal}33` : "none",
							}}
						>
							<div
								style={{
									fontSize: 20,
									color: colors.muted,
									marginBottom: 6,
									fontVariantNumeric: "tabular-nums",
								}}
							>
								第 {index + 1} 步
							</div>
							<div
								style={{fontSize: 26, fontWeight: 600, color: colors.text}}
							>
								{item.label}
							</div>
							<div
								style={{
									marginTop: 8,
									fontSize: 18,
									color: colors.teal,
									opacity: tagged,
								}}
							>
								一个 skill
							</div>
						</div>
					);
				})}
			</div>
			<div
				style={{
					marginTop: 34,
					fontSize: 30,
					color: colors.amber,
					opacity: footer,
				}}
			>
				{footnote ?? "每一个步骤都可以拆成一个 skill"}
			</div>
		</Scrim>
	);
};

// ---------------------------------------------------------------- 右侧步骤面板
//
// 不显示总数，只累加：观众一条一条数，到口播说出"第十步"的那一刻刚好落满。
// 落满后转为进度模式：当前正在讲的那条高亮，其余压暗。
const PANEL_LEFT = 1268;
const PANEL_TOP = 62;
const PANEL_WIDTH = 574;

const StepPanel: React.FC<Work018OverlayProps & {zoom: number}> = (props) => {
	const {items = [], title, accent, zoom = 0} = props;
	const frame = useCurrentFrame();
	const head = useReveal(0, 14);
	// 每条落地的帧号：优先用显式时刻（秒，相对本单元开头），缺省时均分总时长。
	const landFrame = (index: number) => {
		const explicit = items[index]?.at;
		if (typeof explicit === "number") return Math.round(explicit * FPS) + 10;
		const span = (props.durationInFrames - 20) / Math.max(1, items.length);
		return Math.round(10 + (index + 1) * span) - Math.round(span);
	};
	const frames = items.map((_, index) => landFrame(index));
	const filled = Math.max(1, frames.filter((f) => frame >= f).length);
	const lastAt = frames[frames.length - 1] ?? 10;
	const allLanded = frame >= lastAt;
	return (
		<AbsoluteFill style={{fontFamily: FONT}}>
			<div
				style={{
					position: "absolute",
					left: PANEL_LEFT,
					top: PANEL_TOP,
					width: PANEL_WIDTH,
					background: colors.panelSoft,
					border: `1px solid ${colors.line}`,
					borderRadius: 20,
					padding: "22px 24px 24px",
					opacity: head,
					transformOrigin: "right top",
					transform: `translateX(${(1 - head) * 26}px) scale(${
						1 - 0.22 * zoom
					})`,
				}}
			>
				<div
					style={{
						fontSize: 27,
						fontWeight: 700,
						color: colors.text,
						marginBottom: 16,
						letterSpacing: 1,
					}}
				>
					{title ?? "整个流程的步骤"}
				</div>
				<div style={{display: "flex", flexDirection: "column", gap: 9}}>
					{items.slice(0, filled).map((item, index) => {
						const landed = true;
						const isNew = index === filled - 1;
						const at = frames[index];
						const r = landed
							? interpolate(frame, [at, at + 12], [0, 1], {
									easing: ease,
									extrapolateLeft: "clamp",
									extrapolateRight: "clamp",
								})
							: 0;
						// 正在讲的那条 = 最近落地的一条；全部落地后停留片刻再往后走
						const current = filled - 1;
						const isCurrent = landed && index === current;
						const color = accent ?? colors.teal;
						return (
							<div
								key={item.label}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 14,
									padding: "9px 12px",
									borderRadius: 11,
									background: isCurrent ? `${color}1F` : "transparent",
									border: `1px solid ${isCurrent ? color : "transparent"}`,
									opacity: isCurrent ? 1 : 0.74,
									transform: `translateX(${(1 - r) * 18}px)`,
								}}
							>
								<div
									style={{
										width: 26,
										height: 26,
										borderRadius: 7,
										flex: "0 0 auto",
										background: landed ? color : "transparent",
										border: `1px solid ${landed ? color : colors.line}`,
										color: landed ? "#04100E" : colors.dim,
										fontSize: 16,
										fontWeight: 700,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										fontVariantNumeric: "tabular-nums",
									}}
								>
									{index + 1}
								</div>
								<div
									style={{
										fontSize: 26,
										fontWeight: isCurrent ? 700 : 500,
										color: landed
											? isCurrent
												? color
												: colors.text
											: colors.dim,
									}}
								>
									{item.label}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</AbsoluteFill>
	);
};

// ---------------------------------------------------------------- 出口
export const Work018Overlay: React.FC<Work018OverlayProps> = (props) => {
	const zoom = useZoomAmount(props.zoomRanges);
	const shared = {...props, zoom};
	switch (props.kind) {
		case "loop":
			return <Loop />;
		case "steps":
			return <Steps {...shared} />;
		case "panel":
			return <StepPanel {...shared} />;
		case "list":
			return <List {...shared} />;
		case "contrast":
			return <Contrast {...shared} />;
		case "chain":
			return <Chain {...shared} />;
		case "branch":
			return <Branch {...shared} />;
		default:
			return <Statement {...shared} />;
	}
};

export const work018Meta = {FRAME_WIDTH, FRAME_HEIGHT, FPS};
