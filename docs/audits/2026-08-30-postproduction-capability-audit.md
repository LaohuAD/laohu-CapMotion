# 教学视频后期生产线能力审计

## 结论

本轮已经把项目收敛为“第一遍只供上游直调 ASR，第二遍才进入独立后期任务”的两阶段生产线。程序动画的当前唯一运行体系是 Remotion；旧 HyperFrames 能力已经完成语义迁移并从受管运行目录删除，Git 是唯一历史追溯渠道。

项目现在具备确定性的 Cap 多段麦克风索引、第二遍任务包校验与冻结、最终主音频分段、RunningHub 请求编排、生成素材质检、Cap Motion 上层覆盖写入和版本校验。仍不能冒充已完成的两项是：真实 RunningHub 线上生成质量验收，以及把 EDL 直接写回 Cap 基础视频轨形成可编辑剪口；前者需要真实请求，后者当前仍由媒体渲染脚本完成成片，再保留原始工程与映射追溯。

## 职责与线程边界

- 第一遍自由录制属于“老胡文稿”。上游在原任务中直接调用本项目 Cap→ASR 入口，不创建后期任务。
- 老胡文稿负责根据第一遍转写完成主线、完整口播和逐段制作脚本。
- 第二遍录制完成后，才建立该视频专属的“老胡画面讲解”任务并一次性交接正式 Cap 工程、制作脚本、素材与保护项。
- 交接后，剪辑、字幕、Remotion、数字人、AI 视频、Cap 覆盖轨和后续返工都留在同一后期任务；老胡直接沟通，不再经上游转述。

## 真实能力图

| 能力 | 当前状态 | 可执行入口与证据 |
| --- | --- | --- |
| 单媒体火山 ASR | PASS | `.agents/skills/volcengine-asr-srt/` 及其脚本 |
| Cap 多段麦克风→ASR | PASS | `scripts/cap-project-asr.mjs`；按 `recording-meta.json` 的真实录制段顺序索引麦克风，输出源索引、逐段/合并 JSON、SRT、TXT、运行清单 |
| 第二遍正式交接 | PASS | `.agents/skills/laohu-video-postproduction/`、`scripts/postproduction-package.mjs`；校验 schema、保护项和任务类型 |
| EDL 与成片映射冻结 | PASS | 冻结 Cap revision、EDL SHA-256、映射 SHA-256；执行前重新读取文件，变化即拒绝 |
| 粗剪/精剪媒体渲染 | PASS | `workflows/laohu-video/模板/video-editing/`；使用 FFmpeg 7，保留 EDL 与源时间映射 |
| EDL 直接写入 Cap 基础轨 | UNKNOWN | 当前没有确定性的可编辑基础轨写回接口；不得用“有媒体渲染”冒充“Cap 基础轨已编辑” |
| SRT 校对与双语烧录 | PASS | `correct-srt-subtitles`、`burn-subtitles` 和既有脚本 |
| Remotion 动画 | PASS | `laohu-animation-director`、Remotion schema/workspace；测试、类型检查、composition 枚举和真实静帧渲染均通过 |
| 最终主音频→数字人音频任务 | PASS | `scripts/avatar-audio-jobs.mjs`；只允许冻结任务包的 `FINAL_MAIN_AUDIO`，按 T2 语义边界拆分，绑定哈希并检查实际导出时长 |
| RunningHub 客户端 | PASS（传输行为）/ OBSERVE（真实质量） | `scripts/runninghub-avatar.mjs`；固定节点、40 秒、连续组串行、最多 5 组并发、即时下载、失败单段重试均有测试；未发起真实付费请求 |
| 生成素材硬质检 | PASS | `scripts/generated-asset-qa.mjs`；读取真实媒体流并检查时长、分辨率和横屏 |
| 口型/人物/衔接观看验收 | OBSERVE | 工具会生成强制人工检查清单，必须人工标记 PASS 后才允许回填 |
| 外部成片→Cap 上层覆盖 | PASS | `cap motion artifact import`、`scripts/postproduction-package.mjs apply`；数字人、AI 视频、录屏和证据素材都经过 QA 后 revision-safe 写入 Motion 上层轨，不改底层录制 |

## 第一遍 Cap→ASR 的直接调用契约

上游需要先读取 `.agents/skills/volcengine-asr-srt/SKILL.md`，然后调用：

```bash
node scripts/cap-project-asr.mjs \
  --project /absolute/path/to/project.cap \
  --output-dir /absolute/path/to/text-output
```

解析规则：

1. `recording-meta.json.segments[]` 是原始录制段真实顺序，不能用文件名排序替代。
2. 多段 Studio 录制读取每段 `mic.path`；旧单段项目回退到 `audio.path`；Instant 录制按真实媒体结构解析。
3. 多段可逐段识别，合并输出使用每段实际时长累计偏移，保留源段 ID、绝对路径、局部与全局时间。
4. 输出只包含可追溯文字资产：`source-index.json`、逐段 raw JSON/SRT、合并 raw JSON/SRT/TXT、`run.json`。
5. 第一遍结果只服务内容重建，不得成为第二遍字幕或覆盖素材的时间轴。

## 时间轴权威

- `F1`：第一遍自由录制时间，仅供上游理解内容。
- `S2`：第二遍正式录制源时间，供剪口、源音频和追溯使用。
- `T2`：冻结 EDL 后的成片时间，是字幕、Remotion、数字人和 AI 视频覆盖的唯一目标时间轴。

冻结证据由 `Cap projectRevision + EDL hash + S2→T2 map hash` 组成。EDL、映射或工程 revision 任一变化，现有生成素材都过期，必须重新规划或重新验收，不能继续盲写。

## 第二遍任务包与覆盖链

最小必填项：

- schema 与 `SECOND_PASS_POSTPRODUCTION` 阶段；
- 视频专属任务 ID；
- Cap 工程绝对路径和当前 revision；
- 第二遍 ASR 资产；
- 完整制作脚本；
- 最终主音频绝对路径；
- EDL 与 `S2→T2` 映射；
- 原始录制、底层视频和主音频保护项；
- 每段稳定 `segment_id`、职责、源/目标时段、材料、验收和连续组。

必要链路：

```text
第二遍 Cap/ASR
→ 内容导演与粗剪/精剪 EDL
→ 冻结 S2→T2
→ 从最终主音频导出数字人语义片段
→ Remotion / RunningHub / AI 视频生成
→ 媒体硬质检 + 人工观看验收
→ Cap Motion 上层覆盖写入
→ revision 回读验证
```

所有失败都返回结构化错误码并保留脱敏证据。生成素材缺失、时间映射过期、未通过观看验收或 Cap revision 不匹配时，禁止写入工程。

## Remotion 唯一动画体系

旧 HyperFrames 能力本轮已删除。迁移后的唯一规则是：

- ASR 节拍由 Remotion 的 `sourceTimeRange` 与 frame 驱动承接；
- 渐进出现、关系变化和收束画面由 Remotion composition 承接；
- 长口播总装由 Cap 底层录制加 Motion 上层覆盖承接；
- 新 `REMOTION` 批注必须说明解释对象、关系、进入与变化、前后承接、收束画面、材料和验收；只写“这里做动画”会被 schema 拒绝。

已删除路径：

- `workflows/laohu-video/模板/hyperframes-base/`
- `workflows/laohu-video/规范/双引擎协作规则.md`

同时已清除 AGENTS、README、CONTRIBUTING、运行规范、Skill、schema、脚本、测试和示例中的旧运行分支。受管运行目录残留扫描为 0；本审计与实施计划仅保留“已删除旧能力”的事实记录。

### 能力迁移台账

| 已删除旧能力中的有效语义 | 当前唯一承接位置 | 验证方式 |
| --- | --- | --- |
| ASR 驱动的叙事节拍 | Remotion `sourceTimeRange` 与 frame 驱动 | schema 测试、composition 枚举 |
| 元素逐步进入与关系变化 | Remotion 组件族与完整动画批注 | 模糊批注拒绝测试、真实静帧查看 |
| 长口播的整条总装 | Cap 底层录制 + Motion 上层覆盖 | Rust revision-safe 导入测试 |
| 可复用模板 | Remotion workspace 组件与配置 | Vitest、typecheck |
| lint / validate / inspect 的质检目的 | schema、Vitest、TypeScript、Remotion render 与媒体 QA | 自动测试加人工观看门 |

迁移完成后没有保留 RETIRED 伪入口、兼容分支或旧模板；无法证明有独立价值的旧内容直接删除。

## RunningHub 固定契约与安全边界

- 密钥只从 `~/.config/laohu/runninghub.env` 的 `RUNNINGHUB_API_KEY` 读取；仓库忽略 `runninghub.env`、`**/runninghub.env`、`*.secret.env`。
- 只动态替换 `nodeId=94, fieldName=audio`。
- 按附件真实字段类型固定发送 `234="false"`、`233="false"`、`241="2"`、`244="1"`；不上传、不替换人物图片或文本节点。
- 每个真实音频片段不超过 40 秒；只在自然语义边界拆分。
- 同一连续组串行；彼此独立的连续组最多五路并发。
- 提交与查询按附件真实顶层 `taskId/status/results` 响应解析；SUCCESS 后立即下载。
- 上传前重新计算最终主音频与每段 WAV 的 SHA-256；FAILED 保存脱敏错误并只重试失败片段，重试结果合并旧成功记录并追加 attempt 历史。
- 下载后必须验证实际 1280×720 横屏和时长；241/244 的 UI 语义仍是 OBSERVE，不能凭截图为枚举命名。

## 四层能力落点

- 灵魂：各 Skill 自己定义取舍。例如后期主责以“声音定路，画面作证”为方向，保护解释完整性优先于效果密度。
- 筋骨：每个前序步骤必须留下后序所需产物；F1 不跨用到 T2，未冻结不生成，未验收不回填。
- 血肉：动画、数字人、录屏、证据和字幕都说明作用对象、观众变化、材料、开始/变化/收束和过量风险。
- 表皮：路径、schema、ID、哈希、40 秒、5 路、1280×720、横屏、24 小时下载和 Cap 层级均可机械检查；口型与观感保留人工观看判断。

反馈进化由 `scripts/evolution-record.mjs` 约束：反馈必须定位四层根因、提出可证伪假设、修改唯一权威并回归当前与相邻场景，最后记录 KEEP / OBSERVE / REVERT，避免一次反馈直接膨胀成永久禁令。

## 本轮实际修改文件

核心新增：

- `scripts/cap-project-asr.mjs` 及测试；
- `scripts/postproduction-package.mjs` 及测试；
- `scripts/avatar-audio-jobs.mjs` 及测试；
- `scripts/runninghub-avatar.mjs` 及测试；
- `scripts/generated-asset-qa.mjs` 及测试；
- `scripts/project-routing.mjs`、`scripts/evolution-record.mjs`、`scripts/remotion-only.test.mjs` 及测试；
- `.agents/skills/laohu-video-postproduction/`；
- `.agents/skills/runninghub-avatar/`；
- `workflows/laohu-video/模板/video-editing/media-binaries.mjs`。

核心修改：

- `.gitignore`；
- `.agents/skills/laohu-animation-director/`、`volcengine-asr-srt/`、`correct-srt-subtitles/`、`burn-subtitles/`、`jianying-srt-bridge/`；
- `crates/project/src/motion_operations.rs`；
- `crates/motion-cli/src/lib.rs` 与 `crates/motion-cli/tests/commands.rs`；
- Remotion workspace 的 `director.ts`、`common.ts`、示例、测试和 README；
- 视频剪辑 FFmpeg 调用脚本与回归测试；
- 项目 README、CONTRIBUTING、制作流程、动画规则、组件规则、视觉规则和质检规则；
- 本审计与实施计划。

明确未修改或未清理：用户已有的 `scripts/setup.js` 变更、既有作品文字记录、Cap/ASR/字幕用户资产和其他未提交文件。

## 执行验证

```text
node --test scripts/*.test.mjs workflows/laohu-video/模板/video-editing/*.test.mjs
cargo test -p cap-motion-cli
cargo check -p cap
npm test
npm run typecheck
npm run compositions
python quick_validate.py <7 个项目 Skill>
cargo fmt --check
git diff --check
rg / find 旧引擎残留扫描
git check-ignore RunningHub 私密配置候选路径
```

结果：Node 全量行为回归 `90/90` 通过；Rust Motion CLI `4/4` 通过且 Cap 编译通过；开发版 `target/debug/cap` 已重建并真实显示 `motion artifact import`；Remotion 6 个测试文件、23 项测试、类型检查和 18 个 composition 枚举通过；7 个项目 Skill 均通过官方验证器；受管运行目录文本残留与同名路径均为 0；密钥文件权限为 600 且未进入 Git。

## 保护项、回退点与仍需真实输入

保护项：原始 Cap 工程、底层录制、最终主音频、原始 ASR、EDL、时间映射、现有 Cap/字幕/剪辑能力和用户未提交改动。

回退点：所有 Cap 写入都以 revision 为门；任一步失败时停止在外部计划或 Motion 上层轨，不触碰底层录制。RunningHub 只允许失败片段重试，禁止整批无脑重跑。

仍需真实输入：

1. 一份第一遍真实 Cap 工程，验证不同录制模式下的麦克风索引。
2. 一份第二遍真实 Cap 工程、最终脚本、EDL、映射和最终主音频，做端到端交接。
3. 一次获授权的 RunningHub 真实请求，验证工作流结果、URL 生命周期、口型和人物连续性。
4. 若要求在 Cap 内直接编辑底层基础轨，需要单独实现并验证 EDL→Cap 可编辑时间线写回；当前不能声明已有。

## 审计状态

| 维度 | 状态 | 说明 |
| --- | --- | --- |
| STRUCTURE | PASS | 职务有唯一负责人，运行目录只保留 Remotion 动画体系 |
| ROUTE | PASS | 第一遍直调 ASR、第二遍独立后期、动画与数字人路由明确 |
| BEHAVIOR | PASS / OBSERVE | 确定性脚本与 Cap CLI 有行为测试；真实 Cap 全链路与 RunningHub 线上调用待输入 |
| QUALITY | OBSERVE | Remotion 静帧已人工查看；数字人口型、人物一致性与连续性必须用真实结果观看验收 |
