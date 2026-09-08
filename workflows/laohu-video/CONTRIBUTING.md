# Contributing

感谢你改进 laohu-CapMotion。本项目优先接受能够提升口播内容完整度、剪辑可追溯性、字幕准确性和动画解释力的改动。

## 提交前

1. 先说明问题发生在哪个阶段：ASR、粗剪、精剪、字幕、Remotion、数字人或 Cap 覆盖。
2. 对剪辑逻辑改动，提供不含隐私媒体的最小 EDL / JSON 示例。
3. 对动画组件改动，说明观众问题、信息结构、输入 schema 和适用边界。
4. 不要提交真实视频、音频、字幕、API 凭据、用户工程或第三方私有素材。

## 本地检查

```bash
find .agents workflows/laohu-video/模板/video-editing -name '*.mjs' -print0 | xargs -0 -n1 node --check
cd workflows/laohu-video/模板/remotion-assets/workspace
npm ci
npm run typecheck
npm test
```

## Pull Request

- 一个 PR 只解决一个清晰问题。
- 写清行为变化、验证方式和兼容风险。
- 修复剪辑问题时，优先增加可复现的测试或 EDL 示例。
- 新增组件家族前，先证明它的信息结构无法由现有家族的 mode 或 preset 表达。
