---
name: volcengine-asr-srt
description: Call Volcengine large-model recording-file ASR in flash Base64 or standard URL mode, then produce raw timestamped JSON and validated SRT. Use when the user asks for 火山引擎 ASR、豆包录音文件识别、文件转 SRT、重新识别字幕, or a no-GUI ASR step before rough or precise video editing.
---

# Volcengine ASR SRT

Use the official flash API for eligible local audio and keep the asynchronous standard API as a fallback. Do not operate Jianying, install a local ASR engine, or print credentials.

## Configuration

Load credentials from:

```text
~/.config/laohu/volcengine-asr.env
```

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

Extract speech audio:

```bash
bash .agents/skills/volcengine-asr-srt/scripts/extract-audio.sh \
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

## Failure Handling

- Authentication or resource errors: report the sanitized API status and message; never print request headers.
- Trial quota or billing activation errors: stop without enabling postpaid service or purchasing resources, then report the sanitized status and expected next decision.
- `45000030 requested resource not granted` means the credentials reached the service but the application has not enabled `volc.bigasr.auc_turbo`. Do not rotate credentials or activate TOS; open the flash resource in the console, confirm its billing terms, then retry.
- Flash limit errors: do not split or truncate automatically. Report whether duration, file size, or format caused the rejection, then select standard URL mode or ask for an explicit segmentation decision.
- Queue/processing: continue polling until completion or timeout.
- Missing utterances: keep the raw JSON and fail instead of inventing timestamps.
- Invalid SRT: keep raw outputs, report validation errors, and do not burn subtitles into video.
- Upload failure: remove the temporary local audio only after it is no longer needed for retry.
