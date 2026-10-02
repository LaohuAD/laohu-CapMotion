import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { z } from "zod";

// source-converge · 多源汇聚（原卡：video-talkcraft/template/cards/source-converge.tsx）
//
// 蒙皮版：结构与绘制方式照搬原卡（含 CSS 类与 SVG 呈现），只改皮层与宿主参数。
//   · 舞台：原卡白底 → 本片透明底 + 可选深色压暗（叠在录屏上，不透明全幅会盖掉底画）
//   · 配色：按原卡「深底舞台」条款——曲线换 rgba(255,255,255,.2)、来源胶囊换深 tile
//     （#272729 + hairline 描边）、汇聚胶囊换本片强调色 #8FE3D1
//   · 画幅：viewBox 仍为 960×540，绘制面铺满 1920×1080，
//     等价于原卡要求的「线 2→4px、胶囊 128×44→256×88、文字 20→40 / 22→44」
//   · 时长与触发：原卡 6.2s 编排原样保留；句长变化只调 exitAt / end，
//     并把 convAt 对到口播讲「汇到一起」的时刻（原卡复用指引）
//
// 命门（原卡四条，逐条保留）：
//   ① 节点沿真实曲线走（弧长表反查），不是两点直线插值
//   ② 三段式缩小、拐点在 75%——前 3/4 慢慢瘦身、最后 1/4 掉光，「被吸进去」的那一下
//   ③ 擦除在节点全部消失之后，且从起点方向退走（读作「通路收回」）
//   ④ 汇聚完成后结果居中并真静止 ≥1.2s

export const sourceConvergeSchema = z.object({
	durationInFrames: z.number().int().min(30),
	/** 版面标题（不是旁白字幕） */
	title: z.string(),
	/** 来源名（每项一个胶囊；4 条是甜点，>6 条曲线几乎重合） */
	sources: z.array(z.string()).min(2).max(6),
	/** 汇聚胶囊文案 */
	hub: z.string(),
	/** 汇聚完成后的说明行 */
	caption: z.string().optional(),
	/** 汇入起点（秒，卡内相对）。对到口播讲「汇到一起」的时刻 */
	convAt: z.number().min(0).optional(),
	/** 压暗强度，0 = 不加压暗 */
	scrim: z.number().min(0).max(1).optional(),
});

export type SourceConvergeProps = z.infer<typeof sourceConvergeSchema>;

export const sourceConvergeDefaultProps: SourceConvergeProps = {
	durationInFrames: 340,
	title: "人人都会用 AI 之后",
	sources: ["人人都会用 AI", "信息差越来越小", "都能完成工作创作"],
	hub: "优势在哪",
	caption: "问题回到自己身上",
	convAt: 6.69,
	scrim: 0.82,
};

export const SourceConvergeDefaultProps = sourceConvergeDefaultProps;

const FPS = 30;

// ——————————————————————————————————————————————————————————
// 可摘走的核心参数（与 demo 的 CONFIG 同名同注释）
// 命门：① 节点沿真实曲线走（不是两点插值）；② 三段式缩小——前 75% 慢慢瘦身、后 25% 掉光，拐点越靠后吞并越突然；
//      ③ 擦除必须在节点全部消失之后，且从起点方向退走（读作"通路收回"）；④ 汇聚完成后结果滑到画面正中再静置 ≥1.2s（2026-09-05 用户要求）。
// ——————————————————————————————————————————————————————————
const CONFIG = {
  srcX: 200,                       // 来源胶囊中心 x = 曲线起点
  srcYs: [170, 230, 310, 390],     // 四路 y（曲率天然不同；>6 条中间几条几乎重合）
  hubX: 700, hubY: 290,            // 汇聚点 = 曲线终点
  ctrl: [380, 520],                // 三次贝塞尔两个控制点 x：c1 = (380, y)、c2 = (520, hubY)
  titleIn: 0.1,                    // 标题入场 s（0.4s power3.out）
  nodeIn: 0.3, nodeStagger: 0.08,  // 来源胶囊淡入（0.3s）
  drawAt: 0.5, drawStagger: 0.15, drawDur: 0.5,   // 逐路接通（power2.out）；错峰归零读作四条线一起刷出
  hubIn: 0.8,                      // 汇聚胶囊入场 s（0.4s power3.out，scale .7→1）
  pkFrom: 0.9, pkTo: 3.0,          // 数据包滑行窗：走两个整周期（否则末帧包停在半路）
  pkPhase: 0.13,                   // 各路相位偏移（0 会看到四个包整齐并进）
  convAt: 1.5, convDur: 1.5,       // 沿曲线汇入（power2.inOut：缓起是"启动"、缓收是"到位"）
  shrinkKnee: 0.75,                // 三段式缩小拐点：前 75% 1→.34，后 25% →0
  pulseAt: 2.85,                   // 吞并脉冲：+12% back.out(2) 0.25s，再 0.25s 回落
  eraseAt: 3.25, eraseDur: 0.4,    // 曲线从起点方向擦除（power2.out）
  capIn: 3.5,                      // 说明行浮出（0.4s）
  centerAt: 3.8, centerDur: 0.6,   // 结果居中：hubX → 480（power2.inOut），之后真静止
  exitAt: 5.8,                     // 标题 / 胶囊 / 说明行同收（0.4s power2.in）
  end: 6.2,                        // 镜头结束
};

/* 时间表（demo 秒）
   0.10–0.50  标题入场
   0.30–0.84  四个来源胶囊淡入（错峰 0.08）
   0.50–1.45  四条曲线逐路 draw-on（错峰 0.15，各 0.5s power2.out）
   0.80–1.20  汇聚胶囊入场（scale .7→1）
   0.90–3.00  数据包沿线滑行两个整周期（线性；0.9 起 0.3s 显、2.8 起 0.2s 隐）
   1.50–3.00  节点沿曲线汇入（power2.inOut），前 75% 尺寸 1→.34、后 25% →0
   2.85–3.35  汇聚胶囊脉冲 1→1.12→1
   3.25–3.65  曲线从起点方向擦除
   3.50–3.90  说明行浮出
   3.80–4.40  胶囊 + 说明行滑到 x=480 居中（power2.inOut），之后静止
   5.80–6.20  标题 / 胶囊 / 说明行同收（power2.in） */

// —— 缓动与 tween helper（对照 GSAP 名字）——
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const tw = (t: number, t0: number, d: number, ease: (x: number) => number) => ease(clamp01((t - t0) / d));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const linear = (x: number) => x;
const power1Out = (x: number) => 1 - Math.pow(1 - x, 2);
const power2Out = (x: number) => 1 - Math.pow(1 - x, 3);
const power3Out = (x: number) => 1 - Math.pow(1 - x, 4);
const power2In = (x: number) => x * x * x;
const power2InOut = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - Math.pow(-2 * x + 2, 3) / 2);
const backOut = (s = 1.70158) => (x: number) => { const u = x - 1; return 1 + (s + 1) * u * u * u + s * u * u; };

// —— 三次贝塞尔的沿线取点（getPointAtLength 的纯函数版：采样 200 段建弧长表再按长度反查，渲染确定）——
type Pt = { x: number; y: number };
type Curve = { d: string; len: number; at: (L: number) => Pt };
const cubic = (p0: number, p1: number, p2: number, p3: number, u: number) => { const v = 1 - u; return v * v * v * p0 + 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u * p3; };
function buildCurve(P: [Pt, Pt, Pt, Pt], N = 200): Curve {
  const pts: Pt[] = [], cum: number[] = [0];
  for (let k = 0; k <= N; k++) { const u = k / N; pts.push({ x: cubic(P[0].x, P[1].x, P[2].x, P[3].x, u), y: cubic(P[0].y, P[1].y, P[2].y, P[3].y, u) }); if (k) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y)); }
  const len = cum[N];
  const at = (L: number): Pt => {
    const q = Math.max(0, Math.min(len, L));
    let lo = 0, hi = N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= q) lo = mid; else hi = mid; }
    const seg = cum[hi] - cum[lo] || 1, f = (q - cum[lo]) / seg;
    return { x: lerp(pts[lo].x, pts[hi].x, f), y: lerp(pts[lo].y, pts[hi].y, f) };
  };
  return { d: `M ${P[0].x},${P[0].y} C ${P[1].x},${P[1].y} ${P[2].x},${P[2].y} ${P[3].x},${P[3].y}`, len, at };
}
// 胶囊宽度随文案自适应——固定 128 宽装不下 7 个以上汉字，文字会溢出圆角外。
// 汉字按字号计宽、拉丁与数字按约 0.55 倍计宽，两侧各留 20 内边距。
const capsuleWidth = (text: string, fontSize = 20) => {
  let w = 0;
  for (const ch of text) w += /[\u4e00-\u9fff\uff00-\uffef]/.test(ch) ? fontSize : fontSize * 0.55;
  return Math.max(128, Math.ceil(w) + 40);
};

// n 路的 y：4 路用 CONFIG.srcYs；其他数量在 170~390 之间等分
const ysFor = (n: number) => (n === CONFIG.srcYs.length ? CONFIG.srcYs : n <= 1 ? [CONFIG.hubY] : Array.from({ length: n }, (_, i) => 170 + (i * 220) / (n - 1)));

// —— 蒙皮后的样式（几何数值与原卡逐条一致，只换颜色与绘制面尺寸）——
const CSS = `
.scv-ttl { position: absolute; left: 160px; top: 120px; font-size: 52px; font-weight: 700; color: #F4F8F7; }
.scv-svg { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; }
.scv-path { fill: none; stroke: rgba(255,255,255,0.62); stroke-width: 2.5; }
.scv-node rect { fill: #0C1417; stroke: rgba(255,255,255,0.34); stroke-width: 1.5; }
.scv-node text { font-size: 20px; font-weight: 500; fill: #FFFFFF; text-anchor: middle; }
.scv-pk { fill: #8FE3D1; }
.scv-hub rect { fill: #8FE3D1; }
.scv-hub text { font-size: 22px; font-weight: 700; fill: #04100E; text-anchor: middle; }
.scv-cap { font-size: 22px; font-weight: 500; fill: #DCE9E7; text-anchor: middle; }
.scv-scrim { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; background: #05090B; }
`;

/** 演示语境（不属于动效）：样式照搬 demo（类名加 scv- 前缀） */
export const SourceConverge: React.FC<SourceConvergeProps> = ({ title, sources, hub, caption, convAt, scrim = 0, durationInFrames }) => {
  const t = useCurrentFrame() / FPS;
  // 时长变化只动 exitAt / end（原卡复用指引），编排其余部分不动
  const total = durationInFrames / FPS;
  const exitAt = Math.max(CONFIG.centerAt + CONFIG.centerDur + 1.2, total - 0.4);
  const end = total;
  // 汇入起点对到口播讲「汇到一起」的时刻
  const convStart = convAt ?? CONFIG.convAt;
  const shift = convStart - CONFIG.convAt;
  // 汇入之前的长等待交给数据包继续滑行，避免中段空场
  const pkTo = Math.max(CONFIG.pkTo, convStart + CONFIG.convDur - 0.2);

  const hw = Math.max(152, capsuleWidth(hub, 22) + 24);
  const ys = ysFor(sources.length);
  const curves = ys.map((y) => buildCurve([{ x: CONFIG.srcX, y }, { x: CONFIG.ctrl[0], y }, { x: CONFIG.ctrl[1], y: CONFIG.hubY }, { x: CONFIG.hubX, y: CONFIG.hubY }]));

  // 进度量
  const conv = tw(t, convStart, CONFIG.convDur, power2InOut);
  const pk = tw(t, CONFIG.pkFrom, pkTo - CONFIG.pkFrom, linear);
  const pkOn = tw(t, CONFIG.pkFrom, 0.3, power1Out) - tw(t, pkTo - 0.2, 0.2, power1Out);
  const erase = tw(t, CONFIG.eraseAt + shift, CONFIG.eraseDur, power2Out);
  const size = Math.max(0, conv < CONFIG.shrinkKnee ? lerp(1, 0.34, conv / CONFIG.shrinkKnee) : lerp(0.34, 0, (conv - CONFIG.shrinkKnee) / (1 - CONFIG.shrinkKnee)));
  // 汇聚胶囊：入场 .7→1，吞并脉冲 1→1.12→1
  const hubIn = tw(t, CONFIG.hubIn, 0.4, power3Out);
  let hs = lerp(0.7, 1, hubIn);
  const pulseAt = CONFIG.pulseAt + shift;
  if (t >= pulseAt) hs = t < pulseAt + 0.25 ? lerp(1, 1.12, tw(t, pulseAt, 0.25, backOut(2))) : lerp(1.12, 1, tw(t, pulseAt + 0.25, 0.25, power2Out));
  const cx = lerp(CONFIG.hubX, 480, tw(t, CONFIG.centerAt + shift, CONFIG.centerDur, power2InOut));   // 结果居中
  const ttlIn = tw(t, CONFIG.titleIn, 0.4, power3Out);
  const capIn = tw(t, CONFIG.capIn + shift, 0.4, power1Out);
  const exitK = 1 - tw(t, exitAt, Math.max(0.05, end - exitAt), power2In);

  return (
    <AbsoluteFill style={{ overflow: "hidden", fontFamily: '"Noto Sans CJK SC", "Source Han Sans CN VF", "PingFang SC", sans-serif' }}>
      <style>{CSS}</style>
      {/* 压暗只压动画自己所在的那块画面，并随整卡同收 */}
      {scrim > 0 ? <div className="scv-scrim" style={{ opacity: scrim * exitK }} /> : null}
      <div className="scv-ttl" style={{ opacity: ttlIn * exitK, transform: `translateY(${lerp(20, 0, ttlIn)}px)` }}>{title}</div>
      <svg className="scv-svg" viewBox="0 0 960 540">
        {/* 曲线：draw-on 从起点长出，擦除从起点退走 */}
        {curves.map((c, i) => {
          const draw = tw(t, CONFIG.drawAt + i * CONFIG.drawStagger, CONFIG.drawDur, power2Out);
          return <path key={`p${i}`} className="scv-path" d={c.d} style={{ strokeDasharray: c.len, strokeDashoffset: c.len * (1 - draw) - erase * c.len }} />;
        })}
        {/* 数据包：两个整周期 + 相位偏移，中段最亮 */}
        {curves.map((c, i) => {
          const cyc = (pk * 2 + i * CONFIG.pkPhase) % 1; const p = c.at(cyc * c.len);
          return <circle key={`k${i}`} className="scv-pk" r={5} cx={p.x} cy={p.y} opacity={pkOn * (1 - Math.abs(cyc - 0.5) * 0.6)} />;
        })}
        {/* 来源胶囊：沿真实曲线滑向汇聚点，三段式缩小 */}
        {curves.map((c, i) => {
          const p = c.at(conv * c.len); const nodeIn = tw(t, CONFIG.nodeIn + i * CONFIG.nodeStagger, 0.3, power1Out);
          const w = capsuleWidth(sources[i]);
          return (
            <g key={`n${i}`} className="scv-node" transform={`translate(${p.x} ${p.y}) scale(${size})`} opacity={nodeIn}>
              <rect x={-w / 2} y={-22} width={w} height={44} rx={22} /><text y={7}>{sources[i]}</text>
            </g>
          );
        })}
        {/* 汇聚胶囊 + 说明行（擦线后一起滑到 x=480） */}
        <g className="scv-hub" transform={`translate(${cx} ${CONFIG.hubY}) scale(${hs})`} opacity={hubIn * exitK}>
          <rect x={-hw / 2} y={-30} width={hw} height={60} rx={30} /><text y={8}>{hub}</text>
        </g>
        {caption ? <text className="scv-cap" x={cx} y={372} opacity={capIn * exitK}>{caption}</text> : null}
      </svg>
    </AbsoluteFill>
  );
};
