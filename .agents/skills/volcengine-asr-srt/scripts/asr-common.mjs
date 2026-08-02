import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {homedir} from "node:os";

export const DEFAULT_ENV_PATH = `${homedir()}/.config/laohu/volcengine-asr.env`;

const parseEnv = (raw) => {
  const values = {};
  for (const sourceLine of raw.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
};

export const loadConfig = async (envPath = DEFAULT_ENV_PATH) => {
  const fileValues = parseEnv(await readFile(envPath, "utf8"));
  const values = {...fileValues, ...process.env};
  const apiKey = values.VOLCENGINE_SPEECH_API_KEY;
  const appId = values.VOLCENGINE_SPEECH_APP_ID;
  const accessToken = values.VOLCENGINE_SPEECH_ACCESS_TOKEN;
  if (!apiKey && (!appId || !accessToken)) {
    throw new Error("Missing ASR configuration: provide VOLCENGINE_SPEECH_API_KEY or both VOLCENGINE_SPEECH_APP_ID and VOLCENGINE_SPEECH_ACCESS_TOKEN");
  }
  return {
    apiKey,
    appId,
    accessToken,
    authMode: apiKey ? "api_key" : "app_id_access_token",
    resourceId: values.VOLCENGINE_SPEECH_RESOURCE_ID ?? "volc.seedasr.auc",
    submitUrl: values.VOLCENGINE_SPEECH_SUBMIT_URL ?? "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit",
    queryUrl: values.VOLCENGINE_SPEECH_QUERY_URL ?? "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query",
    flashResourceId: values.VOLCENGINE_SPEECH_FLASH_RESOURCE_ID ?? "volc.bigasr.auc_turbo",
    flashUrl: values.VOLCENGINE_SPEECH_FLASH_URL ?? "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash",
  };
};

export const createTaskId = () => randomUUID();

export const createHeaders = (config, taskId, {submit = false, resourceId = config.resourceId} = {}) => ({
  "Content-Type": "application/json",
  ...(config.apiKey
    ? {"X-Api-Key": config.apiKey}
    : {
        "X-Api-App-Key": config.appId,
        "X-Api-Access-Key": config.accessToken,
      }),
  "X-Api-Resource-Id": resourceId,
  "X-Api-Request-Id": taskId,
  ...(submit ? {"X-Api-Sequence": "-1"} : {}),
});

export const postJson = async (url, headers, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let payload = {};
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error(`ASR returned non-JSON content (HTTP ${response.status})`);
    }
  }
  return {
    httpStatus: response.status,
    statusCode: response.headers.get("x-api-status-code") ?? "",
    message: response.headers.get("x-api-message") ?? "",
    logId: response.headers.get("x-tt-logid") ?? "",
    payload,
  };
};

export const getResultObject = (payload) => {
  if (Array.isArray(payload?.result)) return payload.result[0] ?? null;
  return payload?.result ?? null;
};

export const getUtterances = (payload) => {
  const result = getResultObject(payload);
  return Array.isArray(result?.utterances) ? result.utterances : [];
};

export const formatSrtTime = (milliseconds) => {
  const total = Math.max(0, Math.round(Number(milliseconds)));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
};

export const buildSrt = (payload) => {
  const utterances = getUtterances(payload)
    .map((item) => ({
      start: Number(item.start_time),
      end: Number(item.end_time),
      text: String(item.text ?? "").trim(),
    }))
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start && item.text)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (utterances.length === 0) {
    throw new Error("ASR result contains no timestamped utterances");
  }

  return `${utterances.map((item, index) => [
    index + 1,
    `${formatSrtTime(item.start)} --> ${formatSrtTime(item.end)}`,
    item.text,
  ].join("\n")).join("\n\n")}\n`;
};

export const parseArgs = (argv) => {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = next;
      index += 1;
    }
  }
  return options;
};

export const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
