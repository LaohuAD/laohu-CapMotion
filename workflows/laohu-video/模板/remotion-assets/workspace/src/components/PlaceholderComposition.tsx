import React from "react";
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from "remotion";
import {laohuPresets} from "../presets/laohuPresets";

export type PlaceholderProps = {
  title: string;
  subtitle?: string;
};

export const PlaceholderComposition: React.FC<PlaceholderProps> = ({
  title,
  subtitle,
}) => {
  const frame = useCurrentFrame();
  const preset = laohuPresets.default;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: preset.colors.background,
        color: preset.colors.text,
        fontFamily: preset.fontFamily,
        padding: 96,
        justifyContent: "center",
      }}
    >
      <div
        style={{
          border: `2px solid ${preset.colors.line}`,
          borderRadius: preset.radius.panel,
          padding: 56,
          backgroundColor: preset.colors.panel,
          opacity: interpolate(frame, [0, 24], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: `0 ${interpolate(frame, [0, 24], [36, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })}px`,
        }}
      >
        <div style={{fontSize: 72, fontWeight: 800, lineHeight: 1.12}}>
          {title}
        </div>
        {subtitle ? (
          <div
            style={{
              marginTop: 24,
              fontSize: 34,
              lineHeight: 1.45,
              color: preset.colors.mutedText,
              maxWidth: 1180,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
