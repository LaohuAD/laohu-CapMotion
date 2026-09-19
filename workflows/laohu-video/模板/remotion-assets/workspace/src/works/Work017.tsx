import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
} from "remotion";
import {z} from "zod";

const FRAME_WIDTH = 1920;
const FRAME_HEIGHT = 1080;

export const work017EventSchema = z
  .object({
    id: z.string().min(1).max(32).optional(),
    frame: z.number().int().nonnegative(),
    endFrame: z.number().int().positive().optional(),
    targetFrame: z.number().int().nonnegative().optional(),
    linkFrame: z.number().int().nonnegative().optional(),
    label: z.string().min(1).max(28),
    target: z.string().max(28).optional(),
    role: z.string().max(28).optional(),
  })
  .superRefine((event, context) => {
    if (event.endFrame !== undefined && event.endFrame <= event.frame) {
      context.addIssue({
        code: "custom",
        path: ["endFrame"],
        message: "endFrame must be after frame",
      });
    }
  });

export const work017OverlaySchema = z
  .object({
    kind: z.enum(["factors", "process"]),
    durationInFrames: z.number().int().min(30),
    events: z.array(work017EventSchema).max(12),
  })
  .superRefine((props, context) => {
    props.events.forEach((event, index) => {
      if (event.frame >= props.durationInFrames) {
        context.addIssue({
          code: "custom",
          path: ["events", index, "frame"],
          message: "event frame must be inside durationInFrames",
        });
      }
      if (event.endFrame !== undefined && event.endFrame > props.durationInFrames) {
        context.addIssue({
          code: "custom",
          path: ["events", index, "endFrame"],
          message: "endFrame must fit inside durationInFrames",
        });
      }
    });
  });

export type Work017Event = z.infer<typeof work017EventSchema>;
export type Work017OverlayProps = z.infer<typeof work017OverlaySchema>;

const colors = {
  text: "#F4F8F7",
  muted: "#B8C6C5",
  panel: "rgba(8, 16, 20, 0.76)",
  panelStrong: "rgba(8, 16, 20, 0.88)",
  line: "rgba(196, 218, 216, 0.32)",
  teal: "#8FE3D1",
  violet: "#B6B2FF",
  amber: "#F5C36A",
  coral: "#F28C82",
} as const;

const fontFamily =
  '"Noto Sans CJK SC", "Source Han Sans CN VF", "PingFang SC", -apple-system, BlinkMacSystemFont, sans-serif';

const DEFAULT_FACTOR_EVENTS: Work017Event[] = [
  {
    id: "style",
    frame: 18,
    label: "视觉风格",
    target: "整体质感",
    role: "info",
  },
  {
    id: "character",
    frame: 78,
    label: "人物造型",
    target: "皮肤纹理",
    role: "info",
  },
  {
    id: "photography",
    frame: 138,
    label: "摄影呈现",
    target: "光线表现",
    role: "warning",
  },
];

const DEFAULT_PROCESS_EVENTS: Work017Event[] = [
  {
    id: "problem",
    frame: 18,
    label: "发现问题",
    target: "镜面高光",
    role: "danger",
  },
  {
    id: "cause",
    frame: 96,
    label: "理解原因",
    target: "光线表现",
    role: "info",
  },
  {
    id: "constraint",
    frame: 174,
    label: "写对应约束",
    target: "皮肤 / 光线",
    role: "success",
  },
];

export const work017DefaultProps: Work017OverlayProps = {
  kind: "factors",
  durationInFrames: 240,
  events: DEFAULT_FACTOR_EVENTS,
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const sortedEvents = (events: Work017Event[]) =>
  [...events].sort((first, second) => first.frame - second.frame);

const fillSequence = (
  events: Work017Event[],
  defaults: Work017Event[],
): Work017Event[] => {
  const ordered = sortedEvents(events);
  return defaults.map((fallback, index) => {
    const incoming = ordered[index];
    if (!incoming) return fallback;
    return {
      ...fallback,
      ...incoming,
      id: incoming.id ?? fallback.id,
      target: incoming.target ?? fallback.target,
      role: incoming.role ?? fallback.role,
    };
  });
};

const eventProgress = (
  frame: number,
  event: Work017Event,
  durationInFrames: number,
  nextFrame?: number,
) => {
  const enter = interpolate(frame, [event.frame, event.frame + 14], [0, 1], {
    easing: ease,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const endFrame = event.endFrame ?? nextFrame;
  const leave =
    endFrame === undefined
      ? 1
      : interpolate(
          frame,
          [Math.max(event.frame + 1, endFrame - 12), endFrame],
          [1, 0],
          {
            easing: ease,
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        );
  return enter * leave;
};

const exitOpacity = (frame: number, durationInFrames: number) =>
  interpolate(frame, [Math.max(0, durationInFrames - 20), durationInFrames], [1, 0], {
    easing: ease,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const latestVisibleIndex = (frame: number, events: Work017Event[]) =>
  events.reduce(
    (latest, event, index) => (event.frame <= frame ? index : latest),
    -1,
  );

const FrameScrim: React.FC = () => (
  <AbsoluteFill style={{background: "rgba(5, 12, 18, 0.96)"}} />
);

const SmallKicker: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div
    style={{
      color: colors.teal,
      fontFamily,
      fontSize: 20,
      fontWeight: 800,
      letterSpacing: "0.14em",
      lineHeight: 1,
    }}
  >
    {children}
  </div>
);

const FactorCard: React.FC<{
  event: Work017Event;
  index: number;
  progress: number;
  active: boolean;
}> = ({event, index, progress, active}) => {
  const accent = index === 2 ? colors.amber : index === 1 ? colors.violet : colors.teal;
  const position = [
    {left: 164, top: 242},
    {left: 164, top: 418},
    {left: 164, top: 594},
  ][index];
  return (
    <div
      style={{
        position: "absolute",
        ...position,
        width: 594,
        height: 112,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "18px 24px",
        borderRadius: 16,
        border: `2px solid ${active ? accent : "rgba(196,218,216,.30)"}`,
        background: active ? "rgba(19, 36, 39, .90)" : colors.panel,
        boxShadow: active ? `0 0 28px ${accent}33` : "none",
        opacity: progress,
        scale: 0.96 + progress * 0.04,
        translate: `0 ${interpolate(progress, [0, 1], [24, 0])}px`,
      }}
    >
      <div
        style={{
          display: "grid",
          placeItems: "center",
          width: 48,
          height: 48,
          flex: "0 0 auto",
          borderRadius: 999,
          color: accent,
          border: `2px solid ${accent}`,
          fontFamily,
          fontSize: 20,
          fontWeight: 800,
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </div>
      <div style={{minWidth: 0}}>
        <div
          style={{
            color: colors.text,
            fontFamily,
            fontSize: 38,
            fontWeight: 800,
            lineHeight: 1.1,
            whiteSpace: "nowrap",
          }}
        >
          {event.label}
        </div>
        <div
          style={{
            marginTop: 8,
            color: active ? accent : colors.muted,
            fontFamily,
            fontSize: 24,
            fontWeight: 600,
            lineHeight: 1.1,
            whiteSpace: "nowrap",
          }}
        >
          影响因素
        </div>
      </div>
    </div>
  );
};

const FactorOutcome: React.FC<{
  events: Work017Event[];
  progresses: number[];
  activeIndex: number;
}> = ({events, progresses, activeIndex}) => {
  const defaults = ["整体质感", "皮肤纹理", "光线表现"];
  return (
    <div
      style={{
        position: "absolute",
        left: 1132,
        top: 316,
        width: 584,
        height: 344,
        boxSizing: "border-box",
        padding: "28px 32px",
        borderRadius: 18,
        border: "2px solid rgba(143,227,209,.56)",
        background: colors.panelStrong,
        boxShadow: "0 18px 48px rgba(0,0,0,.22)",
      }}
    >
      <div
        style={{
          color: colors.text,
          fontFamily,
          fontSize: 48,
          fontWeight: 850,
          lineHeight: 1,
        }}
      >
        皮肤观感
      </div>
      <div
        style={{
          marginTop: 12,
          color: colors.muted,
          fontFamily,
          fontSize: 22,
          fontWeight: 500,
        }}
      >
        从质感、纹理和光线分别观察
      </div>
      <div style={{display: "flex", flexDirection: "column", gap: 12, marginTop: 24}}>
        {defaults.map((fallback, index) => {
          const progress = progresses[index] ?? 0;
          const active = activeIndex === index;
          const accent = index === 2 ? colors.amber : index === 1 ? colors.violet : colors.teal;
          return (
            <div
              key={`${events[index]?.id ?? fallback}-target`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                minHeight: 46,
                padding: "7px 12px",
                borderRadius: 10,
                border: `1px solid ${active ? accent : "rgba(196,218,216,.18)"}`,
                background: active ? `${accent}18` : "rgba(196,218,216,.04)",
                color: progress > 0.01 ? colors.text : colors.muted,
                fontFamily,
                fontSize: 28,
                fontWeight: active ? 800 : 600,
                opacity: progress,
                translate: `${interpolate(progress, [0, 1], [16, 0])}px 0`,
              }}
            >
              <span style={{width: 12, height: 12, borderRadius: 999, background: accent, flex: "0 0 auto"}} />
              <span>{events[index]?.target ?? fallback}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const FactorsOverlay: React.FC<{
  events: Work017Event[];
  durationInFrames: number;
}> = ({events, durationInFrames}) => {
  const frame = useCurrentFrame();
  const sequence = fillSequence(events, DEFAULT_FACTOR_EVENTS);
  const progresses = sequence.map((event) => eventProgress(frame, event, durationInFrames));
  const targets = sequence.map(event => ({...event, frame: event.targetFrame ?? event.frame + 18}));
  const targetProgresses = targets.map(event => eventProgress(frame, event, durationInFrames));
  const linkProgresses = sequence.map(event => eventProgress(frame, {...event, frame: event.linkFrame ?? event.targetFrame ?? event.frame + 10}, durationInFrames));
  const activeIndex = latestVisibleIndex(frame, sequence);
  const activeTargetIndex = latestVisibleIndex(frame, targets);
  const opacity = exitOpacity(frame, durationInFrames);
  const nodeCenters = [300, 476, 652];
  const targetCenters = [490, 558, 626];
  return (
    <AbsoluteFill
      data-work017-kind="factors"
      style={{fontFamily, color: colors.text, background: "transparent", opacity, overflow: "hidden"}}
    >
      <FrameScrim />
      <div style={{position: "absolute", left: 164, top: 132, zIndex: 2}}>
        <SmallKicker>关系 · 皮肤观感</SmallKicker>
        <div style={{marginTop: 14, fontSize: 28, fontWeight: 650, color: colors.muted}}>
          三类因素共同影响皮肤观感
        </div>
      </div>
      <svg
        viewBox={`0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}`}
        preserveAspectRatio="none"
        style={{position: "absolute", inset: 0, zIndex: 1, width: "100%", height: "100%", pointerEvents: "none"}}
        aria-hidden="true"
      >
        <defs>
          <marker id="work017-factors-arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
            <path d="M0,0 L12,6 L0,12 z" fill={colors.teal} />
          </marker>
          <marker id="work017-factors-arrow-amber" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
            <path d="M0,0 L12,6 L0,12 z" fill={colors.amber} />
          </marker>
        </defs>
        {sequence.map((event, index) => {
          const accent = index === 2 ? colors.amber : colors.teal;
          const progress = linkProgresses[index];
          return (
            <line
              key={`${event.id ?? event.label}-line`}
              x1={758}
              y1={nodeCenters[index]}
              x2={1128}
              y2={targetCenters[index]}
              stroke={accent}
              strokeWidth={index === 2 ? 5 : 4}
              strokeLinecap="round"
              markerEnd={index === 2 ? "url(#work017-factors-arrow-amber)" : "url(#work017-factors-arrow)"}
              opacity={progress * 0.92}
            />
          );
        })}
      </svg>
      <div style={{position: "absolute", inset: 0, zIndex: 2}}>
        {sequence.map((event, index) => (
          <FactorCard
            key={event.id ?? `${event.label}-${index}`}
            event={event}
            index={index}
            progress={progresses[index]}
            active={activeIndex === index}
          />
        ))}
        <FactorOutcome events={sequence} progresses={targetProgresses} activeIndex={activeTargetIndex} />
      </div>
    </AbsoluteFill>
  );
};

const ProcessCard: React.FC<{
  event: Work017Event;
  index: number;
  progress: number;
  active: boolean;
}> = ({event, index, progress, active}) => {
  const accent = [colors.coral, colors.teal, colors.amber][index];
  const position = [
    {left: 164, top: 330},
    {left: 775, top: 330},
    {left: 1386, top: 330},
  ][index];
  return (
    <div
      style={{
        position: "absolute",
        ...position,
        width: 370,
        height: 242,
        boxSizing: "border-box",
        padding: "26px 26px 24px",
        borderRadius: 18,
        border: `2px solid ${active ? accent : "rgba(196,218,216,.28)"}`,
        background: active ? "rgba(20, 33, 37, .92)" : colors.panel,
        boxShadow: active ? `0 0 30px ${accent}2e` : "none",
        opacity: progress,
        scale: 0.95 + progress * 0.05,
        translate: `0 ${interpolate(progress, [0, 1], [26, 0])}px`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          color: accent,
          fontFamily,
          fontSize: 20,
          fontWeight: 800,
          letterSpacing: "0.08em",
        }}
      >
        <span style={{width: 12, height: 12, borderRadius: 999, background: accent}} />
        步骤 {index + 1}
      </div>
      <div
        style={{
          marginTop: 22,
          color: colors.text,
          fontFamily,
          fontSize: 36,
          fontWeight: 850,
          lineHeight: 1.14,
          whiteSpace: "nowrap",
        }}
      >
        {event.label}
      </div>
      <div
        style={{
          display: "inline-flex",
          marginTop: 28,
          padding: "9px 14px",
          borderRadius: 9,
          background: `${accent}1a`,
          color: accent,
          fontFamily,
          fontSize: 25,
          fontWeight: 700,
          lineHeight: 1.1,
          whiteSpace: "nowrap",
        }}
      >
        {event.target ?? "本例标签"}
      </div>
    </div>
  );
};

const ProcessOverlay: React.FC<{
  events: Work017Event[];
  durationInFrames: number;
}> = ({events, durationInFrames}) => {
  const frame = useCurrentFrame();
  const sequence = fillSequence(events, DEFAULT_PROCESS_EVENTS);
  const progresses = sequence.map((event) => eventProgress(frame, event, durationInFrames));
  const activeIndex = latestVisibleIndex(frame, sequence);
  const opacity = exitOpacity(frame, durationInFrames);
  return (
    <AbsoluteFill
      data-work017-kind="process"
      style={{fontFamily, color: colors.text, background: "transparent", opacity, overflow: "hidden"}}
    >
      <FrameScrim />
      <div style={{position: "absolute", left: 164, top: 132, zIndex: 2}}>
        <SmallKicker>方法 · 从现象到约束</SmallKicker>
        <div style={{marginTop: 14, fontSize: 28, fontWeight: 650, color: colors.muted}}>
          先解释，再写能改变结果的描述
        </div>
      </div>
      <svg
        viewBox={`0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}`}
        preserveAspectRatio="none"
        style={{position: "absolute", inset: 0, zIndex: 1, width: "100%", height: "100%", pointerEvents: "none"}}
        aria-hidden="true"
      >
        <defs>
          <marker id="work017-process-arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
            <path d="M0,0 L12,6 L0,12 z" fill={colors.teal} />
          </marker>
        </defs>
        <line
          x1={540}
          y1={451}
          x2={765}
          y2={451}
          stroke={colors.teal}
          strokeWidth={5}
          strokeLinecap="round"
          markerEnd="url(#work017-process-arrow)"
          opacity={Math.min(progresses[0], progresses[1]) * 0.95}
        />
        <line
          x1={1150}
          y1={451}
          x2={1376}
          y2={451}
          stroke={colors.teal}
          strokeWidth={5}
          strokeLinecap="round"
          markerEnd="url(#work017-process-arrow)"
          opacity={Math.min(progresses[1], progresses[2]) * 0.95}
        />
      </svg>
      <div style={{position: "absolute", inset: 0, zIndex: 2}}>
        {sequence.map((event, index) => (
          <ProcessCard
            key={event.id ?? `${event.label}-${index}`}
            event={event}
            index={index}
            progress={progresses[index]}
            active={activeIndex === index}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const Work017Overlay: React.FC<Work017OverlayProps> = (props) => {
  if (props.kind === "factors") {
    return <FactorsOverlay events={props.events} durationInFrames={props.durationInFrames} />;
  }
  if (props.kind === "process") {
    return <ProcessOverlay events={props.events} durationInFrames={props.durationInFrames} />;
  }
  throw new Error("Local highlights use the native Cap track, not this composition");
};
