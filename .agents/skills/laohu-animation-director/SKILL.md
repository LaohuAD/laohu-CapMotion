---
name: laohu-animation-director
description: Use when choosing, configuring, or reviewing Remotion or HyperFrames animation components for a spoken-video ASR/SRT time range, especially when the requested animation is vague, explanatory content must be supplemented, or an existing component may need upgrading.
---

# 老胡动画导演

## Required Context

Read `README.md`, `规范/组件设计方法论.md`, and `规范/组件规则.md`. If the user's workspace has its own `AGENTS.md` or control document, read it as an additional local policy. Read only the selected component specs from `模板/components/`.

For Remotion implementation, **REQUIRED SUB-SKILL:** Use the official `remotion-best-practices`; also load `remotion-markup`, `remotion-interactivity`, or `remotion-render` when relevant. These upstream skills are not vendored in this repository.

## Analyze

1. Locate the ASR/SRT, requested time range, full section, nearby context, control document, and source materials.
2. Create 3-7 narrative beats: introduction, build, relationship change, resolution, readable hold.
3. Tag every on-screen statement as `asr`, `context`, `source-doc`, `editorial`, or `illustrative`. Require `ref` for `source-doc`. Never present unsourced facts or numbers as confirmed.
4. Classify the segment:

```text
communicationGoal
emotionalTone
informationShape
motionIntensity
```

## Recommend

Select candidates from `规范/组件规则.md` in this order: information-shape fit, communication goal, duration/capacity, emotional tone, maturity.

If the user named a compatible component, or one candidate clearly dominates, proceed to configuration. Otherwise return one primary recommendation and up to two alternatives:

```text
口播核心意图：
画面需要补充：
主推荐：
展示结果：
观众感受：
适配理由：
需要的输入：
风险：
备选：
```

Do not recommend a component merely because it is recent or visually impressive.

## Configure And Render

Generate a `ComponentConfig` matching the Zod schema under `模板/remotion-assets/workspace/src/schemas/`. Keep absolute ASR time in `sourceTimeRange`; drive component animation with relative frames.

Choose `standalone`, `asset`, or `both`. Remotion does not require HyperFrames. When combining engines, assign Remotion one explicit replacement region; never overlay duplicate explanations.

Keep visual components muted by default. Enable an audio track only when the requested standalone deliverable explicitly includes voiceover or source audio.

Validate with `npm run typecheck`, `npm test`, and Remotion composition/render commands. Capture introduction, build, resolution, and final-hold frames. Inspect full 1920x1080 frames and 390x219 thumbnails for missing content, empty regions, overlap, bad Chinese wrapping, misleading charts, and unreadable hierarchy.

## Handle Gaps

When no schema fits, state the current best component, missing capability, audience benefit, compatibility risk, and recommend one of: current-work adaptation, optional schema upgrade, new component, or rejection. Update code, spec, registry, examples, and tests only after the upgrade decision is accepted.
