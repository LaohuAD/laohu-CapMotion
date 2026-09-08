---
name: volcengine-asr-srt
description: Call Volcengine large-model recording-file ASR in flash Base64 or standard URL mode, then produce raw timestamped JSON and validated SRT. Use when the user asks for 火山引擎 ASR、豆包录音文件识别、文件转 SRT、重新识别字幕, or a no-GUI ASR step before rough or precise video editing.
---

# Volcengine ASR SRT

**声音先留证，文字后成稿。** 原始词级时码和录制段顺序比一份“看起来通顺”的文本更重要；识别负责忠实定位，不负责替内容导演删词。

Use the official flash API for eligible local audio and keep the asynchronous standard API as a fallback. Do not operate Jianying, install a local ASR engine, or print credentials.

## Cap Project Entry

第一遍 Cap 工程由上游“老胡文稿”在原任务直接调用，不创建后期任务：

```bash
node scripts/cap-project-asr.mjs \
  --project /absolute/recording.cap \
  --output-dir /absolute/asr-records
```

该入口按 `recording-meta.json.segments[]` 的真实录制顺序索引 `mic.path`，保留每段源时码和全局偏移，分别识别后产出 `source-index.json`、逐段 raw JSON/SRT、合并 `cap-asr.raw.json`、`cap-asr.srt`、`cap-asr.txt` 与 `run.json`。系统声音不静默混入麦克风 ASR；找不到麦克风轨时明确失败。

第二遍也先从 Cap 新识别，但其结果进入 `laohu-video-postproduction` 的 S2→T2 链路；第一遍结果不能替代第二遍时间轴。

## Configuration

Load credentials from:

```text
~/.config/laohu/volcengine-asr.env
```

On Windows, `~` means the current user home (for example `C:\Users\you`); configure credentials there, never copy secrets into the installer. In PowerShell use commands on one line, or backticks for continuation instead of the Bash `\` shown below.

The scripts support both official authentication modes:

```text
New console  -> VOLCENGINE_SPEECH_API_KEY -> X-Api-Key
Old console  -> APP ID + Access Token -> X-Api-App-Key + X-Api-Access-Key
Flash        -> volc.bigasr.auc_turbo
Standard     -> volc.seedasr.auc
```

Prefer `VOLCENGINE_SPEECH_API_KEY` for credentials created in the new Doubao Voice console. Use the legacy fields only when the account was provisioned with APP ID and Access Token. Never print either credential mode.

Users must provide and validate their own credentials and quota. Never enable postpaid billing, buy resources, or accept paid terms automatically. Stop for an explicit cost decision if free or prepaid quota is exhausted.

The stored Secret Key is not used by the recording-file submit/query endpoints. Never copy credentials into a project file, command output, report, or reply.

## Mode Selection

1. Inspect the source with `ffprobe` and extract local video/M4A media to a 16 kHz mono MP3.
2. Default to flash Base64 mode when the extracted audio is at most 2 hours and 100MB. The official recommendation is to keep direct uploads near or below 20MB when practical; 20MB is a transport recommendation, not the hard API limit.
3. Use standard URL mode when the audio exceeds flash limits, the user explicitly prioritizes lower cost, or a controlled HTTPS audio URL already exists.
4. Standard URL mode may use a private TOS object with a short-lived signed URL. Never use an anonymous upload site.
5. Preserve both raw JSON and generated SRT, then validate the SRT against the original media.
6. Delete extracted audio, upload objects, and failed test outputs after validation. Keep source media, raw JSON, SRT, and necessary analysis only.

Flash mode accepts local WAV, MP3, or OGG OPUS through Base64 `audio.data`, so it does not require TOS. Standard mode accepts `audio.url` and still requires a reachable controlled HTTPS URL. When the env file is complete, load it without printing its contents.

## Commands

Check authentication without uploading audio or creating a paid recognition task:

```bash
node .agents/skills/volcengine-asr-srt/scripts/check-auth.mjs
```

Extract speech audio (macOS and Windows use the same Node entry; install FFmpeg on PATH or set `FFMPEG_BIN` and `FFPROBE_BIN` to executable paths):

```bash
node .agents/skills/volcengine-asr-srt/scripts/extract-audio.mjs \
  /absolute/input.mp4 /absolute/output.asr.mp3
```

Recognize an eligible local audio file with the flash API:

```bash
node .agents/skills/volcengine-asr-srt/scripts/transcribe-flash.mjs \
  --file /absolute/output.asr.mp3 \
  --json /absolute/output.raw.json \
  --srt /absolute/output.srt \
  --media /absolute/input.mp4
```

Recognize an approved audio URL with the standard API:

```bash
node .agents/skills/volcengine-asr-srt/scripts/transcribe-url.mjs \
  --url 'https://signed.example/audio.mp3' \
  --format mp3 \
  --json /absolute/output.raw.json \
  --srt /absolute/output.srt \
  --media /absolute/input.mp4
```

Rebuild an SRT from preserved raw JSON:

```bash
node .agents/skills/volcengine-asr-srt/scripts/build-srt.mjs \
  /absolute/output.raw.json /absolute/output.srt
```

## Recognition Rules

- Keep `enable_ddc=false`. Semantic smoothing can delete filler and repeated speech needed for precise edit decisions.
- Use `enable_itn=true`, `enable_punc=true`, and `show_utterances=true`.
- Use `enable_speaker_info=true` only for interviews or multi-speaker recordings.
- Treat returned text as raw ASR, not automatically approved publishing text.
- Compare a representative sample against the user's Jianying baseline before promoting this API to the project-wide primary transcript.
- Preserve word and utterance timestamps in raw JSON even when SRT uses utterance timestamps.
- Flash mode is a technical default selected by the user, not proof that its transcript is more accurate than Jianying. Complete a representative human-reviewed comparison before promoting it to the publishing-text baseline.

## Material And Quality Judgment

作用对象是实际麦克风音轨；目标是让后续内容重建或剪口能回到原声。源材料包括 Cap 段索引、音轨、录制偏移和原始 API JSON。多段从各自源时间开始，合并时只增加可追溯全局偏移；不得按文件名猜顺序。规格通过后仍要抽听专名、数字、英文和段边界，不能用 JSON/SRT 格式有效证明识别质量已验收。

## Failure Handling

- Authentication or resource errors: report the sanitized API status and message; never print request headers.
- Trial quota or billing activation errors: stop without enabling postpaid service or purchasing resources, then report the sanitized status and expected next decision.
- `45000030 requested resource not granted` means the credentials reached the service but the application has not enabled `volc.bigasr.auc_turbo`. Do not rotate credentials or activate TOS; open the flash resource in the console, confirm its billing terms, then retry.
- Flash limit errors: do not split or truncate automatically. Report whether duration, file size, or format caused the rejection, then select standard URL mode or ask for an explicit segmentation decision.
- Queue/processing: continue polling until completion or timeout.
- Missing utterances: keep the raw JSON and fail instead of inventing timestamps.
- Invalid SRT: keep raw outputs, report validation errors, and do not burn subtitles into video.
- Upload failure: remove the temporary local audio only after it is no longer needed for retry.
