# laohu-CapMotion

一套以 [Cap](https://github.com/CapSoftware/Cap) 为桌面产品基底、由 Codex 驱动内容剪辑与动画制作的口播视频工作台。

这个仓库不是把 Cap 当作旁路参考，而是直接在 Cap 的录屏、时间线、预览和原生导出能力上继续开发。现有的 ASR、SRT、EDL、字幕、Remotion 和内容导演规则集中保存在 `workflows/laohu-video/`，作为产品的 Agent 工作流层。

> 我在用 AI 探索一个人怎么做好教学视频。[个人主页](https://lao-hu.com)放了我的作品、教程和其他创作工具，也欢迎来[老胡画梦枋](https://lao-hu.com/#community)交流。

## 产品分工

```text
Cap
  录屏 · 工程时间线 · 人工调整 · 媒体预览 · 最终导出

Codex
  内容理解 · 粗剪/精剪决策 · 字幕修正 · 工程修改 · 动画生成

Remotion
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

### 桌面界面所有权

当前日常使用、功能验收和自定义界面开发统一以 Tauri `apps/desktop` 为准。`apps/desktop-gpui` 是随上游保留的可选原生迁移实现，在达到项目迁移门槛前不作为默认启动入口，也不接受只落在 GPUI 的用户功能。

工程模型、录制、时间线变换、Motion/Remotion、渲染和 Agent/CLI 协议优先放在共享 Rust crate；Tauri 只负责当前界面和输入适配。完整边界见 [`docs/superpowers/specs/2026-08-30-tauri-primary-gpui-migration-design.md`](docs/superpowers/specs/2026-08-30-tauri-primary-gpui-migration-design.md)。

当前已落地向后兼容的 Motion 定义/实例/缓存模型、`projectRevision` 原子事务与并发写锁、MotionTrack 及属性面板、Remotion 局部渲染与内容寻址缓存，以及 Cap 预览/导出共用的原生 MotionLayer 合成路径。录制时手动放大已接入 Studio 录制：用户可在“设置 → 快捷键”自行绑定，录制时显示不进入成片的取景提示，录制后作为可编辑 ZoomTrack 片段保存。

桌面端已加入持久化的中英文语言状态和统一翻译入口。首次启动先选择简体中文或 English，然后再进入权限和功能引导；之后可在“设置 → 通用 → 语言”即时切换。新增界面文案应通过 `apps/desktop/src/i18n.tsx` 接入，不得在页面内另建一套语言状态。翻译边界以“用户是否在读这段文字来理解或操作界面”为准：标题、按钮、说明、错误提示和窗口文字可本地化；代码、CLI 命令、配置键、占位符、路径、URL、协议值、枚举值及设备和品牌名称必须保持技术原文，不得为了“界面全中文”破坏可复制、可执行或可识别性。

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
origin    git@github.com:LaohuAD/laohu-CapMotion.git
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

日常桌面开发使用仓库根目录脚本：

```bash
./scripts/start-cap.sh
```

这个脚本只启动 Tauri，不构建也不监管 GPUI。上游双应用开发命令只在明确进行 GPUI 对齐或迁移时使用；正式打包仍使用 `pnpm tauri:build`。

Agent 可以执行后台编译、自动测试和热更新。未经用户明确要求“打开让我测试”，不得首次启动 Cap；用户进入测试阶段后，可以让应用保持打开，Agent 也可以同时继续修改代码，不要求冻结开发。首次启动或偶尔一次原生重启激活窗口可以接受；前端 HMR 一般应让 Cap 保持在后台，Rust / Tauri 改动确需重启验证时应控制频率，不得形成保存一次、抢一次焦点的连续循环。Agent 也不得自行启动已经运行的开发服务器。

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

## 这些项目怎样配合

我做自媒体时，要找选题、写文章、做图片、剪视频，有时还要写歌、做 MV。下面这些项目分别帮我处理其中的一部分，也都在跟着我的实际创作继续修改。

| 项目 | 可以用它做什么 | 在我的创作里负责什么 |
| --- | --- | --- |
| [老胡的审美起源](https://github.com/LaohuAD/laohu-taste-genesis) | 把自己判断作品好坏的方法、修改意见和经验整理成 Agent 能调用的规则与 Skill | 给其他创作项目建立和改进专业能力，让反馈不只停在一次聊天里 |
| [老胡 AI 视觉](https://github.com/LaohuAD/laohu-ai-visual) | 推敲故事、写剧本、设计角色与场景，再拆分镜、写视频提示词 | 处理影视短片、MV 和其他视觉内容的创作方案；当前主要交付文本，不直接替你生成整部影片 |
| [老胡音乐 V4](https://github.com/LaohuAD/laohu-music) | 从歌曲想法开始，讨论歌词、曲式、演唱与声音方案，再做歌名、封面和发布准备 | 处理歌曲创作，也给 MV 提供歌词、音乐方向和创作背景 |
| [老胡无限画布](https://github.com/LaohuAD/laohu-Infinite-Canvas) | 在本地画布中连接素材、模型调用和生成结果，保存参数与工作流 | 承接图片、视频、音乐等生成任务；基于 Infinite-Canvas 继续开发 |
| [CapMotion](https://github.com/LaohuAD/laohu-CapMotion) | 在 Cap 产品基础上继续开发录屏、口播剪辑、字幕和讲解动画工作流 | 把教学录屏和讲解素材整理成视频；涉及桌面编译和环境配置，先看本项目的开发说明 |

比如做一支歌曲 MV，可以先在音乐项目里打磨歌词和声音方向，再用 AI 视觉整理故事与镜头，最后在无限画布里调用模型、保存素材。做软件教程时，CapMotion 则更相关。它们之间可以传递方案和素材，但还不是安装一次就能全自动跑完的产品。

你只需要挑眼下能帮上忙的项目，不必一次把它们全部装好。

## 我是老胡，喜欢玩 AI，也喜欢讲故事

我是**老胡用AI画梦**。看到有意思的 AI 工具，我总想上手玩一下：写文章、做图、写歌、做视频，都想试试。玩得挺杂，但现在花时间最多的，还是 AI 影视创作、讲故事，以及一个人怎么把自媒体做起来。

我自己就要经历找选题、写稿、做素材、剪辑和发布这些事。哪些环节可以让 AI 帮忙，哪些地方还得自己想、自己改，我会边做边琢磨。这些开源项目和教程，就是在这个过程中一点点做出来的。如果你也在独立做内容，希望里面有些东西能帮你省下重复劳动，多留点时间给真正想做的作品。

### 来我的主页，看看这些工具怎么用在作品里

**[老胡的个人网站 · lao-hu.com](https://lao-hu.com)** 是我放作品、教程和创作工具的地方。GitHub 里是项目本身，主页把它们和实际创作放在一起：你可以先看作品，再找相关教程，选适合自己的工具动手试。

不知道从哪开始，可以先看[教程与资料](https://lao-hu.com/learn/)；想跟着完整演示做一遍，可以看我的 [B 站](https://space.bilibili.com/13497214)。你也可以通过主页找到[公众号和联系方式](https://lao-hu.com/#contact)，继续交流。我在[小红书](https://xhslink.com/m/AZo7UbSx1ef)和[抖音](https://v.douyin.com/usGF0Kz_Yic/)也会分享作品与过程。

**[去老胡的主页看看 →](https://lao-hu.com)**

### 经常跑模型，想把试错成本降下来？

做图、做视频时，往往要试好几轮才有满意的结果。我自己也在用和维护[老胡的模型小屋](https://api.lao-hu.com)，希望把模型调用的成本降下来，让同一份创作预算能多试几种想法。

如果你正在找价格更合适的模型接口，可以先看看站内的模型和当前价格，再用一个小任务比较效果、速度和费用，合适再继续用。模型调用按站内说明收费，开源项目本身和接口消费是两回事。

**[查看模型与价格 →](https://api.lao-hu.com)**

### 加入老胡画梦枋，成为造梦师

一个人做内容，有时最难的不是再找一个工具，而是不知道自己卡在哪：想法该怎么往下做，画面哪里不对，流程为什么接不上。

**老胡画梦枋**是我组织的付费 AI 创作交流社群，在这里，我们把一起玩 AI、做作品的伙伴叫作“造梦师”。我会在里面分享创作案例、值得关注的新东西和自己的尝试，也会亲自参与答疑。你可以带着作品、尝试过程和具体问题来，和一群同样在玩 AI 的人一起讨论。

如果你想持续做作品，希望有个地方交流、提问、看看别人在怎么做，欢迎先来[主页了解老胡画梦枋](https://lao-hu.com/#community)。入群方式和当前费用在主页了解，不用急着决定，先看公开内容是否对你有帮助。

我也希望通过内容、合作和社群获得收入，支持自己继续研究 AI。能一边做喜欢的事，一边和志同道合的人互相帮助，是我想把这件事长期做下去的方式。

**[了解老胡画梦枋，找老胡聊聊 →](https://lao-hu.com/#community)**

### 如果这些项目帮到了你

我希望自己折腾出来的东西，也能帮到别人。如果你用它做出了作品、帮客户解决了问题，我很愿意看到；遇到问题也欢迎带着具体情况提 Issue。

对我有权独立授权的部分，代码用 MIT，规则、Skill、提示词、文档和案例用 CC BY-SA 4.0。商用请按本仓库的许可证执行，上游和第三方材料仍有各自的要求。

除了按许可证保留署名和来源，如果你还愿意在分享时提一句“老胡用AI画梦”，带上[我的主页](https://lao-hu.com)，我会很开心。

## License

老胡有权独立授权的原创部分采用：**代码：MIT License；规则、Skill、提示词、文档和案例：CC BY-SA 4.0**。详见 [原创部分授权范围](LICENSE-LAOHU.md)。

Cap 产品源码及其衍生修改仍沿用上游 AGPLv3 和分组件许可证，见 [`LICENSE`](LICENSE) 与 [`licenses/`](licenses/)。本次调整不是把 Cap 产品整体改成 MIT。既有 Laohu 工作流的历史 MIT 授权继续有效；当前独立原创内容按上述分层说明授权，第三方材料保留原许可。
