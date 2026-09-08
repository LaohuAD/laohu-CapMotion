import assert from "node:assert/strict";
import {test} from "node:test";

import {
  buildOverlayCommandPlan,
  executeOverlayCommandPlan,
  expandAvatarTasks,
  freezePostproductionPackage,
  verifyFrozenPackageFiles,
  validatePostproductionPackage,
} from "./postproduction-package.mjs";

const narrative = (overrides = {}) => ({
  purpose: "UNDERSTAND",
  viewerBefore: "观众只听见结论 还看不见关系",
  viewerAfter: "观众能复述关系并知道下一步",
  whyThisMedium: "当前画面形式能提供口播缺少的关系或证据",
  handoffIn: "承接上一段提出的问题",
  handoffOut: "把明确结果交给下一段",
  ...overrides,
});

const knowledgeVisual = (overrides = {}) => ({
  contractId: "kvc-001",
  segmentId: "remotion-001",
  spokenClaim: "第一遍用来发现内容 第二遍才决定成片",
  viewerBefore: "观众以为两遍录制是重复劳动",
  viewerAfter: "观众能分清内容发现与成片时间的职责",
  knowledgeType: "COMPARE",
  entities: ["第一遍录制", "第二遍录制", "最终成片"],
  initialState: "两条时间轴并列 还没有职责差异",
  interaction: "第一遍输出脚本 第二遍通过冻结映射进入成片",
  stateChanges: ["第一遍转为脚本材料", "第二遍连接最终成片"],
  resultState: "只有第二遍与最终成片保持时间映射",
  viewerInference: "两遍录制服务不同阶段 不是做同一件事",
  semanticAnchors: [
    {spokenCue: "第一遍", visualEvent: "左侧时间轴转成脚本卡"},
    {spokenCue: "第二遍", visualEvent: "右侧时间轴连接最终成片"},
  ],
  labelPlan: [
    {text: "发现内容", target: "第一遍录制", responsibility: "身份"},
    {text: "决定成片", target: "第二遍录制", responsibility: "结果"},
  ],
  cameraPurpose: "固定视窗让两条时间轴的分流与汇合同时可读",
  carrierDecision: "REMOTION_OVERLAY",
  silentTest: "关闭口播后仍能看出两遍录制的职责差异",
  audioSyncTest: "两个时间轴变化分别只在口播说到对应语义时触发",
  ...overrides,
});

const overlayContinuity = (overrides = {}) => ({
  groupId: "chapter-two-pass",
  order: 1,
  role: "EXPLANATION",
  hostCarrier: "BASE",
  persistence: "SEGMENT",
  stateBefore: "两遍录制还没有被区分",
  stateUpdate: "第一遍与第二遍分别获得职责",
  stateAfter: "两遍录制的职责已经区分",
  contrastMode: "NONE",
  contrastReason: "底画本身足够暗，亮色文字与关系线已经达到可读对比",
  attentionPlan: [{
    spokenCue: "第一遍",
    focusOwner: "OVERLAY",
    target: "第一遍职责标签",
    reason: "此刻必须先认清第一遍负责发现内容",
  }],
  protectedRegions: [{target: "SUBTITLES", description: "底部双语字幕安全区"}],
  handoff: "职责对比收束后把视线交给第二遍成片映射",
  ...overrides,
});

const aiHostCompatibility = (overrides = {}) => ({
  visualAnchor: "沿输入轨道进入处理装置并停在结果仓的知识路径",
  stableNegativeSpace: "结果停稳后左上角保持低运动暗区，可承接章节进度",
  luminanceProfile: "起始暗、穿越过程明暗快速变化、结果停点恢复暗背景",
  motionLoad: "穿越过程高，结果停点低",
  forbiddenOverlayWindows: ["摄影机高速穿过处理装置时禁止新增解释层"],
  attentionHandoff: "结果装置锁定后，第一焦点交给结论叠层",
  actualPixelReview: "PENDING",
  ...overrides,
});

const basePackage = () => ({
  schema: "laohu.video-postproduction-handoff/1",
  videoId: "video-001",
  phase: "SECOND_PASS_POSTPRODUCTION",
  intent: {
    audience: "想把自由口述做成教学视频的创作者",
    promise: "看懂两遍录制怎样形成可返工成片",
    mainLine: "第一遍发现内容 第二遍建立成片 后期只在冻结时间轴上补充证据",
    primaryWin: "让观众真正理解两遍录制不是重复劳动",
    visualStrategy: "只在关系、操作和证据仅靠口播不够时切换主画面",
  },
  knowledgeActivations: [
    {
      asset: "workflows/laohu-video/规范/画面表达规则.md",
      trigger: "需要判断时间轴关系是否值得动画化",
      judgment: "画面应显出分流与汇合 而不是复述两句口播",
      changedDecision: "否决两张大字卡 改用双时间轴关系动画",
      resultLocation: "tasks[0].annotation",
      unusedBoundary: "没有采用与本段无关的背景氛围效果",
    },
  ],
  thread: {ownership: "DEDICATED_VIDEO_TASK", upstreamCreatesOnce: true},
  capProject: {
    sourcePath: "/media/second-original.cap",
    path: "/media/second-edited.cap",
    expectedRevision: 7,
    nonDestructiveCopy: true,
  },
  sources: {
    secondPassAsr: "/records/second-pass/cap-asr.raw.json",
    productionScript: "/records/production-script.json",
    finalMainAudio: "/media/final-main-audio.wav",
  },
  protection: {
    preserveBaseRecording: true,
    preserveFinalMainAudio: true,
    mediaOutsideRepository: true,
  },
  edit: {
    edlPath: "/records/final.edl.json",
    sourceToFinalMapPath: "/records/source-to-final.json",
    captionTracks: {
      sourceMasterPath: "/records/source-captions.json",
      displayTracksPath: "/records/final-bilingual-cap-tracks.json",
      mode: "SEPARATE_BILINGUAL",
      tracks: ["zh-CN", "en"],
    },
    preEditReview: {
      documentPath: "/records/full-pre-edit-review.md",
      fullTimelineCovered: true,
      segmentBoundariesIncluded: true,
      virtualRoughCutComplete: true,
      virtualFineCutComplete: true,
      provisionalFinalTimelineIncluded: true,
      crossCueSemanticReviewComplete: true,
      atomicTermsPreserved: true,
      uncertaintiesResolved: true,
      userApproval: {status: "APPROVED", reference: "user-confirmed-review-turn"},
    },
  },
  tasks: [
    {
      id: "remotion-001",
      type: "REMOTION",
      finalRange: {start: 10, end: 18},
      narrative: narrative(),
      knowledgeVisual: knowledgeVisual(),
      overlayContinuity: overlayContinuity(),
      annotation: {
        object: "第一遍和第二遍时间轴",
        relationship: "第一遍只供内容重建 第二遍决定成片",
        entrance: "两条时间轴从左右进入",
        change: "第一遍淡出 第二遍汇入最终成片线",
        resolutionFrame: "只保留第二遍到成片的映射",
        materials: ["source-to-final.json"],
        acceptance: ["观众能在静音时看懂两条时间轴的职责差异"],
      },
    },
    {
      id: "avatar-001",
      type: "AVATAR",
      finalRange: {start: 30, end: 55},
      narrative: narrative({purpose: "TRANSITION", whyThisMedium: "需要人物在场承接前后章节"}),
      audio: {source: "FINAL_MAIN_AUDIO", mapRef: "source-to-final.json"},
      continuity: {group: "avatar-group-1", order: 1},
    },
  ],
});

const verifiedAsset = (frozen, asset) => ({
  ...asset,
  qa: {
    hardStatus: "PASS",
    manualStatus: "PASS",
    mappingSha256: frozen.freeze.mappingSha256,
  },
});

test("accepts a second-pass package with executable Remotion and avatar tasks", () => {
  const result = validatePostproductionPackage(basePackage());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("rejects postproduction before the full pre-edit transcript review exists", () => {
  const value = basePackage();
  delete value.edit.preEditReview;
  const result = validatePostproductionPackage(value);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.code === "PRE_EDIT_REVIEW_REQUIRED"));
});

test("rejects postproduction while pre-edit questions or user approval remain unresolved", () => {
  const value = basePackage();
  value.edit.preEditReview.uncertaintiesResolved = false;
  value.edit.preEditReview.userApproval = {status: "PENDING", reference: ""};
  const result = validatePostproductionPackage(value);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.code === "PRE_EDIT_UNCERTAINTIES_UNRESOLVED"));
  assert(result.errors.some((error) => error.code === "PRE_EDIT_REVIEW_NOT_APPROVED"));
});

test("rejects a pre-edit review that does not preview the final post-cut subtitle timeline", () => {
  const value = basePackage();
  value.edit.preEditReview.virtualFineCutComplete = false;
  value.edit.preEditReview.provisionalFinalTimelineIncluded = false;
  const result = validatePostproductionPackage(value);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.code === "PRE_EDIT_VIRTUAL_EDIT_INCOMPLETE"));
});

test("rejects a pre-edit caption plan that inherits ASR cuts or splits atomic terms", () => {
  const value = basePackage();
  value.edit.preEditReview.crossCueSemanticReviewComplete = false;
  value.edit.preEditReview.atomicTermsPreserved = false;
  const result = validatePostproductionPackage(value);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.code === "PRE_EDIT_CAPTION_REVIEW_INCOMPLETE"));
});

test("rejects first-pass ownership and vague Remotion annotations", () => {
  const value = basePackage();
  value.phase = "FIRST_PASS_CONTENT";
  value.tasks[0].annotation = {object: "做一个动画"};
  const result = validatePostproductionPackage(value);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.code === "WRONG_PHASE"));
  assert(result.errors.some((error) => error.code === "REMOTION_ANNOTATION_INCOMPLETE"));
});

test("requires every Remotion task to declare host-aware overlay continuity and contrast intent", () => {
  const value = basePackage();
  delete value.tasks[0].overlayContinuity;
  const result = validatePostproductionPackage(value);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.code === "OVERLAY_CONTINUITY_INCOMPLETE"));
});

test("accepts no scrim when the host already provides enough contrast", () => {
  const value = basePackage();
  value.tasks[0].overlayContinuity.contrastMode = "NONE";
  value.tasks[0].overlayContinuity.contrastReason = "深色真人背景与高亮白字已有足够对比，不重复压暗底画";
  const result = validatePostproductionPackage(value);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("requires a real host compatibility contract when Remotion overlays AI video", () => {
  const value = basePackage();
  value.tasks[0].overlayContinuity.hostCarrier = "AI_VIDEO_FULL";
  const missing = validatePostproductionPackage(value);
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((error) => error.code === "AI_HOST_COMPATIBILITY_INCOMPLETE"));

  value.tasks[0].overlayContinuity.hostCompatibility = aiHostCompatibility();
  const complete = validatePostproductionPackage(value);
  assert.equal(complete.ok, true, JSON.stringify(complete.errors));
});

test("rejects a persistent overlay group whose state breaks across carrier cuts", () => {
  const value = basePackage();
  value.tasks[0].overlayContinuity = overlayContinuity({
    persistence: "ACROSS_CUT",
    stateAfter: "步骤一已经完成",
  });
  value.tasks.push({
    ...structuredClone(value.tasks[0]),
    id: "remotion-002",
    finalRange: {start: 18, end: 24},
    knowledgeVisual: knowledgeVisual({contractId: "kvc-002", segmentId: "remotion-002"}),
    overlayContinuity: overlayContinuity({
      order: 2,
      hostCarrier: "AI_VIDEO_FULL",
      persistence: "ACROSS_CUT",
      stateBefore: "完全无关的新状态",
      stateAfter: "步骤二已经完成",
    }),
  });
  const result = validatePostproductionPackage(value);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.code === "OVERLAY_STATE_DISCONTINUITY"));
});

test("rejects a technically complete package without audience intent or knowledge activation", () => {
  const value = basePackage();
  delete value.intent.primaryWin;
  value.knowledgeActivations = [];
  const result = validatePostproductionPackage(value);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.code === "INTENT_INCOMPLETE"));
  assert(result.errors.some((error) => error.code === "KNOWLEDGE_ACTIVATION_REQUIRED"));
});

test("requires a complete KnowledgeVisualContract for UNDERSTAND Remotion and AI video tasks", () => {
  const remotion = basePackage();
  delete remotion.tasks[0].knowledgeVisual;
  let result = validatePostproductionPackage(remotion);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.code === "KNOWLEDGE_VISUAL_CONTRACT_INCOMPLETE"));

  const aiVideo = basePackage();
  aiVideo.tasks = [{
    id: "ai-video-001",
    type: "AI_VIDEO",
    finalRange: {start: 10, end: 18},
    narrative: narrative(),
    knowledgeVisual: knowledgeVisual({segmentId: "ai-video-001", carrierDecision: "AI_VIDEO_FULL"}),
  }];
  assert.equal(validatePostproductionPackage(aiVideo).ok, true);
  delete aiVideo.tasks[0].knowledgeVisual.stateChanges;
  result = validatePostproductionPackage(aiVideo);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.code === "KNOWLEDGE_VISUAL_CONTRACT_INCOMPLETE"));
});

test("does not force a transition-only AI video to invent a knowledge contract", () => {
  const value = basePackage();
  value.tasks = [{
    id: "ai-transition-001",
    type: "AI_VIDEO",
    finalRange: {start: 20, end: 24},
    narrative: narrative({purpose: "TRANSITION", viewerAfter: "观众进入下一章"}),
  }];
  assert.equal(validatePostproductionPackage(value).ok, true);
});

test("rejects an overlay task that has a time range but no viewer-state change", () => {
  const value = basePackage();
  delete value.tasks[1].narrative.viewerAfter;
  const result = validatePostproductionPackage(value);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.code === "TASK_NARRATIVE_INCOMPLETE"));
});

test("rejects overlapping tasks with the same overlay role but allows cross-role coverage", () => {
  const value = basePackage();
  value.tasks.push({
    ...structuredClone(value.tasks[0]),
    id: "remotion-002",
    finalRange: {start: 8, end: 14},
    knowledgeVisual: knowledgeVisual({contractId: "kvc-002", segmentId: "remotion-002"}),
  });
  const result = validatePostproductionPackage(value);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.code === "OVERLAY_ROLE_OVERLAP"));

  value.tasks[2].type = "AI_VIDEO";
  delete value.tasks[2].annotation;
  value.tasks[2].knowledgeVisual.carrierDecision = "AI_VIDEO_FULL";
  assert.equal(validatePostproductionPackage(value).ok, true);
});

test("rejects an invented narrative purpose that cannot guide medium choice", () => {
  const value = basePackage();
  value.tasks[0].narrative.purpose = "DECORATE";
  const result = validatePostproductionPackage(value);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.code === "TASK_PURPOSE_INVALID"));
});

test("rejects incomplete ownership and non-absolute handoff paths", () => {
  const value = basePackage();
  value.thread.upstreamCreatesOnce = false;
  value.sources.productionScript = "relative/production-script.json";
  value.edit.edlPath = "relative/final.edl.json";
  const result = validatePostproductionPackage(value);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.code === "THREAD_HANDOFF_INVALID"));
  assert(result.errors.some((error) => error.code === "SOURCE_PATH_NOT_ABSOLUTE"));
  assert(result.errors.some((error) => error.code === "EDIT_PATH_NOT_ABSOLUTE"));
});

test("requires a non-destructive Cap copy and separate linked bilingual caption tracks", () => {
  const value = basePackage();
  delete value.capProject.sourcePath;
  value.capProject.nonDestructiveCopy = false;
  delete value.edit.captionTracks;

  const result = validatePostproductionPackage(value);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.code === "CAP_SOURCE_PROJECT_REQUIRED"));
  assert(result.errors.some((error) => error.code === "CAP_NON_DESTRUCTIVE_COPY_REQUIRED"));
  assert(result.errors.some((error) => error.code === "BILINGUAL_CAPTION_TRACKS_REQUIRED"));
});

test("rejects an avatar segment over the hard 40 second limit", () => {
  const value = basePackage();
  value.tasks[1].finalRange.end = 71;
  const result = validatePostproductionPackage(value);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.code === "AVATAR_SEGMENT_TOO_LONG"));
});

test("expands a long avatar task only at declared semantic boundaries", () => {
  const value = basePackage();
  value.tasks[1].finalRange = {start: 90, end: 145};
  value.tasks[1].semanticBoundaries = [120];
  assert.equal(validatePostproductionPackage(value).ok, true);
  const expanded = expandAvatarTasks(value.tasks);
  assert.deepEqual(expanded.filter((task) => task.type === "AVATAR").map((task) => [task.finalRange.start, task.finalRange.end]), [[90, 120], [120, 145]]);
});

test("freezing binds project revision and immutable mapping hashes", () => {
  const frozen = freezePostproductionPackage(basePackage(), {
    edlContent: "[{\"source\":0,\"start\":0,\"end\":10}]",
    mappingContent: "[{\"sourceStart\":0,\"finalStart\":0}]",
  });
  assert.equal(frozen.state, "EDL_FROZEN");
  assert.equal(frozen.freeze.projectRevision, 7);
  assert.match(frozen.freeze.edlSha256, /^[a-f0-9]{64}$/);
  assert.match(frozen.freeze.mappingSha256, /^[a-f0-9]{64}$/);
});

test("frozen package detects EDL or mapping changes before overlay work", async () => {
  const frozen = freezePostproductionPackage(basePackage(), {edlContent: "edl", mappingContent: "mapping"});
  const okay = await verifyFrozenPackageFiles(frozen, {readText: async (path) => path.endsWith("final.edl.json") ? "edl" : "mapping"});
  assert.equal(okay.ok, true);
  const stale = await verifyFrozenPackageFiles(frozen, {readText: async () => "changed"});
  assert.equal(stale.ok, false);
  assert(stale.errors.includes("MAPPING_STALE"));
});

test("overlay plan is revision chained and never rewrites the base timeline", () => {
  const frozen = freezePostproductionPackage(basePackage(), {
    edlContent: "edl",
    mappingContent: "mapping",
  });
  const plan = buildOverlayCommandPlan(frozen, {
    "remotion-001": {definitionId: "timeline-proof", definitionVersion: 1, source: "motion/timeline-proof", compositionId: "TimelineProof"},
    "avatar-001": verifiedAsset(frozen, {artifactPath: "/media/avatar-001.mp4", width: 1280, height: 720, fps: 30}),
  });
  assert.deepEqual(plan.map((step) => step.expectedRevision), [7, 8, 9]);
  assert.deepEqual(plan.map((step) => step.action), [
    "motion-definition-register",
    "motion-add",
    "motion-artifact-import",
  ]);
  assert.deepEqual(
    plan.filter((step) => step.action !== "motion-definition-register").map((step) => step.role),
    ["animation", "avatar"],
  );
  const overlays = plan.filter((step) => step.action !== "motion-definition-register");
  assert(overlays[0].zIndex > overlays[1].zIndex, "Remotion 动画应默认覆盖在数字人上方");
  assert(plan.every((step) => !step.action.startsWith("timeline-")));
});

test("executes the overlay plan as Cap CLI commands and verifies every returned revision", async () => {
  const frozen = freezePostproductionPackage(basePackage(), {edlContent: "edl", mappingContent: "mapping"});
  const plan = buildOverlayCommandPlan(frozen, {
    "remotion-001": {definitionId: "timeline-proof", definitionVersion: 1, source: "motion/timeline-proof", compositionId: "TimelineProof"},
    "avatar-001": verifiedAsset(frozen, {artifactPath: "/media/avatar-001.mp4", width: 1280, height: 720, fps: 30}),
  });
  const commands = [];
  const result = await executeOverlayCommandPlan(plan, {
    capBin: "/bin/cap",
    projectPath: "/media/second.cap",
    runCommand: async (command, args) => {
      commands.push({command, args});
      const expected = Number(args[args.indexOf("--expected-revision") + 1]);
      return {stdout: JSON.stringify({ok: true, revision: expected + 1})};
    },
  });
  assert.equal(result.revision, 10);
  assert.deepEqual(commands.map(({args}) => args.slice(0, 3)), [
    ["motion", "definition", "register"],
    ["motion", "add", "--expected-revision"],
    ["motion", "artifact", "import"],
  ]);
  assert.deepEqual(
    commands.slice(1).map(({args}) => args[args.indexOf("--role") + 1]),
    ["animation", "avatar"],
  );
});

test("long avatar tasks use the same semantic child IDs for audio generation and Cap overlays", () => {
  const value = basePackage();
  value.tasks = [value.tasks[1]];
  value.tasks[0].finalRange = {start: 90, end: 145};
  value.tasks[0].semanticBoundaries = [120];
  const frozen = freezePostproductionPackage(value, {edlContent: "edl", mappingContent: "mapping"});
  const plan = buildOverlayCommandPlan(frozen, {
    "avatar-001-part-1": verifiedAsset(frozen, {artifactPath: "/media/avatar-part-1.mp4", width: 1280, height: 720, fps: 30}),
    "avatar-001-part-2": verifiedAsset(frozen, {artifactPath: "/media/avatar-part-2.mp4", width: 1280, height: 720, fps: 30}),
  });
  assert.deepEqual(plan.map((step) => step.segmentId), ["avatar-001-part-1", "avatar-001-part-2"]);
  assert.deepEqual(plan.map((step) => [step.start, step.duration]), [[90, 30], [120, 25]]);
});

test("refuses to write an avatar overlay before hard and viewing QA both pass", () => {
  const value = basePackage();
  value.tasks = [value.tasks[1]];
  const frozen = freezePostproductionPackage(value, {edlContent: "edl", mappingContent: "mapping"});
  assert.throws(() => buildOverlayCommandPlan(frozen, {
    "avatar-001": {
      artifactPath: "/media/avatar.mp4",
      width: 1280,
      height: 720,
      fps: 30,
      qa: {hardStatus: "PASS", manualStatus: "OBSERVE", mappingSha256: frozen.freeze.mappingSha256},
    },
  }), /GENERATED_ASSET_QA_REQUIRED/);
});

test("refuses to silently omit a required generated overlay asset", () => {
  const frozen = freezePostproductionPackage(basePackage(), {edlContent: "edl", mappingContent: "mapping"});
  assert.throws(
    () => buildOverlayCommandPlan(frozen, {}),
    /GENERATED_ASSET_MISSING:remotion-001/,
  );
});

test("rejects incomplete Remotion and external video asset metadata before invoking Cap", () => {
  const frozen = freezePostproductionPackage(basePackage(), {edlContent: "edl", mappingContent: "mapping"});
  assert.throws(() => buildOverlayCommandPlan(frozen, {
    "remotion-001": {definitionId: "timeline-proof"},
    "avatar-001": verifiedAsset(frozen, {artifactPath: "/media/avatar.mp4", width: 1280, height: 720, fps: 30}),
  }), /REMOTION_ASSET_INVALID:remotion-001/);

  assert.throws(() => buildOverlayCommandPlan(frozen, {
    "remotion-001": {definitionId: "timeline-proof", definitionVersion: 1, source: "motion/timeline-proof", compositionId: "TimelineProof"},
    "avatar-001": verifiedAsset(frozen, {artifactPath: "relative/avatar.mp4", width: 1280, height: 720, fps: 30}),
  }), /GENERATED_ASSET_METADATA_INVALID:avatar-001/);
});

test("screen-recording and evidence tasks become verified upper-track artifacts instead of being skipped", () => {
  const value = basePackage();
  value.tasks = [
    {id: "screen-001", type: "SCREEN_RECORDING", finalRange: {start: 2, end: 6}, narrative: narrative({purpose: "ACT"})},
    {id: "evidence-001", type: "EVIDENCE", finalRange: {start: 8, end: 12}, narrative: narrative({purpose: "TRUST"})},
  ];
  const frozen = freezePostproductionPackage(value, {edlContent: "edl", mappingContent: "mapping"});
  const assets = Object.fromEntries(value.tasks.map((task) => [task.id, verifiedAsset(frozen, {
    artifactPath: `/media/${task.id}.mp4`,
    width: 1920,
    height: 1080,
    fps: 30,
  })]));
  const plan = buildOverlayCommandPlan(frozen, assets);
  assert.deepEqual(plan.map((step) => step.action), ["motion-artifact-import", "motion-artifact-import"]);
  assert.deepEqual(plan.map((step) => step.segmentId), ["screen-001", "evidence-001"]);
});
