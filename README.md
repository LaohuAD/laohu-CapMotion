# Laohu Voice2Motion FrameCut

一套以 [Cap](https://github.com/CapSoftware/Cap) 为桌面产品基底、由 Codex 驱动内容剪辑与动画制作的口播视频工作台。

这个仓库不是把 Cap 当作旁路参考，而是直接在 Cap 的录屏、时间线、预览和原生导出能力上继续开发。现有的 ASR、SRT、EDL、字幕、Remotion、HyperFrames 和内容导演规则集中保存在 `workflows/laohu-video/`，作为产品的 Agent 工作流层。

## 产品分工

```text
Cap
  录屏 · 工程时间线 · 人工调整 · 媒体预览 · 最终导出

Codex
  内容理解 · 粗剪/精剪决策 · 字幕修正 · 工程修改 · 动画生成

Remotion / HyperFrames
  短动画 · 参数化模板 · 复杂图解 · 可复用视觉资产
```

Cap 与 Codex 保持独立。用户在 Codex 中通过自然语言提出要求，Codex 通过 CLI 和版本化工程事务修改 `.cap` 工程；用户回到 Cap 中预览、拖动、判断和验收。

## 当前落地方向

- Cap 是仓库根目录的产品源码。
- macOS 是第一实现和验收平台，保留上游 Windows 能力。
- MotionTrack 支持动画的时间、位置、时长、层级和公开参数编辑。
- Remotion 源码是动画事实来源，MOV/WebM 等文件只是可重建缓存。
- 简单拖拽不依赖 Codex；复杂动画结构继续由 Codex 修改。
- Cap 与 CLI 使用 revision 防止人工修改和 Agent 修改互相覆盖。
- 最终长视频继续由 Cap 的原生媒体管线统一导出。

当前已落地向后兼容的 Motion 定义/实例/缓存模型、`projectRevision` 原子事务与并发写锁、MotionTrack 及属性面板、Remotion 局部渲染与内容寻址缓存，以及 Cap 预览/导出共用的原生 MotionLayer 合成路径。录制时手动放大已接入 Studio 录制：用户可在“设置 → 快捷键”自行绑定，录制时显示不进入成片的取景提示，录制后作为可编辑 ZoomTrack 片段保存。

桌面端已加入持久化的中英文语言状态和统一翻译入口。首次启动先选择简体中文或 English，然后再进入权限和功能引导；之后可在“设置 → 通用 → 语言”即时切换。新增界面文案应通过 `apps/desktop/src/i18n.tsx` 接入，不得在页面内另建一套语言状态。

完整架构见：

- [`docs/superpowers/specs/2026-08-29-cap-codex-motion-workflow-design.md`](docs/superpowers/specs/2026-08-29-cap-codex-motion-workflow-design.md)
- [`docs/architecture/repository-layout.md`](docs/architecture/repository-layout.md)

## 目录导航

```text
apps/                         Cap 桌面、Web、CLI 和其他应用
crates/                       录制、工程、渲染、导出等 Rust 核心
packages/                     前端和服务端共享包
infra/                        部署基础设施
scripts/                      Cap 构建和维护脚本
.agents/skills/               Codex 技能发现入口
docs/                         产品设计、架构和实施计划
workflows/laohu-video/        口播剪辑与动画工作流
```

工作流内的规则、模板、示例和私有作品边界见 [`workflows/laohu-video/README.md`](workflows/laohu-video/README.md)。

## 上游关系

```text
origin    git@github.com:LaohuAD/laohu-Voice2MotionFrameCut.git
upstream  https://github.com/CapSoftware/Cap.git
```

同步上游时，应先查看 Cap 的变更，再在功能分支合并：

```bash
git fetch upstream
git switch -c codex/sync-cap-upstream
git merge upstream/main
```

## 开发环境

Cap 上游要求 Node.js 20、pnpm 10.5.2、Rust 1.88+。首次安装：

```bash
pnpm install
pnpm env-setup
pnpm cap-setup
```

macOS 上完整编译 Cap CLI 和桌面媒体栈还需要安装完整 Xcode；仅安装 Command Line Tools 不包含 `xcodebuild` 所需的系统 SDK。当前 Rust 媒体依赖还要求 FFmpeg 7，不能直接用 FFmpeg 8 代替。纯工程层可独立运行 `cargo test -p cap-project` 和 `cargo test -p cap-motion-cli`。

常用检查：

```bash
pnpm typecheck
cargo check -p cap-project
cargo check -p cap
```

桌面开发和完整构建命令沿用 Cap：

```bash
pnpm dev:desktop
pnpm tauri:build
```

Agent 执行时遵守仓库规则，不自行启动已经运行的开发服务器。

## 口播工作流

口播视频的默认处理顺序是：

```text
新 ASR
→ 粗剪 EDL
→ 内容精剪与重排
→ 剪辑疑难确认
→ 写入 Cap 时间线
→ 修正 SRT
→ 展示字幕拆分
→ 字幕烧录
→ Cap 最终导出
```

详细入口：[`workflows/laohu-video/README.md`](workflows/laohu-video/README.md)。

## 安全与隐私

- 不提交用户视频、音频、字幕、ASR 原始结果、EDL 或渲染输出。
- 不提交 API Key、Access Token、Cookie 或账号数据。
- 本地 `作品/`、`知识沉淀/`、`参考资料/` 和 `归档/` 默认不进入 Git。
- Codex 修改工程必须使用 revision 检查，不允许静默覆盖人工编辑。
- 删除或迁移私人文件前必须检查明确目标，发生同名冲突时停止而不是覆盖。

## License

Cap 产品源码沿用上游的 AGPLv3 和分组件许可证，见 [`LICENSE`](LICENSE) 与 [`licenses/`](licenses/)。合并前已有的 Laohu 工作流、文档、Agent skills 和模板在未另行声明时使用 [`licenses/LICENSE-LAOHU-WORKFLOW-MIT`](licenses/LICENSE-LAOHU-WORKFLOW-MIT)。
