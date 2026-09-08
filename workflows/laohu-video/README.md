# 老胡口播视频工作流

这里集中保存 laohu-CapMotion 的内容剪辑、字幕和动画工作流。Cap 产品源码位于仓库根目录；本目录只保存 Agent 如何理解和加工口播视频所需的规则、脚本、模板和可追溯记录。

## 单一入口

```text
规范/          项目级制作规则和判断标准
模板/          EDL、字幕、Remotion 和组件资产
示例/          可以公开、没有隐私信息的配置示例
知识沉淀/      用户偏好、踩坑和验证经验，本地保存
作品/          单条作品的文字控制与追溯记录，本地保存
参考资料/      第三方资料和源码参考，本地保存
归档/          已结束或废弃的材料，本地保存
```

`知识沉淀/`、`作品/`、`参考资料/` 和 `归档/` 默认不进入 Git。新克隆中它们可能不存在，只有真正产生对应内容时才创建。

## Agent 读取顺序

执行口播视频任务前，先读取仓库根目录的 `AGENTS.md`，再按任务选择：

1. 剪辑、字幕或交付流程：读取 `规范/制作流程.md`、`规范/字幕制作规则.md` 和相关 skill。
2. 画面和动画：读取 `规范/画面表达规则.md`、`规范/组件设计方法论.md` 和 `laohu-animation-director`。
3. 单条作品：读取 `作品/<编号_主题>/控制文档.md`。
4. 长期偏好和踩坑：读取 `知识沉淀/用户偏好.md` 与对应问题记录。

不要遍历整个目录后再猜主文件。根 `AGENTS.md` 和当前作品的 `控制文档.md` 决定本次需要读取哪些材料。

## 视频剪辑流水线

```text
新 ASR
→ 粗剪：空镜、废弃起头、口误重说、明确重复
→ 精剪：主线、章节、补录归位、低价值表达压缩
→ 剪辑疑难确认
→ 冻结 EDL
→ 写入 Cap 工程
→ 修正 SRT
→ 展示字幕精确拆分
→ 默认双语烧录
→ Cap 最终导出
```

粗剪、精剪和修正字幕是一条成片流水线的连续阶段，不是默认交付三份视频。所有媒体成品保存在输入视频所在目录，项目内只保存文字型记录。

## 主要技能

技能入口保留在仓库根目录 `.agents/skills/`：

- `volcengine-asr-srt`：火山引擎文件 ASR 与原始 JSON/SRT。
- `correct-srt-subtitles`：正式校对 SRT 和疑难清单。
- `burn-subtitles`：双语字幕展示稿与烧录。
- `jianying-srt-bridge`：用户明确授权时使用剪映识别。
- `laohu-animation-director`：根据语义、目标和上下文选择动画表达。
- `laohu-video-postproduction`：第二遍任务包、冻结时间轴和 Cap 总装唯一主责。
- `runninghub-avatar`：最终音频驱动的 RunningHub 数字人片段。
- `remotion-*`：Remotion 开发、字幕、交互和渲染规则。

技能脚本引用本目录时使用仓库相对路径 `workflows/laohu-video/...`，不得依赖旧的根级 `规范/` 或 `模板/` 路径。

## 剪辑脚本

脚本位于 `模板/video-editing/`。例如：

```bash
node workflows/laohu-video/模板/video-editing/precise-cut.mjs \
  /absolute/edit.edl.json --dry-run
```

示例 EDL：[`示例/precise-cut.edl.example.json`](示例/precise-cut.edl.example.json)。

## Remotion 组件库

共享工程位于 `模板/remotion-assets/workspace/`：

```bash
cd workflows/laohu-video/模板/remotion-assets/workspace
npm ci
npm run typecheck
npm test
```

Remotion 动画源码是事实来源，渲染视频是可重建缓存。动画先针对具体片段制作并由用户验收，再决定是否抽象为可复用模板。

## 新作品记录

需要长期回溯时，在本地建立：

```text
作品/<编号_主题>/
  控制文档.md
  输入/
  分析/
  制作/
  输出/
```

项目目录只保存文字输入、素材绝对路径、ASR/SRT、EDL、控制文档和质检记录，不复制大体积原始视频或中间渲染。

## 目录维护规则

- 新内容先判断归属，再决定是否创建文件。
- 同一规则只保留一份主文件，不复制到多个目录。
- 能更新主文件就不创建 `_v2`、`最终版` 或 `修正版`。
- 临时媒体放在任务临时目录，验证后删除。
- 用户反馈有复用价值时写回 `规范/`、skill 或 `知识沉淀/`。
- 目录调整后同步更新根 README、架构导航和技能脚本引用。
