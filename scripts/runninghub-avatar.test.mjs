import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {test} from "node:test";

import {
  buildAvatarNodeInfoList,
  groupAvatarJobs,
  runAvatarBatch,
  runAvatarManifest,
  runAvatarJob,
  sanitizeRunningHubFailure,
  splitAvatarSegments,
} from "./runninghub-avatar.mjs";

const bytes = (value) => new TextEncoder().encode(value);
const hash = (value) => createHash("sha256").update(bytes(value)).digest("hex");

test("only sends final audio and locked workflow controls", () => {
  const nodes = buildAvatarNodeInfoList("uploaded-audio.wav");
  assert.deepEqual(nodes, [
    {nodeId: "94", fieldName: "audio", fieldValue: "uploaded-audio.wav"},
    {nodeId: "234", fieldName: "value", fieldValue: "false"},
    {nodeId: "233", fieldName: "value", fieldValue: "false"},
    {nodeId: "241", fieldName: "select", fieldValue: "2"},
    {nodeId: "244", fieldName: "select", fieldValue: "1"},
  ]);
  assert.equal(nodes.some((node) => ["80", "169"].includes(node.nodeId)), false);
});

test("splits over 40 seconds only at supplied semantic boundaries", () => {
  const parts = splitAvatarSegments(
    {id: "avatar-1", start: 0, end: 91, continuityGroup: "g1"},
    [18, 39, 61, 79],
  );
  assert.deepEqual(parts.map(({start, end}) => [start, end]), [[0, 39], [39, 79], [79, 91]]);
  assert(parts.every((part) => part.end - part.start <= 40));
});

test("refuses to invent a split when no semantic boundary can satisfy the hard limit", () => {
  assert.throws(
    () => splitAvatarSegments({id: "avatar-1", start: 0, end: 50}, []),
    /SEMANTIC_BOUNDARY_REQUIRED/,
  );
});

test("continuity groups stay ordered while independent groups may share five lanes", () => {
  const jobs = Array.from({length: 8}, (_, index) => ({
    id: `job-${index}`,
    continuityGroup: index < 3 ? "same" : `independent-${index}`,
    order: index < 3 ? index + 1 : 1,
  }));
  const groups = groupAvatarJobs(jobs, 5);
  assert.equal(groups.maxConcurrency, 5);
  assert.deepEqual(groups.groups.find((group) => group.id === "same").jobs.map((job) => job.id), ["job-0", "job-1", "job-2"]);
});

test("batch runs each continuity group in order with at most five active groups", async () => {
  const jobs = [
    {id: "a-1", continuityGroup: "a", order: 1},
    {id: "a-2", continuityGroup: "a", order: 2},
    {id: "b-1", continuityGroup: "b", order: 1},
    {id: "c-1", continuityGroup: "c", order: 1},
    {id: "d-1", continuityGroup: "d", order: 1},
    {id: "e-1", continuityGroup: "e", order: 1},
    {id: "f-1", continuityGroup: "f", order: 1},
  ];
  let active = 0;
  let peak = 0;
  const events = [];
  const result = await runAvatarBatch(jobs, {
    maxConcurrency: 5,
    runJob: async (job) => {
      active += 1;
      peak = Math.max(peak, active);
      events.push(`start:${job.id}`);
      await new Promise((accept) => setTimeout(accept, 2));
      events.push(`end:${job.id}`);
      active -= 1;
      if (job.id === "f-1") throw new Error("Bearer secret https://temporary/result");
      return {status: "SUCCESS", id: job.id};
    },
  });
  assert(peak <= 5);
  assert(events.indexOf("end:a-1") < events.indexOf("start:a-2"));
  assert.equal(result.succeeded.length, 6);
  assert.deepEqual(result.failed.map((item) => item.id), ["f-1"]);
  assert.equal(JSON.stringify(result.failed).includes("secret"), false);
  assert.deepEqual(result.retryJobIds, ["f-1"]);
});

test("run uses upload then safe node list then query and immediate download", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({url, options});
    if (url.endsWith("/media/upload/binary")) return Response.json({code: 0, data: {fileName: "server.wav"}});
    if (url.includes("/run/ai-app/")) return Response.json({taskId: "task-1", status: "RUNNING", results: null});
    if (url.endsWith("/query")) return Response.json({taskId: "task-1", status: "SUCCESS", results: [{url: "https://download/result.mp4"}]});
    if (url === "https://download/result.mp4") return new Response(new Uint8Array([1, 2, 3]));
    throw new Error(`unexpected ${url}`);
  };
  const writes = [];
  const result = await runAvatarJob({
    apiKey: "secret-value",
    audioPath: "/tmp/input.wav",
    outputPath: "/tmp/avatar.mp4",
    fetchImpl,
    readAudio: async () => new Uint8Array([9]),
    writeOutput: async (path, bytes) => writes.push({path, bytes: [...bytes]}),
    wait: async () => {},
  });
  assert.equal(result.status, "SUCCESS");
  assert.deepEqual(writes, [{path: "/tmp/avatar.mp4", bytes: [1, 2, 3]}]);
  const runBody = JSON.parse(calls[1].options.body);
  assert.deepEqual(runBody.nodeInfoList, buildAvatarNodeInfoList("server.wav"));
  assert.equal(JSON.stringify(calls).includes("secret-value"), false, "test records must not retain the secret");
});

test("sanitized failures remove bearer tokens and expiring URLs", () => {
  const failure = sanitizeRunningHubFailure({
    message: "Authorization: Bearer super-secret",
    url: "https://temporary.example/result.mp4?token=secret",
    response: {code: 500, msg: "failed"},
  });
  assert.equal(JSON.stringify(failure).includes("super-secret"), false);
  assert.equal(JSON.stringify(failure).includes("temporary.example"), false);
});

test("manifest execution only consumes frozen final-main-audio jobs and persists retry IDs", async () => {
  const writes = [];
  const result = await runAvatarManifest({
    schema: "laohu.runninghub-avatar-audio-jobs/1",
    videoId: "video-1",
    sourceAudioPath: "/tmp/final-main.wav",
    sourceAudioSha256: hash("source"),
    edlSha256: "b".repeat(64),
    mappingSha256: "c".repeat(64),
    jobs: [
      {id: "a", source: "FINAL_MAIN_AUDIO", audioPath: "/tmp/a.wav", audioSha256: hash("a"), continuityGroup: "g1", order: 1},
      {id: "b", source: "FINAL_MAIN_AUDIO", audioPath: "/tmp/b.wav", audioSha256: hash("b"), continuityGroup: "g2", order: 1},
    ],
  }, {
    outputDir: "/tmp/avatar-results",
    apiKey: "secret",
    makeDirectory: async () => {},
    readBytes: async (path) => bytes(path.endsWith("final-main.wav") ? "source" : path.endsWith("a.wav") ? "a" : "b"),
    runJob: async ({audioPath, outputPath}) => {
      if (audioPath.endsWith("b.wav")) throw new Error("Bearer secret https://temporary/result");
      return {status: "SUCCESS", outputPath};
    },
    writeResult: async (path, content) => writes.push({path, content}),
  });
  assert.deepEqual(result.retryJobIds, ["b"]);
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(writes.length, 1);
});

test("manifest execution rejects a segment audio file changed after export", async () => {
  await assert.rejects(runAvatarManifest({
    schema: "laohu.runninghub-avatar-audio-jobs/1",
    videoId: "video-1",
    sourceAudioPath: "/tmp/final-main.wav",
    sourceAudioSha256: hash("source"),
    edlSha256: "b".repeat(64),
    mappingSha256: "c".repeat(64),
    jobs: [{
      id: "a",
      source: "FINAL_MAIN_AUDIO",
      audioPath: "/tmp/a.wav",
      audioSha256: hash("original"),
      continuityGroup: "g1",
      order: 1,
    }],
  }, {
    outputDir: "/tmp/avatar-results",
    apiKey: "secret",
    makeDirectory: async () => {},
    readBytes: async (path) => bytes(path.endsWith("final-main.wav") ? "source" : "tampered"),
  }), /AVATAR_JOB_AUDIO_HASH_MISMATCH:a/);
});

test("failed-only retry keeps prior successes and appends an auditable attempt", async () => {
  const manifest = {
    schema: "laohu.runninghub-avatar-audio-jobs/1",
    videoId: "video-1",
    sourceAudioPath: "/tmp/final-main.wav",
    sourceAudioSha256: hash("source"),
    edlSha256: "b".repeat(64),
    mappingSha256: "c".repeat(64),
    jobs: [
      {id: "a", source: "FINAL_MAIN_AUDIO", audioPath: "/tmp/a.wav", audioSha256: hash("a"), continuityGroup: "g1", order: 1},
      {id: "b", source: "FINAL_MAIN_AUDIO", audioPath: "/tmp/b.wav", audioSha256: hash("b"), continuityGroup: "g2", order: 1},
    ],
  };
  const previousResult = {
    schema: "laohu.runninghub-avatar-results/1",
    attempt: 1,
    succeeded: [{id: "a", continuityGroup: "g1", result: {status: "SUCCESS", outputPath: "/tmp/a.mp4"}}],
    failed: [{id: "b", continuityGroup: "g2", error: {code: "TASK_FAILED"}}],
    retryJobIds: ["b"],
    history: [{attempt: 1, retriedJobIds: [], succeededIds: ["a"], failedIds: ["b"]}],
  };
  const result = await runAvatarManifest(manifest, {
    outputDir: "/tmp/avatar-results",
    apiKey: "secret",
    retryJobIds: ["b"],
    previousResult,
    makeDirectory: async () => {},
    readBytes: async (path) => bytes(path.endsWith("final-main.wav") ? "source" : path.endsWith("a.wav") ? "a" : "b"),
    runJob: async ({outputPath}) => ({status: "SUCCESS", outputPath}),
    writeResult: async () => {},
  });
  assert.deepEqual(result.succeeded.map(({id}) => id).sort(), ["a", "b"]);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.retryJobIds, []);
  assert.equal(result.attempt, 2);
  assert.equal(result.history.length, 2);
});

test("manifest execution rejects jobs not bound to final main audio", async () => {
  await assert.rejects(runAvatarManifest({
    schema: "laohu.runninghub-avatar-audio-jobs/1",
    sourceAudioPath: "/tmp/final-main.wav",
    sourceAudioSha256: "a".repeat(64),
    edlSha256: "b".repeat(64),
    mappingSha256: "c".repeat(64),
    jobs: [{id: "bad", source: "SCRIPT_TEXT", audioPath: "/tmp/bad.wav", audioSha256: "d".repeat(64)}],
  }, {outputDir: "/tmp/avatar-results", apiKey: "secret"}), /AVATAR_JOB_NOT_BOUND_TO_FINAL_AUDIO/);
});
