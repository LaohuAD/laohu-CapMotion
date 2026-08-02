---
name: jianying-srt-bridge
description: Use Jianying Pro (剪映专业版) as a black-box ASR engine to recognize speech in a local video or audio file and export a validated SRT file. Use when the user asks Codex to call 剪映识别字幕、智能字幕、语音转文字、生成剪映 SRT, especially when no new ASR engine should be installed.
---

# Jianying SRT Bridge

Use the installed Jianying Pro application through the `computer-use` skill. Do not copy its model files or reverse-engineer its private recognition service.

## Installation discovery

- Common macOS app path: `/Applications/VideoFusion-macOS.app`
- Common bundle ID: `com.lemon.lvpro`
- User-facing name: `剪映专业版`
- Detect the installed path and version at runtime; do not assume a specific version is present.
- Jianying contains its own local ASR supplies and `libspeechsdk.dylib`, but exposes no supported CLI or public API for external agents.
- Some recent Jianying versions encrypt timeline `draft_info.json`; do not promise direct subtitle extraction from the draft file.

## Required input and output

Require one local video or audio path. Default the SRT output to the media directory with the same basename unless the user gives an output path or the media belongs to a numbered project.

Always preserve the raw Jianying SRT. Treat text correction, sentence restructuring, edited-timeline remapping, and subtitle burn-in as separate tasks.

Before using Jianying UI, check whether a matching source SRT and final-cut EDL already exist. If they do, remap those files directly and do not operate Jianying. UI automation requires the user's current explicit permission; an older request to use Jianying does not override a newer file-only instruction.

## Workflow

1. Verify the source exists and inspect duration with `ffprobe`.
2. Read the installed app version with `plutil`; confirm the app and Jianying ASR supplies exist. Do not install another ASR engine.
3. Invoke the `computer-use` skill and operate `com.lemon.lvpro`.
4. Never alter the user's currently open draft. Return to the home screen and create a scratch draft named `__Agent_ASR_<basename>_<timestamp>`.
5. Import the source once, add it to a new timeline, open the subtitle/caption tool, choose intelligent caption recognition, select the source/original audio and the correct spoken language, then start recognition.
6. Wait for recognition to finish. Do not treat a partial subtitle track as complete.
7. Use Jianying's subtitle export flow to export `.srt`. Do not export or render a video unless the user also requested one.
8. Run `node scripts/validate-srt.mjs <srt> <media>` from this skill folder.
9. If validation passes, report the SRT path, cue count, covered time range, and any overlap warnings.
10. Remove temporary imported copies and the scratch draft after validation. Only delete a draft whose name starts with `__Agent_ASR_`; never delete or modify an existing user draft.

## UI safety

- Re-read the app state after every important click. Do not reuse stale element indexes.
- Prefer accessibility element indexes. If Jianying does not expose an element, use the fresh screenshot and coordinates.
- If a login, paid feature, permission request, or unexpected upload appears, stop before accepting it and explain what is blocking the workflow.
- Recognition may use Jianying's local or online implementation according to the app's own setting. Do not claim the audio stayed local unless that is explicitly shown.
- Do not invoke Jianying's internal `SpeechSDK_*` symbols from project code. That private ABI has no bundled headers, stable contract, or external-use guarantee.

## Validation and failure handling

The final SRT must be UTF-8, contain positive-duration cues, use monotonic timestamps, and not exceed the source duration by more than 1 second.

If SRT validation fails, keep the exported file, report the exact errors, and retry export once. Do not silently repair recognition timestamps before preserving the raw result.

If UI automation cannot complete recognition, state the blocked UI step precisely. Do not substitute Whisper, faster-whisper, or another ASR engine without the user's approval.

## Handoff to editing

For a rough cut, keep this raw SRT as the immutable ASR source and derive an edited SRT from the EDL. Never apply the raw source timeline directly to a shortened or reordered video.

For final captions, create a second corrected SRT after terminology correction, context review, punctuation cleanup, line breaking, and low-confidence review.
