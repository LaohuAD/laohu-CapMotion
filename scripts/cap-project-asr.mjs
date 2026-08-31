#!/usr/bin/env node

import {spawn} from "node:child_process";
import {existsSync} from "node:fs";
import {access, mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, extname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {
  formatSrtTime,
  getUtterances,
  parseArgs,
} from "../.agents/skills/volcengine-asr-srt/scripts/asr-common.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(SCRIPT_DIR);
const ASR_SCRIPT_DIR = join(PROJECT_ROOT, ".agents", "skills", "volcengine-asr-srt", "scripts");
const DIRECT_FLASH_FORMATS = new Set([".mp3", ".ogg", ".wav"]);
const FFPROBE_BIN = process.env.FFPROBE_BIN
  ?? (existsSync("/opt/homebrew/opt/ffmpeg@7/bin/ffprobe") ? "/opt/homebrew/opt/ffmpeg@7/bin/ffprobe" : "ffprobe");

const roundSeconds = (value) => Number(Number(value).toFixed(6));

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const readOptionalJson = async (path, fallback) => {
  try {
    return await readJson(path);
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
};

const ensureFile = async (path, role) => {
  try {
    await access(path);
  } catch {
    throw new Error(`${role} does not exist: ${path}`);
  }
};

const defaultProbeDuration = async (path) => {
  const output = await runProcess(FFPROBE_BIN, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    path,
  ]);
  const duration = Number(output.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Unable to determine a positive duration for ${path}`);
  }
  return duration;
};

const startTime = (media) => {
  const value = media?.start_time ?? media?.startTime;
  return Number.isFinite(Number(value)) ? Number(value) : null;
};

const sourceOffset = (segment, microphone) => {
  const starts = [segment.display, segment.camera, microphone, segment.system_audio ?? segment.systemAudio]
    .map(startTime)
    .filter((value) => value !== null);
  const micStart = startTime(microphone);
  if (starts.length === 0 || micStart === null) return 0;
  return Math.max(0, Math.max(...starts) - micStart);
};

const absoluteMediaPath = (projectPath, media) => {
  if (!media?.path) return null;
  return resolve(projectPath, String(media.path).replaceAll("\\", "/"));
};

const timelineSnapshot = (config) => {
  const segments = config?.timeline?.segments;
  if (!Array.isArray(segments)) return [];
  return segments.map((segment, timelineIndex) => ({
    timelineIndex,
    recordingSegment: Number(segment.recordingSegment ?? 0),
    start: Number(segment.start),
    end: Number(segment.end),
    timescale: Number(segment.timescale ?? 1),
  }));
};

export async function buildCapAsrSourceIndex(projectInput, {probeDuration = defaultProbeDuration} = {}) {
  const projectPath = resolve(projectInput);
  const metaPath = join(projectPath, "recording-meta.json");
  const configPath = join(projectPath, "project-config.json");
  const meta = await readJson(metaPath);
  const config = await readOptionalJson(configPath, {});
  const timeline = timelineSnapshot(config);

  let recordingType;
  let sources;
  if (Array.isArray(meta.segments)) {
    recordingType = "studio-multiple-segments";
    sources = meta.segments.map((segment, recordingSegment) => ({
      recordingSegment,
      display: segment.display,
      microphone: segment.mic ?? segment.audio,
      segment,
    }));
  } else if (meta.display) {
    recordingType = "studio-single-segment";
    sources = [{
      recordingSegment: 0,
      display: meta.display,
      microphone: meta.audio ?? meta.mic,
      segment: meta,
    }];
  } else if (Number.isFinite(Number(meta.fps))) {
    recordingType = "instant-embedded-audio";
    const output = {path: "content/output.mp4"};
    sources = [{recordingSegment: 0, display: output, microphone: output, segment: meta}];
  } else {
    throw new Error(`Unsupported or incomplete Cap recording metadata: ${metaPath}`);
  }

  if (sources.length === 0) throw new Error("Cap project has no recording segments");

  const segments = [];
  let globalOffsetSeconds = 0;
  for (const source of sources) {
    if (!source.microphone) {
      throw new Error(`Recording segment ${source.recordingSegment} has no microphone track`);
    }
    const displayPath = absoluteMediaPath(projectPath, source.display);
    const microphonePath = absoluteMediaPath(projectPath, source.microphone);
    await ensureFile(displayPath, `Recording segment ${source.recordingSegment} display`);
    await ensureFile(microphonePath, `Recording segment ${source.recordingSegment} microphone`);
    const displayDurationSeconds = Number(await probeDuration(displayPath));
    const microphoneDurationSeconds = Number(await probeDuration(microphonePath));
    if (!Number.isFinite(displayDurationSeconds) || displayDurationSeconds <= 0) {
      throw new Error(`Invalid display duration for recording segment ${source.recordingSegment}`);
    }
    if (!Number.isFinite(microphoneDurationSeconds) || microphoneDurationSeconds <= 0) {
      throw new Error(`Invalid microphone duration for recording segment ${source.recordingSegment}`);
    }
    const sourceTimelineOffsetSeconds = recordingType === "instant-embedded-audio"
      ? 0
      : sourceOffset(source.segment, source.microphone);

    segments.push({
      recordingSegment: source.recordingSegment,
      displayPath,
      microphonePath,
      displayDurationSeconds: roundSeconds(displayDurationSeconds),
      microphoneDurationSeconds: roundSeconds(microphoneDurationSeconds),
      microphoneStartTime: startTime(source.microphone),
      sourceTimelineOffsetSeconds: roundSeconds(sourceTimelineOffsetSeconds),
      globalOffsetSeconds: roundSeconds(globalOffsetSeconds),
      timelineReferences: timeline
        .filter((item) => item.recordingSegment === source.recordingSegment)
        .map((item) => item.timelineIndex),
    });
    globalOffsetSeconds += displayDurationSeconds;
  }

  return {
    schema: "laohu.cap-asr-source-index/1",
    purpose: "first-pass-content-transcription",
    projectPath,
    projectName: String(meta.pretty_name ?? meta.prettyName ?? ""),
    projectRevision: Number(config.projectRevision ?? 0),
    recordingType,
    orderPolicy: "recording-meta-segments",
    timeBasis: "raw-recording-display-timeline",
    recordingMetaPath: metaPath,
    projectConfigPath: configPath,
    segments,
    timeline,
  };
}

const mapWords = (words, baseMs) => Array.isArray(words)
  ? words.map((word) => {
    const sourceStartMs = Number(word.start_time ?? word.startTime);
    const sourceEndMs = Number(word.end_time ?? word.endTime);
    return {
      text: String(word.text ?? word.word ?? ""),
      sourceStartMs: Number.isFinite(sourceStartMs) ? sourceStartMs : null,
      sourceEndMs: Number.isFinite(sourceEndMs) ? sourceEndMs : null,
      globalStartMs: Number.isFinite(sourceStartMs) ? Math.round(baseMs + sourceStartMs) : null,
      globalEndMs: Number.isFinite(sourceEndMs) ? Math.round(baseMs + sourceEndMs) : null,
    };
  })
  : [];

export function mergeSegmentTranscripts(sourceIndex, segmentResults) {
  if (sourceIndex.segments.length !== segmentResults.length) {
    throw new Error("Segment result count does not match the Cap source index");
  }

  const utterances = [];
  const segmentTrace = [];
  for (let index = 0; index < sourceIndex.segments.length; index += 1) {
    const source = sourceIndex.segments[index];
    const result = segmentResults[index];
    const baseMs = (Number(source.globalOffsetSeconds) + Number(source.sourceTimelineOffsetSeconds)) * 1000;
    const sourceUtterances = getUtterances(result.payload);
    segmentTrace.push({
      recordingSegment: source.recordingSegment,
      rawJson: result.rawJson,
      cueCount: sourceUtterances.length,
    });
    for (const utterance of sourceUtterances) {
      const sourceStartMs = Number(utterance.start_time ?? utterance.startTime);
      const sourceEndMs = Number(utterance.end_time ?? utterance.endTime);
      const text = String(utterance.text ?? "").trim();
      if (!Number.isFinite(sourceStartMs) || !Number.isFinite(sourceEndMs) || sourceEndMs <= sourceStartMs || !text) {
        continue;
      }
      utterances.push({
        recordingSegment: source.recordingSegment,
        sourceStartMs,
        sourceEndMs,
        sourceTimelineStartMs: Math.round(source.sourceTimelineOffsetSeconds * 1000 + sourceStartMs),
        sourceTimelineEndMs: Math.round(source.sourceTimelineOffsetSeconds * 1000 + sourceEndMs),
        globalStartMs: Math.round(baseMs + sourceStartMs),
        globalEndMs: Math.round(baseMs + sourceEndMs),
        text,
        words: mapWords(utterance.words, baseMs),
      });
    }
  }
  utterances.sort((left, right) => left.globalStartMs - right.globalStartMs || left.globalEndMs - right.globalEndMs);
  if (utterances.length === 0) throw new Error("ASR results contain no timestamped utterances");

  const srt = `${utterances.map((item, index) => [
    index + 1,
    `${formatSrtTime(item.globalStartMs)} --> ${formatSrtTime(item.globalEndMs)}`,
    item.text,
  ].join("\n")).join("\n\n")}\n`;
  const text = `${utterances.map((item) => item.text).join("\n")}\n`;
  const captionImport = buildCapCaptionImport(utterances);
  return {
    raw: {
      schema: "laohu.cap-asr-transcript/1",
      purpose: "first-pass-content-transcription",
      projectPath: sourceIndex.projectPath,
      projectRevision: sourceIndex.projectRevision,
      timeBasis: sourceIndex.timeBasis,
      segments: segmentTrace,
      utterances,
    },
    srt,
    text,
    captionImport,
  };
}

export function buildCapCaptionImport(utterances) {
  return {
    sourceTimed: true,
    segments: utterances.map((item, index) => ({
      id: `asr-${item.recordingSegment}-${item.globalStartMs}-${index + 1}`,
      start: roundSeconds(item.globalStartMs / 1000),
      end: roundSeconds(item.globalEndMs / 1000),
      text: item.text,
      words: item.words
        .filter((word) => word.text.trim()
          && Number.isFinite(word.globalStartMs)
          && Number.isFinite(word.globalEndMs)
          && word.globalEndMs > word.globalStartMs)
        .map((word) => ({
          text: word.text,
          start: roundSeconds(word.globalStartMs / 1000),
          end: roundSeconds(word.globalEndMs / 1000),
        })),
    })),
  };
}

function runProcess(command, args, {cwd = PROJECT_ROOT} = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {cwd, stdio: ["ignore", "pipe", "pipe"]});
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise({stdout, stderr});
      else reject(new Error(`${command} exited with ${code}: ${(stderr || stdout).trim()}`));
    });
  });
}

const recognizeCapProject = async ({project, outputDir, planOnly = false, speaker = false}) => {
  const outputPath = resolve(outputDir);
  await mkdir(outputPath, {recursive: true});
  const sourceIndex = await buildCapAsrSourceIndex(project);
  const sourceIndexPath = join(outputPath, "source-index.json");
  await writeFile(sourceIndexPath, `${JSON.stringify(sourceIndex, null, 2)}\n`, "utf8");
  if (planOnly) {
    return {status: "planned", sourceIndex: sourceIndexPath, segmentCount: sourceIndex.segments.length};
  }

  const segmentOutputDir = join(outputPath, "segments");
  await mkdir(segmentOutputDir, {recursive: true});
  const tempDir = await mkdtemp(join(tmpdir(), "cap-project-asr-"));
  const segmentResults = [];
  try {
    for (const source of sourceIndex.segments) {
      const label = String(source.recordingSegment).padStart(3, "0");
      const rawJson = join(segmentOutputDir, `${label}.raw.json`);
      const segmentSrt = join(segmentOutputDir, `${label}.srt`);
      const extension = extname(source.microphonePath).toLowerCase();
      let asrInput = source.microphonePath;
      if (!DIRECT_FLASH_FORMATS.has(extension)) {
        asrInput = join(tempDir, `${label}.asr.mp3`);
        await runProcess("bash", [join(ASR_SCRIPT_DIR, "extract-audio.sh"), source.microphonePath, asrInput]);
      }
      const args = [
        join(ASR_SCRIPT_DIR, "transcribe-flash.mjs"),
        "--file", asrInput,
        "--json", rawJson,
        "--srt", segmentSrt,
        "--media", source.microphonePath,
      ];
      if (speaker) args.push("--speaker");
      await runProcess(process.execPath, args);
      segmentResults.push({rawJson, segmentSrt, payload: await readJson(rawJson)});
    }
  } finally {
    await rm(tempDir, {recursive: true, force: true});
  }

  const merged = mergeSegmentTranscripts(sourceIndex, segmentResults);
  const rawJsonPath = join(outputPath, "cap-asr.raw.json");
  const srtPath = join(outputPath, "cap-asr.srt");
  const textPath = join(outputPath, "cap-asr.txt");
  const captionImportPath = join(outputPath, "cap-captions.import.json");
  await Promise.all([
    writeFile(rawJsonPath, `${JSON.stringify(merged.raw, null, 2)}\n`, "utf8"),
    writeFile(srtPath, merged.srt, "utf8"),
    writeFile(textPath, merged.text, "utf8"),
    writeFile(captionImportPath, `${JSON.stringify(merged.captionImport, null, 2)}\n`, "utf8"),
  ]);
  const runRecord = {
    schema: "laohu.cap-asr-run/1",
    status: "complete",
    projectPath: sourceIndex.projectPath,
    projectRevision: sourceIndex.projectRevision,
    sourceIndex: sourceIndexPath,
    rawJson: rawJsonPath,
    srt: srtPath,
    text: textPath,
    captionImport: captionImportPath,
    segmentRawJson: segmentResults.map((item) => item.rawJson),
    cueCount: merged.raw.utterances.length,
  };
  const runRecordPath = join(outputPath, "run.json");
  await writeFile(runRecordPath, `${JSON.stringify(runRecord, null, 2)}\n`, "utf8");
  return {...runRecord, runRecord: runRecordPath};
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (!options.project || !options["output-dir"]) {
    console.error("Usage: node scripts/cap-project-asr.mjs --project <recording.cap> --output-dir <directory> [--plan-only] [--speaker]");
    process.exit(2);
  }
  try {
    const result = await recognizeCapProject({
      project: options.project,
      outputDir: options["output-dir"],
      planOnly: Boolean(options["plan-only"]),
      speaker: Boolean(options.speaker),
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      schema: "laohu.cap-asr-run/1",
      status: "failed",
      error: String(error?.message ?? error),
    }, null, 2));
    process.exit(1);
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
