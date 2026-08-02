# laohu-Voice2MotionFrameCut

> From voice to structure, from rough footage to motion storytelling.

一套面向口播视频的 AI 辅助工作流：从视频中生成带时间戳的 SRT，依据语义和时间轴完成粗剪、精剪与重排，再把口播内容转化为可复用的 Remotion / HyperFrames 讲解动画。

本仓库目前是**工作流、Agent skills、剪辑脚本和动画组件库**，不是已经封装好的一键式桌面软件。它适合希望让 AI 参与内容审稿、剪辑决策和动画导演，同时仍保留可追溯时间轴的人使用。

## 能做什么

```text
原始视频 / 音频
  -> ASR 识别与 SRT
  -> 粗剪：空镜、废弃起头、口误重说、明显重复
  -> 精剪：重建主线、删除低价值表达、移动补录内容
  -> EDL：每个保留片段可追溯到原始素材
  -> Remotion / HyperFrames：把口播结构变成讲解动画
  -> 质检与交付
```

- **ASR / SRT**：支持火山引擎录音文件识别极速版与标准版，保留原始 JSON 和句级时间戳。
- **剪映桥接**：在用户明确授权 GUI 操作时，可把剪映专业版作为黑盒 ASR 使用，不逆向私有接口。
- **粗剪规则**：内容完整度优先，在保留独立信息点的前提下压缩空镜、气口和失败重录。
- **精剪工具**：根据 EDL 对每个音视频区间成对 `trim / atrim`，支持章节重排，并避免累计音画偏移。
- **动画导演**：从 ASR 语义、传播目标、信息结构和观众感受出发选择动画，而不是机械套模板。
- **12 个 Remotion 组件家族**：覆盖观点、对比、流程、系统、决策、时间线、数据、漏斗、证据、表单、屏幕讲解和风险闭环。

## 粗剪与精剪的区别

| 阶段 | 主要目标 | 默认处理 |
| --- | --- | --- |
| 粗剪 | 去掉明显浪费观看时间的部分 | 空镜、长停顿、废弃起头、口误重说、明确重复 |
| 精剪 | 让整条内容围绕一条主线推进 | 章节重排、补录归位、压缩口水话、删除低价值支线、保留证据和可信度信息 |

精剪不是按“嗯、啊、然后”批量删词。语气词是否删除，必须结合它在句子里的逻辑作用、音频边界和画面状态判断。第一优先级始终是内容完整，第二优先级才是缩短时长。

## 环境要求

- Node.js 20 或更高版本
- `ffmpeg` 与 `ffprobe`
- 可选：火山引擎语音识别账号与调用额度
- 可选：剪映专业版，仅用于得到用户明确授权的 GUI 识别流程
- 可选：HyperFrames，用于 HTML / GSAP 长时间线工作流

Agent 侧的 Remotion 最佳实践来自官方 [`remotion-dev/skills`](https://github.com/remotion-dev/skills)。本仓库不重复打包这批上游文件；需要让 Agent 编写或渲染 Remotion 时，请按上游说明安装对应 skills。

macOS 可使用 Homebrew 安装 FFmpeg：

```bash
brew install ffmpeg
```

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/LaohuAD/laohu-Voice2MotionFrameCut.git
cd laohu-Voice2MotionFrameCut
```

### 2. 配置火山引擎 ASR（可选）

凭据必须保存在项目外，默认读取：

```text
~/.config/laohu/volcengine-asr.env
```

支持新版 API Key，或旧版 APP ID + Access Token：

```bash
mkdir -p ~/.config/laohu
install -m 600 .env.example ~/.config/laohu/volcengine-asr.env
```

编辑该文件并填入自己的凭据。不要把真实凭据提交到 Git。

检查鉴权配置：

```bash
node .agents/skills/volcengine-asr-srt/scripts/check-auth.mjs
```

### 3. 从视频生成 SRT

先抽取适合识别的单声道音频：

```bash
bash .agents/skills/volcengine-asr-srt/scripts/extract-audio.sh \
  /absolute/input.mp4 /absolute/input.asr.mp3
```

符合极速版限制时使用 Base64 直传：

```bash
node .agents/skills/volcengine-asr-srt/scripts/transcribe-flash.mjs \
  --file /absolute/input.asr.mp3 \
  --json /absolute/input.raw.json \
  --srt /absolute/input.srt \
  --media /absolute/input.mp4
```

原始 JSON 是精确剪辑和字幕追溯的依据，不要只保留 SRT。

### 4. 根据 EDL 精剪

参考 [`examples/precise-cut.edl.example.json`](examples/precise-cut.edl.example.json) 创建自己的 EDL。`precisionSequence` 可以使用单个字幕编号、编号范围或毫秒级自定义区间；数组顺序就是成片顺序，因此可以把后录的补充片段移回正确章节。

先检查区间，不渲染：

```bash
node 模板/video-editing/precise-cut.mjs /absolute/edit.edl.json --dry-run
```

确认后输出视频：

```bash
node 模板/video-editing/precise-cut.mjs /absolute/edit.edl.json
```

脚本会把最终区间、目标时间轴和输出探测结果写回 EDL，便于复查每一处剪口。

### 5. 打开 Remotion 组件库

```bash
cd 模板/remotion-assets/workspace
npm ci
npm run typecheck
npm test
npm run studio
```

组件统一使用 Zod schema、视觉 token、关键帧测试和 Studio Composition。选择组件前先阅读：

- [`规范/组件设计方法论.md`](规范/组件设计方法论.md)
- [`规范/组件规则.md`](规范/组件规则.md)
- [`模板/components/README.md`](模板/components/README.md)

## 目录结构

```text
.agents/skills/
  volcengine-asr-srt/       火山引擎 ASR、SRT 生成与校验
  jianying-srt-bridge/      经授权的剪映 GUI 识别流程
  laohu-animation-director/ ASR 理解、动画推荐与配置生成
examples/                   无隐私数据的配置示例
规范/                       剪辑、字幕、画面、动效与质检规则
模板/video-editing/         EDL 精剪脚本
模板/components/            12 个动画组件家族说明书
模板/compositions/          HyperFrames 组合模板说明
模板/remotion-assets/workspace/
  src/components/           Remotion 组件实现
  src/schemas/              公共输入与导演数据结构
  src/registry/             组件登记表
  src/configs/examples/     可运行示例配置
```

## 动画组件选择原则

组件不按“科技博主、财经博主、知识博主”复制表面皮肤，而是先判断四个底层变量：

```text
communicationGoal：解释、比较、证明、选择、指导、警示、复盘、记忆
emotionalTone：清晰、平静、可信、充满动能、未来感、紧迫、满足感
informationShape：序列、层级、对比、网络、时间线、定量、转化
motionIntensity：低、中、高
```

当现有 schema 无法表达用户需求时，应明确指出缺口，再决定是一次性适配、升级旧组件还是创建新组件，不能把缺失信息硬塞进不匹配的字段。

## 安全与隐私

- 不要提交视频、音频、字幕、ASR 原始结果、EDL、渲染输出或用户作品目录。
- 不要提交 API Key、Access Token、Secret Key、Cookie 或账号数据。
- ASR 内容可能包含个人信息；调用云服务前应确认素材授权和服务条款。
- 项目不会自动开通计费、购买额度或接受付费条款。
- 剪映桥接只允许操作明确命名的临时草稿，不得修改用户现有工程。

## 当前限制

- 目前没有一键完成全部流程的 GUI。
- 粗剪的语义判断主要由 Agent 工作流和规则驱动，尚未封装为独立的通用 CLI。
- 精剪脚本要求 EDL 已经完成内容审稿；它负责可靠执行剪口，不替代内容导演决策。
- ASR 结果不是发布终稿。专名、数字、英文和低置信内容仍需疑难清单与人工确认。
- Remotion 与 HyperFrames 可以独立使用或按需组合，本仓库不捆绑 HyperFrames 本体。

## 路线图

- 结构化粗剪 EDL 生成器
- SRT 疑难清单与术语库校对工具
- 精剪后字幕自动映射与二次对齐
- 统一的命令行入口
- 可视化 EDL 审稿与剪辑界面
- 更多真实口播场景的组件 preset 与视觉回归测试

## 贡献

提交问题或代码前请阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)。安全问题请不要在 Issue 中公开真实凭据或私人素材。

## License

[MIT](LICENSE) © 2026 LaohuAD
