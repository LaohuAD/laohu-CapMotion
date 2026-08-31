---
name: runninghub-avatar
description: 在第二遍 EDL 已冻结后，用最终主音频的自然语义片段调用 RunningHub 固定数字人工作流，下载短期结果、记录脱敏失败并准备写入 Cap 上层覆盖轨。不得上传或替换人物图片和文本节点。
---

# RunningHub 数字人

**真人声音立骨，数字形象续场。** 连续性优先于并发，真实音频优先于脚本文字；宁可在自然边界多切一段，也不截断一句话或一个动作。

## 必要运行链

1. 只接收 `EDL_FROZEN` 的 `AVATAR` 任务，核对 T2 与 S2→T2 映射。
2. 运行 `avatar-audio-jobs.mjs`，从冻结任务包声明的第二遍最终主音频精确导出该段；清单同时绑定源音频、EDL、映射和分段音频哈希。不使用脚本文字、任意外部音频或第一遍音频。
3. 超过 40 秒时，只在制作脚本提供的自然语义边界切段。
4. 同一连续组锁定参数并串行保持顺序；不同组最多五路并发。
5. 上传本地音频，提交固定节点白名单，轮询结果。
6. `SUCCESS` 后立即下载到输入媒体同级目录；URL 只活 24 小时。
7. 先用 `generated-asset-qa.mjs` 检查真实文件的时长、分辨率和横屏；再观看检查口型、人物一致性、首尾姿态和组间衔接。观看未通过前 `manualStatus` 保持 `OBSERVE`。
8. 通过 `cap motion artifact import` 进入上层覆盖轨；底层录制和主音频不变。

## 材料技法

- 作用对象：一段完整讲述，不是任意 40 秒窗口。
- 观众效果：人物替代画面时仍感到同一个人在连续讲述。
- 材料：最终音频、语义边界、连续组、前后覆盖画面和验收要求。
- 变化：前段姿态承接 → 口型随真实音频推进 → 句意和动作完整收束。
- 过量风险：为占满五路并发拆碎语句，会让姿态、语气和口型跳变。

## 接口与硬规格

完整节点契约读 [runninghub-api.md](references/runninghub-api.md)。执行入口：

```bash
node scripts/avatar-audio-jobs.mjs \
  --package /absolute/frozen-postproduction-package.json \
  --output-dir /absolute/task-temp/avatar-audio

node scripts/runninghub-avatar.mjs \
  --jobs /absolute/task-temp/avatar-audio/avatar-audio-jobs.json \
  --output-dir /absolute/final-media-dir/avatar
```

只重试失败段时追加：

```bash
--retry-from /absolute/final-media-dir/avatar/runninghub-results.json
```

- 密钥只读 `~/.config/laohu/runninghub.env` 的 `RUNNINGHUB_API_KEY`，禁止写入仓库、日志、报告和回复。
- 唯一动态节点：`94/audio`。禁止发送图片节点 `80` 和文本节点 `169`。
- `234/value=false`、`233/value=false` 固定。
- `241/select=2` 与 `244/select=1` 只按用户导出的工作流值保留；附件没有证明其 UI 语义。未取得节点定义或真实成功结果前，“720P 横屏”标记 `OBSERVE`，不得口头冒充已确认。
- 每段 `≤40s`；最大并发 `5`；同一连续组串行；FAILED 只重试结果清单中的失败段。
- 写回 Cap 前运行 `node scripts/generated-asset-qa.mjs <frozen.json> <assets.json> <verified-assets.json>`；硬校验与观看校验都标记 `PASS` 后，覆盖计划才接受该素材。

## 失败

保存脱敏错误码、segment ID、连续组、是否可重试和已下载结果。禁止保存 Bearer token 与短期 URL。接口失败不允许改传文字、不允许替换人物图，也不允许整批重跑已成功片段。
