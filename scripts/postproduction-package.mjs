#!/usr/bin/env node
import {createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {readFile, writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {isAbsolute, resolve} from "node:path";

const REQUIRED_REMOTION_FIELDS = [
  "object",
  "relationship",
  "entrance",
  "change",
  "resolutionFrame",
  "materials",
  "acceptance",
];

const REQUIRED_INTENT_FIELDS = ["audience", "promise", "mainLine", "primaryWin", "visualStrategy"];
const REQUIRED_NARRATIVE_FIELDS = ["purpose", "viewerBefore", "viewerAfter", "whyThisMedium", "handoffIn", "handoffOut"];
const REQUIRED_ACTIVATION_FIELDS = ["asset", "trigger", "judgment", "changedDecision", "resultLocation", "unusedBoundary"];
const NARRATIVE_PURPOSES = ["UNDERSTAND", "TRUST", "ACT", "FEEL", "TRANSITION"];
const REQUIRED_KNOWLEDGE_VISUAL_FIELDS = [
  "contractId",
  "segmentId",
  "spokenClaim",
  "viewerBefore",
  "viewerAfter",
  "initialState",
  "interaction",
  "resultState",
  "viewerInference",
  "cameraPurpose",
  "silentTest",
  "audioSyncTest",
];
const KNOWLEDGE_TYPES = ["DEFINITION", "CAUSE", "PROCESS", "COMPARE", "HIERARCHY", "FEEDBACK", "BOUNDARY"];
const LABEL_RESPONSIBILITIES = ["身份", "动作", "结果", "边界"];
const EXPECTED_KNOWLEDGE_CARRIER = {
  REMOTION: "REMOTION_OVERLAY",
  AI_VIDEO: "AI_VIDEO_FULL",
};
const OVERLAY_ROLE_BY_TASK_TYPE = {
  REMOTION: "animation",
  AVATAR: "avatar",
  AI_VIDEO: "aiVideo",
  SCREEN_RECORDING: "screenRecording",
  EVIDENCE: "evidence",
};
const DEFAULT_Z_INDEX_BY_OVERLAY_ROLE = {
  screenRecording: 10,
  evidence: 20,
  aiVideo: 30,
  avatar: 40,
  animation: 50,
};
const REQUIRED_OVERLAY_CONTINUITY_FIELDS = [
  "groupId",
  "stateBefore",
  "stateUpdate",
  "stateAfter",
  "contrastReason",
  "handoff",
];
const OVERLAY_ROLES = ["NAVIGATION", "EXPLANATION", "EVIDENCE", "CONCLUSION", "BRIDGE"];
const HOST_CARRIERS = ["BASE", "SCREEN_RECORDING", "AVATAR", "EVIDENCE", "AI_VIDEO_FULL"];
const OVERLAY_PERSISTENCE = ["SEGMENT", "ACROSS_CUT", "UNTIL_SECTION_END"];
const CONTRAST_MODES = ["NONE", "LOCAL_BACKPLATE", "REGIONAL_SCRIM", "FULL_SCRIM"];
const FOCUS_OWNERS = ["HOST", "OVERLAY", "EVIDENCE"];
const PROTECTED_TARGETS = ["FACE", "HANDS", "SUBTITLES", "SOURCE_UI", "AI_VISUAL_ANCHOR"];
const REQUIRED_AI_HOST_COMPATIBILITY_FIELDS = [
  "visualAnchor",
  "stableNegativeSpace",
  "luminanceProfile",
  "motionLoad",
  "attentionHandoff",
];

const error = (code, path, message) => ({code, path, message});
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const validRange = (range) =>
  range && Number.isFinite(range.start) && Number.isFinite(range.end) && range.start >= 0 && range.end > range.start;

function knowledgeVisualContractIssues(contract, {expectedCarrier, taskId} = {}) {
  if (!contract || typeof contract !== "object") return ["KnowledgeVisualContract 缺失"];
  const issues = REQUIRED_KNOWLEDGE_VISUAL_FIELDS
    .filter((field) => !nonEmpty(contract[field]))
    .map((field) => `缺少 ${field}`);
  if (!KNOWLEDGE_TYPES.includes(contract.knowledgeType)) issues.push("knowledgeType 不受支持");
  if (!Array.isArray(contract.entities) || contract.entities.length < 1 || !contract.entities.every(nonEmpty)) {
    issues.push("entities 必须包含至少一个语义对象");
  }
  if (!Array.isArray(contract.stateChanges) || contract.stateChanges.length < 1 || !contract.stateChanges.every(nonEmpty)) {
    issues.push("stateChanges 必须包含至少一次可见状态变化");
  }
  if (
    !Array.isArray(contract.semanticAnchors)
    || contract.semanticAnchors.length < 1
    || contract.semanticAnchors.some((anchor) => !nonEmpty(anchor?.spokenCue) || !nonEmpty(anchor?.visualEvent))
  ) {
    issues.push("semanticAnchors 必须建立口播触发与画面事件的对应");
  }
  if (
    !Array.isArray(contract.labelPlan)
    || contract.labelPlan.some((label) => (
      !nonEmpty(label?.text)
      || !nonEmpty(label?.target)
      || !LABEL_RESPONSIBILITIES.includes(label?.responsibility)
    ))
  ) {
    issues.push("labelPlan 必须是可为空的合法标签数组");
  }
  if (expectedCarrier && contract.carrierDecision !== expectedCarrier) {
    issues.push(`carrierDecision 必须为 ${expectedCarrier}`);
  }
  if (taskId && contract.segmentId !== taskId) issues.push("segmentId 必须与任务 id 一致");
  return issues;
}

function overlayContinuityIssues(contract) {
  if (!contract || typeof contract !== "object") return ["overlay continuity contract 缺失"];
  const issues = REQUIRED_OVERLAY_CONTINUITY_FIELDS
    .filter((field) => !nonEmpty(contract[field]))
    .map((field) => `缺少 ${field}`);
  if (!Number.isInteger(contract.order) || contract.order < 1) issues.push("order 必须为正整数");
  if (!OVERLAY_ROLES.includes(contract.role)) issues.push("role 不受支持");
  if (!HOST_CARRIERS.includes(contract.hostCarrier)) issues.push("hostCarrier 不受支持");
  if (!OVERLAY_PERSISTENCE.includes(contract.persistence)) issues.push("persistence 不受支持");
  if (!CONTRAST_MODES.includes(contract.contrastMode)) issues.push("contrastMode 不受支持");
  if (
    !Array.isArray(contract.attentionPlan)
    || contract.attentionPlan.length < 1
    || contract.attentionPlan.some((item) => (
      !nonEmpty(item?.spokenCue)
      || !FOCUS_OWNERS.includes(item?.focusOwner)
      || !nonEmpty(item?.target)
      || !nonEmpty(item?.reason)
    ))
  ) {
    issues.push("attentionPlan 必须逐语义点指定唯一焦点及原因");
  }
  if (
    !Array.isArray(contract.protectedRegions)
    || contract.protectedRegions.some((region) => (
      !PROTECTED_TARGETS.includes(region?.target) || !nonEmpty(region?.description)
    ))
  ) {
    issues.push("protectedRegions 必须是合法安全区数组");
  }
  return issues;
}

function aiHostCompatibilityIssues(contract) {
  if (!contract || typeof contract !== "object") return ["AI host compatibility contract 缺失"];
  const issues = REQUIRED_AI_HOST_COMPATIBILITY_FIELDS
    .filter((field) => !nonEmpty(contract[field]))
    .map((field) => `缺少 ${field}`);
  if (!Array.isArray(contract.forbiddenOverlayWindows) || !contract.forbiddenOverlayWindows.every(nonEmpty)) {
    issues.push("forbiddenOverlayWindows 必须是合法字符串数组");
  }
  if (!["PENDING", "PASS", "FAIL"].includes(contract.actualPixelReview)) {
    issues.push("actualPixelReview 必须为 PENDING / PASS / FAIL");
  }
  return issues;
}

export function validatePostproductionPackage(value) {
  const errors = [];
  if (!value || typeof value !== "object") {
    return {ok: false, errors: [error("INVALID_PACKAGE", "$", "任务包必须是对象")]};
  }
  if (value.schema !== "laohu.video-postproduction-handoff/1") {
    errors.push(error("UNSUPPORTED_SCHEMA", "schema", "只接受 laohu.video-postproduction-handoff/1"));
  }
  if (value.phase !== "SECOND_PASS_POSTPRODUCTION") {
    errors.push(error("WRONG_PHASE", "phase", "第一遍录制不进入后期任务；这里只接受第二遍正式后期"));
  }
  if (!nonEmpty(value.videoId)) {
    errors.push(error("VIDEO_ID_REQUIRED", "videoId", "必须提供稳定的视频 ID"));
  }
  const missingIntent = REQUIRED_INTENT_FIELDS.filter((field) => !nonEmpty(value.intent?.[field]));
  if (missingIntent.length) {
    errors.push(error("INTENT_INCOMPLETE", "intent", `缺少 ${missingIntent.join(", ")}`));
  }
  if (!Array.isArray(value.knowledgeActivations) || value.knowledgeActivations.length < 1) {
    errors.push(error("KNOWLEDGE_ACTIVATION_REQUIRED", "knowledgeActivations", "重要后期任务必须说明专业知识改变了哪次决定"));
  } else {
    for (const [index, activation] of value.knowledgeActivations.entries()) {
      const missing = REQUIRED_ACTIVATION_FIELDS.filter((field) => !nonEmpty(activation?.[field]));
      if (missing.length) {
        errors.push(error("KNOWLEDGE_ACTIVATION_INCOMPLETE", `knowledgeActivations[${index}]`, `缺少 ${missing.join(", ")}`));
      }
    }
  }
  if (value.thread?.ownership !== "DEDICATED_VIDEO_TASK") {
    errors.push(error("THREAD_OWNERSHIP_REQUIRED", "thread.ownership", "每条视频必须由独立后期任务持续返工"));
  }
  if (value.thread?.upstreamCreatesOnce !== true) {
    errors.push(error("THREAD_HANDOFF_INVALID", "thread.upstreamCreatesOnce", "上游只创建并发送一次初始后期任务"));
  }
  if (!nonEmpty(value.capProject?.path) || !Number.isInteger(value.capProject?.expectedRevision) || value.capProject.expectedRevision < 0) {
    errors.push(error("CAP_PROJECT_INCOMPLETE", "capProject", "必须给出 Cap 路径和非负 expectedRevision"));
  } else if (!isAbsolute(value.capProject.path)) {
    errors.push(error("CAP_PROJECT_PATH_NOT_ABSOLUTE", "capProject.path", "Cap 工程路径必须是绝对路径"));
  }
  if (!nonEmpty(value.capProject?.sourcePath) || !isAbsolute(value.capProject?.sourcePath ?? "")) {
    errors.push(error("CAP_SOURCE_PROJECT_REQUIRED", "capProject.sourcePath", "必须给出只读保留的原始 Cap 工程绝对路径"));
  }
  if (value.capProject?.nonDestructiveCopy !== true || value.capProject?.sourcePath === value.capProject?.path) {
    errors.push(error("CAP_NON_DESTRUCTIVE_COPY_REQUIRED", "capProject", "后期必须写入独立的新 Cap 工程，不能修改原始录制工程"));
  }
  if (!nonEmpty(value.sources?.secondPassAsr) || !nonEmpty(value.sources?.productionScript) || !nonEmpty(value.sources?.finalMainAudio)) {
    errors.push(error("SOURCE_INPUT_INCOMPLETE", "sources", "必须给出第二遍 ASR、完整制作脚本和最终主音频"));
  } else if (![value.sources.secondPassAsr, value.sources.productionScript, value.sources.finalMainAudio].every(isAbsolute)) {
    errors.push(error("SOURCE_PATH_NOT_ABSOLUTE", "sources", "第二遍 ASR、制作脚本和最终主音频必须使用绝对路径"));
  }
  for (const [field, expected] of Object.entries({preserveBaseRecording: true, preserveFinalMainAudio: true, mediaOutsideRepository: true})) {
    if (value.protection?.[field] !== expected) {
      errors.push(error("PROTECTION_REQUIRED", `protection.${field}`, `${field} 必须为 true`));
    }
  }
  if (!nonEmpty(value.edit?.edlPath) || !nonEmpty(value.edit?.sourceToFinalMapPath)) {
    errors.push(error("EDIT_MAPPING_INCOMPLETE", "edit", "必须给出最终 EDL 与 S2→T2 映射"));
  } else if (![value.edit.edlPath, value.edit.sourceToFinalMapPath].every(isAbsolute)) {
    errors.push(error("EDIT_PATH_NOT_ABSOLUTE", "edit", "EDL 与 S2→T2 映射必须使用绝对路径"));
  }
  const captionTracks = value.edit?.captionTracks;
  if (
    captionTracks?.mode !== "SEPARATE_BILINGUAL"
    || !nonEmpty(captionTracks?.sourceMasterPath)
    || !nonEmpty(captionTracks?.displayTracksPath)
    || ![captionTracks?.sourceMasterPath, captionTracks?.displayTracksPath].every((path) => nonEmpty(path) && isAbsolute(path))
    || !Array.isArray(captionTracks?.tracks)
    || captionTracks.tracks.length !== 2
    || !captionTracks.tracks.includes("zh-CN")
    || !captionTracks.tracks.includes("en")
  ) {
    errors.push(error(
      "BILINGUAL_CAPTION_TRACKS_REQUIRED",
      "edit.captionTracks",
      "必须同时给出源字幕主稿，以及可独立编辑且通过 pairId 配对的中文轨和英文轨",
    ));
  }
  const preEditReview = value.edit?.preEditReview;
  if (!preEditReview || !nonEmpty(preEditReview.documentPath)) {
    errors.push(error("PRE_EDIT_REVIEW_REQUIRED", "edit.preEditReview", "剪辑前必须提供覆盖整片的预剪辑字幕审稿文档"));
  } else {
    if (!isAbsolute(preEditReview.documentPath)) {
      errors.push(error("PRE_EDIT_REVIEW_PATH_NOT_ABSOLUTE", "edit.preEditReview.documentPath", "预剪辑字幕审稿文档必须使用绝对路径"));
    }
    if (preEditReview.fullTimelineCovered !== true || preEditReview.segmentBoundariesIncluded !== true) {
      errors.push(error("PRE_EDIT_REVIEW_INCOMPLETE", "edit.preEditReview", "审稿文档必须覆盖整片并按每个候选剪辑片段列出源时码、字幕和处理意见"));
    }
    if (
      preEditReview.virtualRoughCutComplete !== true
      || preEditReview.virtualFineCutComplete !== true
      || preEditReview.provisionalFinalTimelineIncluded !== true
    ) {
      errors.push(error(
        "PRE_EDIT_VIRTUAL_EDIT_INCOMPLETE",
        "edit.preEditReview",
        "预剪辑必须在文档中走完虚拟初剪、虚拟精剪，并给出带预期成片时码的最终字幕时间轴",
      ));
    }
    if (
      preEditReview.crossCueSemanticReviewComplete !== true
      || preEditReview.atomicTermsPreserved !== true
    ) {
      errors.push(error(
        "PRE_EDIT_CAPTION_REVIEW_INCOMPLETE",
        "edit.preEditReview",
        "最终拟用字幕必须跨 ASR 条目恢复完整表达，并确认模型名、版本号和术语组合未被拆开",
      ));
    }
    if (preEditReview.uncertaintiesResolved !== true) {
      errors.push(error("PRE_EDIT_UNCERTAINTIES_UNRESOLVED", "edit.preEditReview.uncertaintiesResolved", "剪辑、字幕文字、专名、参数、字体或样式疑难未确认时不得进入剪辑"));
    }
    if (preEditReview.userApproval?.status !== "APPROVED" || !nonEmpty(preEditReview.userApproval?.reference)) {
      errors.push(error("PRE_EDIT_REVIEW_NOT_APPROVED", "edit.preEditReview.userApproval", "必须记录用户对整份预剪辑字幕审稿文档的明确批准"));
    }
    const requiresVisualReview = preEditReview.visualPlan !== undefined
      || preEditReview.userApproval?.scope === "EDIT_AND_VISUALS"
      || (Array.isArray(value.tasks) && value.tasks.some((task) => ["REMOTION", "AVATAR", "AI_VIDEO", "EVIDENCE", "SCREEN_RECORDING"].includes(task.type)));
    if (requiresVisualReview) {
      if (preEditReview.visualPlan?.included !== true
        || preEditReview.visualPlan?.feedbackResolved !== true
        || preEditReview.visualPlan?.materialsResolved !== true) {
        errors.push(error("PRE_EDIT_VISUAL_PLAN_INCOMPLETE", "edit.preEditReview.visualPlan", "同一审稿文档必须包含画面与动画方案，并解决反馈、素材来源或替代方案；未完成不得执行剪辑或覆盖制作"));
      }
      if (preEditReview.userApproval?.scope !== "EDIT_AND_VISUALS") {
        errors.push(error("PRE_EDIT_VISUAL_APPROVAL_REQUIRED", "edit.preEditReview.userApproval.scope", "剪口批准不能代替整份剪辑与画面方案批准"));
      }
      if (!Number.isInteger(preEditReview.revision) || preEditReview.revision < 1
        || preEditReview.userApproval?.reviewRevision !== preEditReview.revision) {
        errors.push(error("PRE_EDIT_APPROVAL_STALE", "edit.preEditReview.userApproval.reviewRevision", "必须确认当前审稿修订；反馈改变时间、效果、材料或覆盖方式后不能沿用旧批准"));
      }
    }
  }
  if (!Array.isArray(value.tasks)) errors.push(error("TASKS_ARRAY_REQUIRED", "tasks", "tasks 必须是数组"));
  const ids = new Set();
  for (const [index, task] of (value.tasks ?? []).entries()) {
    const path = `tasks[${index}]`;
    if (!nonEmpty(task.id) || ids.has(task.id)) {
      errors.push(error("TASK_ID_INVALID", `${path}.id`, "任务 ID 必须非空且唯一"));
    }
    ids.add(task.id);
    if (!validRange(task.finalRange)) {
      errors.push(error("FINAL_RANGE_INVALID", `${path}.finalRange`, "覆盖任务必须使用有效的冻结成片时间"));
    }
    const missingNarrative = REQUIRED_NARRATIVE_FIELDS.filter((field) => !nonEmpty(task.narrative?.[field]));
    if (missingNarrative.length) {
      errors.push(error("TASK_NARRATIVE_INCOMPLETE", `${path}.narrative`, `缺少 ${missingNarrative.join(", ")}`));
    } else if (!NARRATIVE_PURPOSES.includes(task.narrative.purpose)) {
      errors.push(error("TASK_PURPOSE_INVALID", `${path}.narrative.purpose`, `不支持 ${task.narrative.purpose}`));
    }
    if (
      task.narrative?.purpose === "UNDERSTAND"
      && ["REMOTION", "AI_VIDEO"].includes(task.type)
    ) {
      const issues = knowledgeVisualContractIssues(task.knowledgeVisual, {
        expectedCarrier: EXPECTED_KNOWLEDGE_CARRIER[task.type],
        taskId: task.id,
      });
      if (issues.length) {
        errors.push(error(
          "KNOWLEDGE_VISUAL_CONTRACT_INCOMPLETE",
          `${path}.knowledgeVisual`,
          issues.join("；"),
        ));
      }
    }
    if (task.type === "REMOTION") {
      const missing = REQUIRED_REMOTION_FIELDS.filter((field) => {
        const candidate = task.annotation?.[field];
        return Array.isArray(candidate) ? candidate.length === 0 : !nonEmpty(candidate);
      });
      if (missing.length) {
        errors.push(error("REMOTION_ANNOTATION_INCOMPLETE", `${path}.annotation`, `缺少 ${missing.join(", ")}`));
      }
      const continuityIssues = overlayContinuityIssues(task.overlayContinuity);
      if (continuityIssues.length) {
        errors.push(error(
          "OVERLAY_CONTINUITY_INCOMPLETE",
          `${path}.overlayContinuity`,
          continuityIssues.join("；"),
        ));
      }
      if (task.overlayContinuity?.hostCarrier === "AI_VIDEO_FULL") {
        const compatibilityIssues = aiHostCompatibilityIssues(task.overlayContinuity.hostCompatibility);
        if (compatibilityIssues.length) {
          errors.push(error(
            "AI_HOST_COMPATIBILITY_INCOMPLETE",
            `${path}.overlayContinuity.hostCompatibility`,
            compatibilityIssues.join("；"),
          ));
        }
      }
    } else if (task.type === "AVATAR") {
      if (validRange(task.finalRange) && task.finalRange.end - task.finalRange.start > 40 + 1e-6) {
        try {
          splitRangeAtSemanticBoundaries(task.finalRange, task.semanticBoundaries);
        } catch {
          errors.push(error("AVATAR_SEGMENT_TOO_LONG", `${path}.finalRange`, "超过 40 秒时必须提供能形成全部不超过 40 秒片段的自然语义边界"));
        }
      }
      if (task.audio?.source !== "FINAL_MAIN_AUDIO" || !nonEmpty(task.audio?.mapRef)) {
        errors.push(error("AVATAR_AUDIO_INVALID", `${path}.audio`, "数字人只能由最终主音频及冻结映射驱动"));
      }
      if (!nonEmpty(task.continuity?.group) || !Number.isInteger(task.continuity?.order) || task.continuity.order < 1) {
        errors.push(error("AVATAR_CONTINUITY_REQUIRED", `${path}.continuity`, "数字人任务必须提供连续组和顺序"));
      }
    } else if (!["BASE", "SCREEN_RECORDING", "EVIDENCE", "AI_VIDEO"].includes(task.type)) {
      errors.push(error("TASK_TYPE_UNSUPPORTED", `${path}.type`, `不支持 ${task.type ?? "空"}`));
    }
  }
  const overlayTasks = (value.tasks ?? [])
    .map((task, index) => ({task, index, role: OVERLAY_ROLE_BY_TASK_TYPE[task?.type]}))
    .filter(({task, role}) => role && validRange(task.finalRange));
  for (let left = 0; left < overlayTasks.length; left += 1) {
    for (let right = left + 1; right < overlayTasks.length; right += 1) {
      const first = overlayTasks[left];
      const second = overlayTasks[right];
      if (
        first.role === second.role
        && first.task.finalRange.start < second.task.finalRange.end
        && second.task.finalRange.start < first.task.finalRange.end
      ) {
        errors.push(error(
          "OVERLAY_ROLE_OVERLAP",
          `tasks[${second.index}].finalRange`,
          `同一覆盖职责 ${second.role} 不能与 tasks[${first.index}] 重叠`,
        ));
      }
    }
  }
  const continuityGroups = new Map();
  for (const [index, task] of (value.tasks ?? []).entries()) {
    if (task.type !== "REMOTION" || !task.overlayContinuity || !validRange(task.finalRange)) continue;
    const groupId = task.overlayContinuity.groupId;
    if (!nonEmpty(groupId)) continue;
    if (!continuityGroups.has(groupId)) continuityGroups.set(groupId, []);
    continuityGroups.get(groupId).push({task, index});
  }
  for (const entries of continuityGroups.values()) {
    entries.sort((left, right) => left.task.overlayContinuity.order - right.task.overlayContinuity.order);
    for (let index = 1; index < entries.length; index += 1) {
      const previous = entries[index - 1];
      const current = entries[index];
      if (current.task.overlayContinuity.order !== previous.task.overlayContinuity.order + 1) {
        errors.push(error(
          "OVERLAY_CONTINUITY_ORDER_INVALID",
          `tasks[${current.index}].overlayContinuity.order`,
          "同一连续组必须使用无缺口顺序",
        ));
      }
      if (current.task.overlayContinuity.stateBefore !== previous.task.overlayContinuity.stateAfter) {
        errors.push(error(
          "OVERLAY_STATE_DISCONTINUITY",
          `tasks[${current.index}].overlayContinuity.stateBefore`,
          "跨底画覆盖组的前态必须接住上一段后态",
        ));
      }
      if (current.task.finalRange.start < previous.task.finalRange.end) {
        errors.push(error(
          "OVERLAY_CONTINUITY_TIME_INVALID",
          `tasks[${current.index}].finalRange`,
          "同一连续组的顺序必须与冻结时间轴一致",
        ));
      }
    }
  }
  return {ok: errors.length === 0, errors};
}

const sha256 = (content) => createHash("sha256").update(content).digest("hex");

function splitRangeAtSemanticBoundaries(range, semanticBoundaries = [], maxDuration = 40) {
  const candidates = [...new Set(semanticBoundaries)]
    .filter((point) => Number.isFinite(point) && point > range.start && point < range.end)
    .sort((left, right) => left - right);
  const ranges = [];
  let start = range.start;
  while (range.end - start > maxDuration + 1e-6) {
    const ceiling = start + maxDuration;
    const boundary = candidates.filter((point) => point > start && point <= ceiling).at(-1);
    if (boundary === undefined) {
      throw new Error("AVATAR_SEMANTIC_BOUNDARY_REQUIRED");
    }
    ranges.push({start, end: boundary});
    start = boundary;
  }
  ranges.push({start, end: range.end});
  return ranges;
}

export function expandAvatarTasks(tasks) {
  return tasks.flatMap((task) => {
    if (task.type !== "AVATAR" || !validRange(task.finalRange)) return [structuredClone(task)];
    const ranges = splitRangeAtSemanticBoundaries(task.finalRange, task.semanticBoundaries);
    if (ranges.length === 1) return [structuredClone(task)];
    return ranges.map((finalRange, index) => ({
      ...structuredClone(task),
      id: `${task.id}-part-${index + 1}`,
      parentTaskId: task.id,
      finalRange,
      continuity: {
        ...structuredClone(task.continuity),
        order: task.continuity.order * 1000 + index,
      },
    }));
  });
}

export function freezePostproductionPackage(value, {edlContent, mappingContent}) {
  const validation = validatePostproductionPackage(value);
  if (!validation.ok) {
    const failure = new Error("任务包不能冻结");
    failure.errors = validation.errors;
    throw failure;
  }
  if (typeof edlContent !== "string" || typeof mappingContent !== "string") {
    throw new TypeError("冻结必须读取 EDL 与映射的真实内容");
  }
  return {
    ...structuredClone(value),
    state: "EDL_FROZEN",
    freeze: {
      projectRevision: value.capProject.expectedRevision,
      edlSha256: sha256(edlContent),
      mappingSha256: sha256(mappingContent),
    },
  };
}

export async function verifyFrozenPackageFiles(value, {readText = (path) => readFile(path, "utf8")} = {}) {
  const errors = [];
  if (value?.state !== "EDL_FROZEN" || value.freeze?.projectRevision !== value.capProject?.expectedRevision) {
    errors.push("TIMELINE_NOT_FROZEN");
    return {ok: false, errors};
  }
  const [edlContent, mappingContent] = await Promise.all([
    readText(value.edit.edlPath),
    readText(value.edit.sourceToFinalMapPath),
  ]);
  if (sha256(edlContent) !== value.freeze.edlSha256) errors.push("EDL_STALE");
  if (sha256(mappingContent) !== value.freeze.mappingSha256) errors.push("MAPPING_STALE");
  return {ok: errors.length === 0, errors};
}

export function buildOverlayCommandPlan(value, assets) {
  if (value.state !== "EDL_FROZEN" || value.freeze?.projectRevision !== value.capProject?.expectedRevision) {
    throw new Error("OVERLAY_REQUIRES_FROZEN_TIMELINE");
  }
  const validation = validatePostproductionPackage(value);
  if (!validation.ok) {
    const failure = new Error(validation.errors.map(({code}) => code).join(", "));
    failure.errors = validation.errors;
    throw failure;
  }
  let revision = value.freeze.projectRevision;
  const steps = [];
  for (const task of expandAvatarTasks(value.tasks)) {
    if (!["REMOTION", "AVATAR", "AI_VIDEO", "SCREEN_RECORDING", "EVIDENCE"].includes(task.type)) continue;
    const asset = assets[task.id];
    if (!asset) throw new Error(`GENERATED_ASSET_MISSING:${task.id}`);
    if (["AVATAR", "AI_VIDEO", "SCREEN_RECORDING", "EVIDENCE"].includes(task.type) && (
      asset.qa?.hardStatus !== "PASS"
      || asset.qa?.manualStatus !== "PASS"
      || asset.qa?.mappingSha256 !== value.freeze.mappingSha256
    )) {
      throw new Error(`GENERATED_ASSET_QA_REQUIRED:${task.id}`);
    }
    if (task.type === "REMOTION") {
      if (
        !nonEmpty(asset.definitionId)
        || !Number.isInteger(asset.definitionVersion)
        || asset.definitionVersion < 1
        || !nonEmpty(asset.source)
        || !nonEmpty(asset.compositionId)
      ) {
        throw new Error(`REMOTION_ASSET_INVALID:${task.id}`);
      }
      steps.push({
        action: "motion-definition-register",
        taskId: task.id,
        expectedRevision: revision++,
        duration: task.finalRange.end - task.finalRange.start,
        ...asset,
      });
      steps.push({
        action: "motion-add",
        taskId: task.id,
        expectedRevision: revision++,
        definitionId: asset.definitionId,
        definitionVersion: asset.definitionVersion,
        start: task.finalRange.start,
        duration: task.finalRange.end - task.finalRange.start,
        role: OVERLAY_ROLE_BY_TASK_TYPE[task.type],
        track: asset.track ?? 0,
        zIndex: asset.zIndex ?? DEFAULT_Z_INDEX_BY_OVERLAY_ROLE.animation,
        props: {
          ...(asset.props ?? {}),
          overlayContinuity: structuredClone(task.overlayContinuity),
        },
      });
    } else {
      if (
        !isAbsolute(asset.artifactPath ?? "")
        || !(Number(asset.width) > 0)
        || !(Number(asset.height) > 0)
        || !(Number(asset.fps) > 0)
      ) {
        throw new Error(`GENERATED_ASSET_METADATA_INVALID:${task.id}`);
      }
      steps.push({
        action: "motion-artifact-import",
        taskId: task.id,
        expectedRevision: revision++,
        segmentId: task.id,
        artifactId: asset.artifactId ?? `${task.id}-final`,
        start: task.finalRange.start,
        duration: task.finalRange.end - task.finalRange.start,
        ...asset,
        role: OVERLAY_ROLE_BY_TASK_TYPE[task.type],
        track: asset.track ?? 0,
        zIndex: asset.zIndex ?? DEFAULT_Z_INDEX_BY_OVERLAY_ROLE[OVERLAY_ROLE_BY_TASK_TYPE[task.type]],
      });
    }
  }
  return steps;
}

function defaultRunCommand(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {stdio: ["ignore", "pipe", "pipe"]});
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectPromise);
    child.once("close", (code) => {
      if (code === 0) resolvePromise({stdout, stderr});
      else rejectPromise(new Error(`CAP_CLI_FAILED:${code}:${stderr.trim()}`));
    });
  });
}

const flag = (name, value) => [name, String(value)];

function stepArguments(step, projectPath) {
  if (step.action === "motion-definition-register") {
    const duration = step.defaultDuration ?? step.duration ?? 1;
    return [
      "motion", "definition", "register",
      ...flag("--expected-revision", step.expectedRevision),
      ...flag("--id", step.definitionId),
      ...flag("--version", step.definitionVersion),
      ...flag("--source", step.source),
      ...flag("--composition-id", step.compositionId),
      ...flag("--status", step.status ?? "approved"),
      ...flag("--min-duration", step.minDuration ?? Math.min(duration, 0.1)),
      ...flag("--default-duration", duration),
      ...flag("--max-duration", step.maxDuration ?? Math.max(duration, 3600)),
      ...flag("--default-policy", step.defaultPolicy ?? "responsive"),
      ...flag("--default-props-json", JSON.stringify(step.defaultProps ?? {})),
      "--format", "json", projectPath,
    ];
  }
  if (step.action === "motion-add") {
    return [
      "motion", "add",
      ...flag("--expected-revision", step.expectedRevision),
      ...flag("--definition-id", step.definitionId),
      ...flag("--definition-version", step.definitionVersion),
      ...flag("--segment-id", step.taskId),
      ...flag("--start", step.start),
      ...flag("--duration", step.duration),
      ...flag("--track", step.track ?? 0),
      ...flag("--z-index", step.zIndex ?? 0),
      ...flag("--role", step.role ?? "animation"),
      ...flag("--props-json", JSON.stringify(step.props ?? {})),
      "--format", "json", projectPath,
    ];
  }
  if (step.action === "motion-artifact-import") {
    return [
      "motion", "artifact", "import",
      ...flag("--expected-revision", step.expectedRevision),
      ...flag("--segment-id", step.segmentId),
      ...flag("--artifact-id", step.artifactId),
      ...flag("--path", step.artifactPath),
      ...flag("--start", step.start),
      ...flag("--duration", step.duration),
      ...flag("--width", step.width),
      ...flag("--height", step.height),
      ...flag("--fps", step.fps),
      ...flag("--track", step.track ?? 0),
      ...flag("--z-index", step.zIndex ?? 0),
      ...flag("--role", step.role ?? "animation"),
      ...(step.hasAlpha ? ["--has-alpha"] : []),
      "--format", "json", projectPath,
    ];
  }
  throw new Error(`OVERLAY_ACTION_UNSUPPORTED:${step.action}`);
}

export async function executeOverlayCommandPlan(plan, {
  capBin = "cap",
  projectPath,
  runCommand = defaultRunCommand,
} = {}) {
  if (!nonEmpty(projectPath)) throw new Error("CAP_PROJECT_PATH_REQUIRED");
  let revision = plan[0]?.expectedRevision ?? null;
  const outputs = [];
  for (const step of plan) {
    if (revision !== step.expectedRevision) throw new Error("OVERLAY_REVISION_CHAIN_BROKEN");
    const result = await runCommand(capBin, stepArguments(step, projectPath));
    let output;
    try {
      output = JSON.parse(result.stdout);
    } catch {
      throw new Error("CAP_CLI_INVALID_JSON");
    }
    if (output.ok !== true || output.revision !== step.expectedRevision + 1) {
      throw new Error("CAP_CLI_REVISION_MISMATCH");
    }
    revision = output.revision;
    outputs.push(output);
  }
  return {ok: true, revision, outputs};
}

async function main(argv) {
  const [command, inputPath, outputPath] = argv;
  if (!["validate", "freeze", "plan", "apply"].includes(command) || !inputPath) {
    throw new Error("用法: postproduction-package.mjs validate <package.json> | freeze <package.json> <output.json> | plan <frozen.json> <assets.json> | apply <frozen.json> <assets.json>");
  }
  const value = JSON.parse(await readFile(resolve(inputPath), "utf8"));
  if (command === "validate") {
    const result = validatePostproductionPackage(value);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 2;
    return;
  }
  if (command === "freeze") {
    if (!outputPath) throw new Error("freeze 需要输出路径");
    const [edlContent, mappingContent] = await Promise.all([
      readFile(value.edit.edlPath, "utf8"),
      readFile(value.edit.sourceToFinalMapPath, "utf8"),
    ]);
    await writeFile(resolve(outputPath), `${JSON.stringify(freezePostproductionPackage(value, {edlContent, mappingContent}), null, 2)}\n`);
    return;
  }
  if (!outputPath) throw new Error(`${command} 需要 assets.json`);
  const assets = JSON.parse(await readFile(resolve(outputPath), "utf8"));
  const frozenCheck = await verifyFrozenPackageFiles(value);
  if (!frozenCheck.ok) throw new Error(`FROZEN_MAPPING_STALE:${frozenCheck.errors.join(",")}`);
  const plan = buildOverlayCommandPlan(value, assets);
  if (command === "plan") {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  const result = await executeOverlayCommandPlan(plan, {
    capBin: process.env.CAP_BIN ?? "cap",
    projectPath: value.capProject.path,
  });
  process.stdout.write(`${JSON.stringify({ok: true, revision: result.revision, steps: result.outputs.length})}\n`);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((failure) => {
    process.stderr.write(`${JSON.stringify({ok: false, code: failure.message, errors: failure.errors ?? []})}\n`);
    process.exitCode = 1;
  });
}
