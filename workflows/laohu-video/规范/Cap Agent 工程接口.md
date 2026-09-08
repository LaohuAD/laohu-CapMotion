# Cap Agent 工程接口

## 目标

Cap 同时服务两类操作者：人通过编辑器操作，Agent 通过稳定命令操作。两条入口必须读写同一个 `ProjectConfiguration`，生成的工程仍可由人继续编辑，不能把 Agent 产物降级成只能播放的黑盒视频。

> 人决定想要什么，接口约束怎样安全做到。

## 权限边界

Agent 默认只能修改作品层数据：剪辑 EDL、轨道片段、字幕正文与样式、Remotion 覆盖、镜头参数、预设和导出设置。每项能力必须由 Cap 预先编译的命令或 MCP 工具公开。

运行中的 Agent 不得修改 Rust / TypeScript 源码、工程 schema、渲染器、数据库结构、签名更新逻辑或安全策略。确需新增底层能力时，进入普通软件开发流程：修改源码、行为测试、兼容迁移、重新编译；新版本发布后，Agent 才能调用新接口。

## 公共参数、用户预设与工程内容

- 公共参数：只定义字段、校验、默认行为和渲染能力。任何用户都能让 Agent 用 `cap presets schema --json` 查看，但里面不含老胡或其他人的个人数值。
- 用户预设：保存在当前操作系统用户的 CapMotion store，并带独立 revision。`老胡预设` 只是老胡给自己预设起的名字，不是公共字幕模板；其他用户同样可以建立自己的命名预设。每条可见预设由 `config` 和可选 `agentProfile` 组成：前者是可渲染参数，后者是 Agent 在制作前读取的稳定偏好。
- 工程内容：时间轴、片段、字幕正文、音轨切分，Remotion 轨道、注释和素材绝对路径永远属于单个工程，不进入预设。
- 旧预设继续可读，但下次在界面或 CLI 保存时会投影为新白名单；文件型背景源只保留“未绑定路径”标记，颜色、渐变等可移植背景可正常保存。

工程和预设的热更新边界不同：

- `cap project ...` 修改的是 `.cap` 工程，编辑器已有工程文件监听，可在 revision 未冲突时热重载。
- `cap presets ...` 修改的是用户预设 store。命令保证磁盘上的锁、revision 和原子写，但已打开的 Tauri 进程可能持有内存缓存；在应用层统一刷新接口完成前，外部 Agent 应在 CapMotion 关闭时写预设库，然后重新打开应用。不得宣称外部预设写入已支持运行中热更新。

## 事务契约

每个写接口必须具备：

1. 明确的 `.cap` 工程路径和输入 schema。
2. `expectedRevision` 乐观锁；过期写入直接失败，不自动覆盖。
3. 工程级文件锁，防止编辑器和 Agent 同时写坏文件。
4. 字段级校验和跨轨道校验。
5. 临时文件写入后原子替换。
6. JSON 回执：旧 revision、新 revision、影响对象、输入摘要、状态和错误。
7. 默认非破坏；删除、整轨替换和导出覆盖必须显式授权。

## 原工程与工作工程

正式录制的原 `.cap` 是追溯权威，只读保留；Agent 不在原工程上直接试剪。任务包必须同时提供 `capProject.sourcePath` 和不同路径的 `capProject.path`，并令 `nonDestructiveCopy=true`：前者是用户交来的原工程，后者是本次剪辑、字幕和覆盖效果持续更新的新工程。工作工程第一次建立后，后续反馈继续修改同一工作工程，不反复复制出 `_v2 / _最终版`。

复制必须在同一磁盘优先使用写时复制能力，目标路径已存在时拒绝覆盖；复制完成后先 `cap project validate`，再以工作工程的 revision 开始后续事务。原工程的 `project-config.json`、媒体和哈希在整个任务结束时应保持不变。

## 稳定命令面

| 领域 | Agent 接口 | 当前状态 | 边界 |
| --- | --- | --- | --- |
| 读取 | `cap project inspect / validate` | 已有 | 只读 |
| 原始 ASR 字幕 | `cap project captions import` | 已有 | 保留样式和其他轨道 |
| 字幕样式 | `cap project captions style` | 已实现 | 局部 patch，不替换字幕正文 |
| Remotion | `cap motion definition/add/update/remove/render` | 已有 | revision + 工件校验 |
| EDL | `scripts/cap-project-edl.mjs` | 可执行，待升为 `cap project edit apply` | 当前已有锁、revision、原子写和回执 |
| 成片展示字幕 | `cap project captions materialize` | 已实现 | `laohu.cap-caption-tracks/1`；两条成片时码字幕轨，不覆盖源时码字幕主稿 |
| 工程展示 | `cap project presentation` | 已实现 | 只局部更新画幅、背景绑定和画面位置；不替换 EDL、字幕、音频或覆盖轨 |
| 工程显示名 | `scripts/cap-project-name.mjs` | 已实现 | 同步 `recording-meta.json.pretty_name`；只改 `.cap` 目录名不会改 Cap 界面名称 |
| 预设 schema | `cap presets schema` | 已实现 | 只返回公共字段与边界，不返回个人数值 |
| 用户预设 | `cap presets list / inspect / save / captions-style` | 已实现 | store revision + 文件锁 + 原子替换；新建和保存都使用白名单投影；外部写入的运行中刷新尚未完成 |
| Agent 制作偏好 | `cap presets agent-profile` | 已实现 | 与可见预设同条存储；类型化字幕/剪辑/Remotion 偏好；不直接写入工程时间轴 |
| 预设应用 | `cap project preset apply` | 已实现 | project revision + 工程锁；不替换轨道、字幕内容和素材路径 |
| 全配置替换 | `cap project config set` | 仅调试/迁移 | 普通 Agent 禁用，遗漏字段会重置 |

字幕样式对用户和新 Agent 只暴露一套 `shadow*` 参数。未开启描边时，阴影从字形轮廓向外生长；开启描边时，同一阴影自动从“字形＋描边”的外缘继续扩展，颜色、透明度、模糊、距离和角度均沿用 `shadow*`。旧工程和旧调用中的 `outlineShadow*` 只作为兼容输入；读取或下次修改时必须将其合并到 `shadow*` 并关闭旧开关，不得再在界面或预设中显示两组彼此割裂的阴影。描边采样与效果边界属于渲染器公共能力，不能用某个用户预设中的数值替代；命名预设只保存用户选择的开关和参数。

## 应继续固化的接口

下一阶段依次把以下能力从任务脚本提升为 Cap 一等命令：

1. `project edit apply`：冻结 EDL、重映射所有从属轨道并输出 S2→T2 映射。
2. `project tracks add/update/remove/move`：统一处理字幕、音频、文字和覆盖视频。
3. `project transaction batch`：多个操作一次提交，要么全部成功，要么全部不写。
4. `project changes inspect/revert`：按回执查看变化，并在 revision 未分叉时撤销。

## 双语字幕轨契约

源字幕与展示字幕必须分层：

- `captions.segments` 保存新 ASR 得到的源时码主稿，用于追溯语音和重新派生；不得被英文翻译或润色字幕替换。
- `timeline.captionSegments` 保存冻结 EDL 后的 T2 展示字幕，`captions.displayMode` 固定为 `materialized`，避免编辑器再次用源 ASR 自动投影并覆盖人工确认结果。
- 中文字幕轨固定 `trackId=zh-CN`、`language=zh-CN`、`trackLabel=中文字幕`；英文轨固定 `trackId=en`、`language=en`、`trackLabel=English Captions`。
- 同一屏的一中一英共享 `pairId`、`start` 和 `end`。任何一侧缺失、跨轨错位或重复 ID 都拒绝写入。
- 老胡预设当前轨级布局为中文 `64px / y=0.92`、英文 `34px / y=0.972`；每段以 `fontSizeOverride` 和 `manualPositionOverride` 保存，因此两轨可分别编辑，公共描边、阴影、字体族等仍由同一字幕样式控制。
- 中文字幕物化前必须规范化展示文本：只删除相邻汉字之间误带入的 ASCII 空格，不压缩英文单词空格，不改源 ASR 主稿。字体、字距和字幕文本空格是三种不同来源，不能把文本中的真实空格误诊为字体字距失效。
- EDL 改变后必须重新生成并再次调用 `materialize`，旧 T2 展示轨不得继续沿用。

标准写入：

```bash
cap project captions materialize /absolute/working.cap \
  --expected-revision 12 \
  --tracks-json /absolute/final-bilingual-cap-tracks.json \
  --format json
```

写入后必须重新读取工程并验证：恰好两条字幕轨、每个 `pairId` 两侧齐全、源字幕仍在、`displayMode=materialized`、revision 与命令回执一致。

## 界面预设编辑语义

- “新建预设”从当前工程提取可复用展示字段，不保存时间轴、字幕正文、源音频剪口或素材路径。
- “应用”把预设合并到当前工程，并把合并后的可复用设置记录为本次编辑基线。
- “保存已更改的设置”只把相对应用基线发生变化的字段合并回同名预设。用户只改字体大小时，只更新字体大小；不得用当前工程的背景、画幅或其他未改字段覆盖预设中较新的值。
- 在工程中临时切换字体、字号或效果只改变工程实例；没有执行“保存已更改的设置”时，不得把这些测试值写回用户预设。排查“切换字体无变化”时应分别验证工程字段已更新、所选字体族可解析、同帧像素确实变化，以及字幕正文是否含异常空格。
- “字体族可解析”不等于“实际排版使用该字体”。排版库可能因命名字体没有精确匹配请求字重而静默回退到系统中文字体。思源黑体与思源宋体必须随包提供 `400 / 500 / 700` 静态字重，并用 CJK 文本实际 shape 后的 `font_id` 与同帧像素差异作为验收；只看下拉框、JSON 或 fontdb query 不合格。
- 界面只能列出所选字体真实可用的字重，切换字体时将原字重归一到最近可用值。霞鹜文楷固定随包 `300 / 400 / 500` 真实字体面；系统无衬线、衬线和等宽选项遇到中文时必须选明确的 CJK 字体及其实际字重，禁止交给随机 fallback。
- 字幕字体设置必须从界面、用户预设和 CLI 一直贯通到实际 shaping：界面的字间距以 1080p 设计像素表达，进入 cosmic-text 前必须按配置字号换算为 EM，不能把像素值直接当 EM 导致不同字号下间距失真。只为历史兼容保留或无法保证在随包中文字体中生效的字段（如旧 `lingerDuration`、`italic`）不得继续出现在公共 schema 中；旧工程中的斜体仍交给排版器解析，但在具备中文斜体资产或合成斜体前不向用户承诺该能力。
- 字幕动画选择“无”时，不仅停止弹跳或缩放，也必须把全局和单条的淡入淡出时长视为 `0`，不延长字幕活跃区间；界面同时隐藏此时无效的时长控件。
- “重置未保存的更改”重新应用该预设的当前已保存值，不修改预设存储。
- “设为默认”会被新录制工程的创建流程读取；普通版本更新继续沿用当前操作系统用户的预设存储。
- 为了可靠区分“用户刚改了什么”和“工程原本就不同”，字段级保存必须先应用目标预设。没有应用基线时拒绝增量保存并提示用户先应用，不能猜测后整份覆盖。
- 重命名、删除和设默认只修改对应元数据；不得清空同条预设的 `agentProfile`。

## Agent 不应直接做的事

- 不直接字符串替换 `project-config.json`。
- 不通过 GUI 坐标模拟代替已有命令。
- 不在一次操作中整份覆盖未知字段。
- 不绕过 revision 冲突自动重试。
- 不把渲染后 MP4 当成可返工工程的替代品。

界面中尚未出现某个参数，不代表 Agent 不能使用；只要它已经属于稳定 schema 和渲染器，便可先通过受控接口开放。反过来，schema 中不存在的能力不能靠塞入自造字段实现，必须先开发底层能力。
