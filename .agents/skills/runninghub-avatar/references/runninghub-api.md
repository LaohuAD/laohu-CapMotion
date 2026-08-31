# RunningHub 固定工作流接口

来源：本机附件 `/Users/a1/.codex/attachments/36cf6007-2e06-4f70-b9ef-6dc51c5b5a68/pasted-text.txt`。本 Reference 只保存非敏感契约，不保存密钥。

```text
POST https://www.runninghub.ai/openapi/v2/media/upload/binary
POST https://www.runninghub.ai/openapi/v2/run/ai-app/2089349363716960258
POST https://www.runninghub.ai/openapi/v2/query
Authorization: Bearer $RUNNINGHUB_API_KEY
```

提交节点白名单：

```json
[
  {"nodeId":"94","fieldName":"audio","fieldValue":"<upload result>"},
  {"nodeId":"234","fieldName":"value","fieldValue":"false"},
  {"nodeId":"233","fieldName":"value","fieldValue":"false"},
  {"nodeId":"241","fieldName":"select","fieldValue":"2"},
  {"nodeId":"244","fieldName":"select","fieldValue":"1"}
]
```

不得提交人物图片节点或文本节点。查询到 `SUCCESS` 后取 `results[].url` 并立即下载；URL 仅 24 小时有效。`FAILED` 保存脱敏错误并支持单段重试。
