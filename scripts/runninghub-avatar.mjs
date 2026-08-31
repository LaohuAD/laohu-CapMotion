#!/usr/bin/env node
import {createHash} from "node:crypto";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {basename, isAbsolute, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

export const RUNNINGHUB_ENDPOINTS = Object.freeze({
  upload: "https://www.runninghub.ai/openapi/v2/media/upload/binary",
  run: "https://www.runninghub.ai/openapi/v2/run/ai-app/2089349363716960258",
  query: "https://www.runninghub.ai/openapi/v2/query",
});

// 241/244 are preserved from the user's exported workflow request. Their UI labels
// are not proven by the supplied API document, so callers must report that QA as OBSERVE.
export const WORKFLOW_EXPORT_SELECTS = Object.freeze({node241: "2", node244: "1", semanticStatus: "OBSERVE"});

export function buildAvatarNodeInfoList(uploadedAudioFile) {
  if (!uploadedAudioFile) throw new Error("UPLOADED_AUDIO_REQUIRED");
  return [
    {nodeId: "94", fieldName: "audio", fieldValue: uploadedAudioFile},
    {nodeId: "234", fieldName: "value", fieldValue: "false"},
    {nodeId: "233", fieldName: "value", fieldValue: "false"},
    {nodeId: "241", fieldName: "select", fieldValue: WORKFLOW_EXPORT_SELECTS.node241},
    {nodeId: "244", fieldName: "select", fieldValue: WORKFLOW_EXPORT_SELECTS.node244},
  ];
}

export function splitAvatarSegments(segment, semanticBoundaries) {
  if (!(segment.end > segment.start)) throw new Error("INVALID_SEGMENT_RANGE");
  if (segment.end - segment.start <= 40) return [{...segment, order: segment.order ?? 1}];
  const boundaries = [...new Set(semanticBoundaries)]
    .filter((point) => point > segment.start && point < segment.end)
    .sort((a, b) => a - b);
  const parts = [];
  let cursor = segment.start;
  let index = 0;
  while (segment.end - cursor > 40) {
    const limit = cursor + 40;
    const candidates = boundaries.filter((point) => point > cursor && point <= limit);
    const next = candidates.at(-1);
    if (!next) throw new Error("SEMANTIC_BOUNDARY_REQUIRED");
    parts.push({...segment, id: `${segment.id}-${String(++index).padStart(2, "0")}`, start: cursor, end: next, order: index});
    cursor = next;
  }
  parts.push({...segment, id: `${segment.id}-${String(++index).padStart(2, "0")}`, start: cursor, end: segment.end, order: index});
  return parts;
}

export function groupAvatarJobs(jobs, maxConcurrency = 5) {
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 5) {
    throw new Error("MAX_CONCURRENCY_MUST_BE_1_TO_5");
  }
  const byGroup = new Map();
  for (const job of jobs) {
    const id = job.continuityGroup || job.id;
    if (!byGroup.has(id)) byGroup.set(id, []);
    byGroup.get(id).push(job);
  }
  return {
    maxConcurrency,
    groups: [...byGroup].map(([id, groupJobs]) => ({
      id,
      jobs: groupJobs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    })),
  };
}

export async function runAvatarBatch(jobs, {maxConcurrency = 5, runJob}) {
  if (typeof runJob !== "function") throw new Error("RUN_JOB_REQUIRED");
  const schedule = groupAvatarJobs(jobs, maxConcurrency);
  const succeeded = [];
  const failed = [];
  let nextGroup = 0;
  const worker = async () => {
    while (true) {
      const groupIndex = nextGroup++;
      const group = schedule.groups[groupIndex];
      if (!group) return;
      for (const job of group.jobs) {
        try {
          succeeded.push({id: job.id, continuityGroup: group.id, result: await runJob(job)});
        } catch (failure) {
          failed.push({id: job.id, continuityGroup: group.id, error: sanitizeRunningHubFailure(failure)});
        }
      }
    }
  };
  await Promise.all(Array.from({length: Math.min(schedule.maxConcurrency, schedule.groups.length)}, () => worker()));
  return {succeeded, failed, retryJobIds: failed.map(({id}) => id)};
}

const authHeaders = (apiKey, json = false) => {
  if (!apiKey) throw new Error("RUNNINGHUB_API_KEY_MISSING");
  const headers = new Headers({Authorization: `Bearer ${apiKey}`});
  if (json) headers.set("Content-Type", "application/json");
  return headers;
};

const responseJson = async (response, step) => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || (body.code !== undefined && body.code !== 0)) {
    const failure = new Error(`${step}_FAILED`);
    failure.response = body;
    throw failure;
  }
  return body;
};

export function sanitizeRunningHubFailure(failure) {
  const rawMessage = String(failure?.message ?? "RUNNINGHUB_FAILED")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/https?:\/\/\S+/gi, "[EXPIRING_URL_REDACTED]");
  return {
    code: rawMessage,
    responseCode: failure?.response?.code ?? null,
    responseMessage: String(failure?.response?.msg ?? failure?.response?.message ?? "").replace(/https?:\/\/\S+/gi, "[EXPIRING_URL_REDACTED]"),
  };
}

export async function runAvatarJob({
  apiKey,
  audioPath,
  outputPath,
  fetchImpl = fetch,
  readAudio = readFile,
  writeOutput = writeFile,
  wait = (milliseconds) => new Promise((accept) => setTimeout(accept, milliseconds)),
  pollIntervalMs = 3000,
  maxPolls = 1200,
}) {
  const audio = await readAudio(audioPath);
  const form = new FormData();
  form.append("file", new Blob([audio]), basename(audioPath));
  const uploadResponse = await fetchImpl(RUNNINGHUB_ENDPOINTS.upload, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: form,
  });
  const uploaded = await responseJson(uploadResponse, "UPLOAD");
  const uploadedAudioFile = uploaded.data?.fileName ?? uploaded.data?.file_name ?? uploaded.data?.download_url;
  if (!uploadedAudioFile) throw new Error("UPLOAD_RESULT_MISSING_FILE_VALUE");

  const runResponse = await fetchImpl(RUNNINGHUB_ENDPOINTS.run, {
    method: "POST",
    headers: authHeaders(apiKey, true),
    body: JSON.stringify({nodeInfoList: buildAvatarNodeInfoList(uploadedAudioFile)}),
  });
  const submitted = await responseJson(runResponse, "SUBMIT");
  const taskId = submitted.taskId ?? submitted.task_id ?? submitted.data?.taskId ?? submitted.data?.task_id;
  if (!taskId) throw new Error("SUBMIT_RESULT_MISSING_TASK_ID");

  for (let attempt = 1; attempt <= maxPolls; attempt += 1) {
    const queryResponse = await fetchImpl(RUNNINGHUB_ENDPOINTS.query, {
      method: "POST",
      headers: authHeaders(apiKey, true),
      body: JSON.stringify({taskId}),
    });
    const queried = await responseJson(queryResponse, "QUERY");
    const status = queried.status ?? queried.data?.status;
    if (status === "FAILED") {
      const failure = new Error("TASK_FAILED");
      failure.response = queried;
      throw failure;
    }
    if (status === "SUCCESS") {
      const results = queried.results ?? queried.data?.results;
      const resultUrl = results?.find((result) => result.url)?.url;
      if (!resultUrl) throw new Error("SUCCESS_RESULT_MISSING_URL");
      const mediaResponse = await fetchImpl(resultUrl);
      if (!mediaResponse.ok) throw new Error("RESULT_DOWNLOAD_FAILED");
      await writeOutput(outputPath, new Uint8Array(await mediaResponse.arrayBuffer()));
      return {status: "SUCCESS", taskId, outputPath, attempts: attempt};
    }
    await wait(pollIntervalMs);
  }
  throw new Error("QUERY_TIMEOUT");
}

export async function readRunningHubApiKey(envPath = `${process.env.HOME}/.config/laohu/runninghub.env`) {
  const text = await readFile(envPath, "utf8");
  const line = text.split(/\r?\n/).find((candidate) => candidate.trim().startsWith("RUNNINGHUB_API_KEY="));
  const value = line?.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
  if (!value) throw new Error("RUNNINGHUB_API_KEY_MISSING");
  return value;
}

export async function runAvatarManifest(manifest, {
  outputDir,
  apiKey,
  maxConcurrency = 5,
  retryJobIds = null,
  previousResult = null,
  readBytes = readFile,
  makeDirectory = (path) => mkdir(path, {recursive: true}),
  runJob = runAvatarJob,
  writeResult = (path, content) => writeFile(path, content),
} = {}) {
  if (manifest?.schema !== "laohu.runninghub-avatar-audio-jobs/1") throw new Error("AVATAR_JOB_MANIFEST_INVALID");
  if (!isAbsolute(outputDir ?? "")) throw new Error("AVATAR_OUTPUT_DIR_MUST_BE_ABSOLUTE");
  const hashPattern = /^[a-f0-9]{64}$/;
  if (!isAbsolute(manifest.sourceAudioPath ?? "")) throw new Error("AVATAR_SOURCE_AUDIO_PATH_INVALID");
  if (![manifest.sourceAudioSha256, manifest.edlSha256, manifest.mappingSha256].every((hash) => hashPattern.test(hash ?? ""))) {
    throw new Error("AVATAR_JOB_TRACE_HASH_MISSING");
  }
  if (!Array.isArray(manifest.jobs) || manifest.jobs.some((job) => (
    job.source !== "FINAL_MAIN_AUDIO"
    || !isAbsolute(job.audioPath ?? "")
    || !hashPattern.test(job.audioSha256 ?? "")
  ))) {
    throw new Error("AVATAR_JOB_NOT_BOUND_TO_FINAL_AUDIO");
  }
  const digest = (content) => createHash("sha256").update(content).digest("hex");
  if (digest(await readBytes(manifest.sourceAudioPath)) !== manifest.sourceAudioSha256) {
    throw new Error("FINAL_MAIN_AUDIO_HASH_MISMATCH");
  }
  for (const job of manifest.jobs) {
    if (digest(await readBytes(job.audioPath)) !== job.audioSha256) {
      throw new Error(`AVATAR_JOB_AUDIO_HASH_MISMATCH:${job.id}`);
    }
  }
  const retrySet = retryJobIds ? new Set(retryJobIds) : null;
  const jobs = retrySet ? manifest.jobs.filter((job) => retrySet.has(job.id)) : manifest.jobs;
  await makeDirectory(outputDir);
  const batch = await runAvatarBatch(jobs, {
    maxConcurrency,
    runJob: (job) => runJob({
      apiKey,
      audioPath: job.audioPath,
      outputPath: join(outputDir, `${job.id}.mp4`),
    }),
  });
  const retriedIds = new Set(jobs.map(({id}) => id));
  const succeededById = new Map((previousResult?.succeeded ?? []).map((item) => [item.id, item]));
  for (const item of batch.succeeded) succeededById.set(item.id, item);
  const failedById = new Map((previousResult?.failed ?? [])
    .filter((item) => !retriedIds.has(item.id))
    .map((item) => [item.id, item]));
  for (const item of batch.failed) failedById.set(item.id, item);
  for (const item of batch.succeeded) failedById.delete(item.id);
  const succeeded = [...succeededById.values()];
  const failed = [...failedById.values()];
  const attempt = Number(previousResult?.attempt ?? 0) + 1;
  const result = {
    schema: "laohu.runninghub-avatar-results/1",
    videoId: manifest.videoId,
    sourceAudioSha256: manifest.sourceAudioSha256,
    edlSha256: manifest.edlSha256,
    mappingSha256: manifest.mappingSha256,
    workflowSelectSemantics: WORKFLOW_EXPORT_SELECTS.semanticStatus,
    attempt,
    succeeded,
    failed,
    retryJobIds: failed.map(({id}) => id),
    history: [
      ...(previousResult?.history ?? []),
      {
        attempt,
        retriedJobIds: retryJobIds ?? [],
        succeededIds: batch.succeeded.map(({id}) => id),
        failedIds: batch.failed.map(({id}) => id),
      },
    ],
  };
  const resultPath = join(outputDir, "runninghub-results.json");
  await writeResult(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  return {...result, resultPath};
}

async function main(argv) {
  const values = Object.fromEntries(argv.flatMap((value, index) => value.startsWith("--") ? [[value.slice(2), argv[index + 1]]] : []));
  if (!values.jobs || !values["output-dir"]) {
    throw new Error("用法: runninghub-avatar.mjs --jobs <avatar-audio-jobs.json> --output-dir </absolute/task-dir> [--retry-from <runninghub-results.json>]");
  }
  const apiKey = await readRunningHubApiKey();
  try {
    const manifest = JSON.parse(await readFile(resolve(values.jobs), "utf8"));
    const previous = values["retry-from"] ? JSON.parse(await readFile(resolve(values["retry-from"]), "utf8")) : null;
    const result = await runAvatarManifest(manifest, {
      apiKey,
      outputDir: resolve(values["output-dir"]),
      retryJobIds: previous?.retryJobIds ?? null,
      previousResult: previous,
    });
    process.stdout.write(`${JSON.stringify({ok: true, resultPath: result.resultPath, succeeded: result.succeeded.length, failed: result.failed.length})}\n`);
  } catch (failure) {
    process.stderr.write(`${JSON.stringify(sanitizeRunningHubFailure(failure))}\n`);
    process.exitCode = 1;
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((failure) => {
    process.stderr.write(`${JSON.stringify(sanitizeRunningHubFailure(failure))}\n`);
    process.exitCode = 1;
  });
}
