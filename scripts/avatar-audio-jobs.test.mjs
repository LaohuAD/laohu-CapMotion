import assert from "node:assert/strict";
import {test} from "node:test";

import {prepareAvatarAudioJobs} from "./avatar-audio-jobs.mjs";
import {freezePostproductionPackage} from "./postproduction-package.mjs";

const handoff = () => ({
  schema: "laohu.video-postproduction-handoff/1",
  videoId: "lesson-1",
  phase: "SECOND_PASS_POSTPRODUCTION",
  intent: {
    audience: "学习两遍录制法的创作者",
    promise: "看懂两遍录制如何形成可返工成片",
    mainLine: "从原始表达进入冻结成片 再由数字人承接关键段落",
    primaryWin: "数字人不破坏真实口播与语义连续性",
    visualStrategy: "数字人只承担需要人物在场的承接段",
  },
  knowledgeActivations: [{
    asset: ".agents/skills/runninghub-avatar/SKILL.md",
    trigger: "存在超过40秒的数字人段落",
    judgment: "必须在自然语义边界切分",
    changedDecision: "否决按固定秒数机械切段",
    resultLocation: "tasks[0].semanticBoundaries",
    unusedBoundary: "短于40秒的段落不拆分",
  }],
  thread: {ownership: "DEDICATED_VIDEO_TASK", upstreamCreatesOnce: true},
  capProject: {path: "/media/lesson.cap", expectedRevision: 9},
  sources: {
    secondPassAsr: "/records/asr.json",
    productionScript: "/records/script.json",
    finalMainAudio: "/media/final-main.wav",
  },
  protection: {preserveBaseRecording: true, preserveFinalMainAudio: true, mediaOutsideRepository: true},
  edit: {edlPath: "/records/final.edl.json", sourceToFinalMapPath: "/records/map.json"},
  tasks: [{
    id: "avatar-1",
    type: "AVATAR",
    finalRange: {start: 90, end: 145},
    narrative: {
      purpose: "TRANSITION",
      viewerBefore: "观众刚看完操作过程",
      viewerAfter: "观众回到讲述者并进入下一章",
      whyThisMedium: "人物在场比纯动画更适合承接章节",
      handoffIn: "承接操作结果",
      handoffOut: "交给下一章的问题",
    },
    semanticBoundaries: [120],
    audio: {source: "FINAL_MAIN_AUDIO", mapRef: "/records/map.json"},
    continuity: {group: "g1", order: 1},
  }],
});

test("exports avatar audio only from the frozen final main audio and records traceable hashes", async () => {
  const frozen = freezePostproductionPackage(handoff(), {edlContent: "edl", mappingContent: "map"});
  const commands = [];
  const writes = [];
  const manifest = await prepareAvatarAudioJobs(frozen, {
    outputDir: "/tmp/lesson-avatar-audio",
    ffmpegBin: "ffmpeg",
    readText: async (path) => path.endsWith("final.edl.json") ? "edl" : "map",
    readBytes: async (path) => new TextEncoder().encode(path.includes("final-main") ? "source-audio" : `clip:${path}`),
    makeDirectory: async () => {},
    runCommand: async (command, args) => commands.push({command, args}),
    probeDuration: async (path) => path.includes("part-1") ? 30 : 25,
    writeManifest: async (path, content) => writes.push({path, content}),
  });

  assert.deepEqual(manifest.jobs.map((job) => [job.start, job.end]), [[90, 120], [120, 145]]);
  assert(commands.every(({command}) => command === "ffmpeg"));
  assert(commands.every(({args}) => args[args.indexOf("-i") + 1] === "/media/final-main.wav"));
  assert(manifest.jobs.every((job) => job.duration <= 40 && job.source === "FINAL_MAIN_AUDIO"));
  assert.match(manifest.sourceAudioSha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.mappingSha256, frozen.freeze.mappingSha256);
  assert.equal(writes.length, 1);
});

test("refuses a clipped avatar audio export whose actual duration does not match T2", async () => {
  const frozen = freezePostproductionPackage(handoff(), {edlContent: "edl", mappingContent: "map"});
  await assert.rejects(prepareAvatarAudioJobs(frozen, {
    outputDir: "/tmp/lesson-avatar-audio",
    ffmpegBin: "ffmpeg",
    readText: async (path) => path.endsWith("final.edl.json") ? "edl" : "map",
    readBytes: async (path) => new TextEncoder().encode(path),
    makeDirectory: async () => {},
    runCommand: async () => {},
    probeDuration: async () => 10,
    writeManifest: async () => {},
  }), /AVATAR_AUDIO_DURATION_MISMATCH/);
});

test("refuses audio export when the frozen mapping changed", async () => {
  const frozen = freezePostproductionPackage(handoff(), {edlContent: "edl", mappingContent: "map"});
  await assert.rejects(
    prepareAvatarAudioJobs(frozen, {
      outputDir: "/tmp/lesson-avatar-audio",
      readText: async () => "changed",
      readBytes: async () => new Uint8Array(),
      makeDirectory: async () => {},
      runCommand: async () => {},
      writeManifest: async () => {},
    }),
    /FROZEN_MAPPING_STALE/,
  );
});
