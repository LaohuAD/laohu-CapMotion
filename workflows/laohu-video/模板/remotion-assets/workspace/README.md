# Voice2Motion Remotion 组件库

本目录是项目级唯一程序动画 workspace。它用于长期沉淀 12 个可复用 Remotion 组件家族，并支持独立成片和 Cap Motion 上层覆盖，不为每条作品重复创建工程。

## 定位

```text
本目录负责：Remotion 组件源码、风格 preset、schema、示例配置、测试和 Composition 注册
单条作品负责：组件选择建议、组件配置和需要长期保留的输出
```

不要把每条作品都做成独立 Remotion 工程。默认复用本 workspace；只有需要长期保留的渲染结果才输出到当前作品：

```text
作品/编号_主题/制作/assets/remotion-renders/
```

## 第一次使用

依赖已经安装并由 `package-lock.json` 锁定。新机器或依赖被清理后执行：

```bash
cd workflows/laohu-video/模板/remotion-assets/workspace
npm ci
npm run studio
```

当前已经安装并锁定共享依赖。`node_modules` 只存在于本 workspace，并由顶层 `.gitignore` 排除。

Cap 的局部渲染命令会直接调用本地 `node_modules/.bin/remotion`，不会隐式下载依赖。预览缓存为带 Alpha 的 VP8 WebM，最终缓存为 ProRes 4444 MOV；产物按输入内容哈希保存在 `.cap/motion/cache/`。缓存键包含定义、参数、时长、质量档，以及 `src/`、`public/`、配置和依赖锁文件的内容指纹；只有这些输入都没变时才复用缓存。

视觉组件默认通过 `remotion.config.ts` 禁用音轨，避免导出无意义的静音 AAC。需要把配音一起交付的独立作品应在该次渲染中显式覆盖。

## 目录

```text
src/
  index.ts                 Remotion 入口
  Root.tsx                 Composition 注册
  components/              可复用动画组件
  presets/                 老胡风格 preset
  schemas/                 组件输入类型和公共 schema
  configs/examples/        示例配置
public/                    Remotion 静态素材
```

## 使用流程

```text
1. `laohu-animation-director` 读取用户需求、ASR 上下文和源材料。
2. 输出组件选择建议。
3. 用户确认组件。
4. 读取 模板/components/组件名.md。
5. 生成当前作品的组件配置。
6. 用本 workspace 渲染独立片段或资产。
7. 只有需要长期保留的作品输出才进入当前作品目录。
8. 用冻结后的 T2 时间和 revision-safe `cap motion` 命令写入上层覆盖轨。
```

## 确定性语义锚点

Remotion 组件已经消费 `items[].revealAtFrame`。`semantic:anchors` 是这个字段与冻结 S2→T2 映射之间的窄适配层：它不会按 `spokenCue` 搜索文本，也不会把口播时长拉伸成动画时长。每个锚点必须带 `itemId`、冻结映射的 `mappingSegmentId`/`segmentIds`，并且只能使用明确的 `wordIds`、`wordIndices` 或一个完全落在该段内的 `sourceRange`。

锚点文件和映射文件必须共同声明相同的 `mediaId`、可选但一旦出现就必须相同的 source fingerprint，以及相同的 revision。映射中的 `sequence` 可重排或变速；工具按每个保留词所在段的 source/target 线性关系计算 T2 时间，再减去 composition 的 `targetStartSeconds`，最后按 FPS 四舍五入为 composition-relative `revealAtFrame`。删除、切前文字、重复索引、旧 revision 和跨段的模糊范围都会直接失败。

触发帧、进入动作时长和 hold 时长是三个独立值：

```json
{
  "id": "anchor-process",
  "itemId": "process",
  "segmentIds": ["map-segment-12", "map-segment-13"],
  "wordIds": ["w-210", "w-211"],
  "timing": {"actionDurationFrames": 18, "holdFrames": 30}
}
```

`actionDurationFrames` 和 `holdFrames` 只用于边界校验和报告；输出配置只新增已有 renderer 认识的 `revealAtFrame`，不会改 `durationInFrames` 或用 narration 的长短重设入场。解析报告应作为可追溯文字资产另存，不能把报告字段当成组件 schema 的新字段。

运行：

```bash
npm run semantic:anchors -- \
  --config /absolute/component-config.json \
  --anchors /absolute/semantic-anchors.json \
  --mapping /absolute/source-to-final.json \
  --out /absolute/resolved-component-config.json \
  --report /absolute/resolved-anchors.report.json
```

## 可复用案例检索

案例索引只引用现有组件 registry/catalog 的 `componentId` 和合法 `mode`，不复制组件清单。每个案例必须保存 communication relation、fit/non-fit 判断、feedback state、固定版本和 source fingerprint。历史案例中即使带有 `approval` 字段，建索引时也会被归一为 `PENDING_REVIEW`；检索结果永远是候选，不是自动批准的制作决定。

`catalog.json` 可以由调用方从当前 `src/registry/componentRegistry.ts` 导出为 `{id, modes}[]`；案例文件可以是数组或 `{cases: []}`：

```bash
npm run semantic:index -- \
  --catalog /absolute/current-component-catalog.json \
  --cases /absolute/reusable-cases.json \
  --out /absolute/reusable-case-index.json

npm run semantic:search -- \
  --index /absolute/reusable-case-index.json \
  --goal explain \
  --relation PROCESS \
  --pinned-version 2026.09 \
  --source-fingerprint sha256-of-the-pinned-source \
  --out /absolute/retrieval-results.json
```

默认排除 pinned version/source fingerprint 不匹配的候选；需要审计过期候选时显式加 `--include-stale`，结果会标记 `stale: true`，仍然不会批准。

## 本地 Remotion 渲染缓存

`render:cached` 直接调用本 workspace 的 `node_modules/@remotion/cli/remotion-cli.js`，不启动 Studio 或隐藏 GUI。默认缓存和临时文件位于仓库同盘的 `target/capmotion-release/animation-reliability/`。每个缓存键包含完整 workspace source tree、package manifest/lockfile dependency fingerprint、显式 assets 的 SHA-256、props/local timing 和 output spec；外部输入必须用 `--asset` 显式列出并参与哈希，未跟踪的绝对路径会拒绝渲染。

Cap 后续 placement 通过独立的 `--placement` 元数据传入，不进入 Remotion 资产键，因此只改变 placement 会复用同一资产；会改变 Remotion 像素的配置字段仍然属于 props，会使缓存失效。命中缓存前会重新检查 receipt、文件大小和 SHA-256；渲染输出与 receipt 都先写临时文件再原子替换，锁冲突或渲染失败不会发布半成品或旧结果。

```bash
npm run render:cached -- \
  --props /absolute/resolved-component-config.json \
  --composition FlowNodeGraph \
  --quality preview \
  --output /Volumes/Laohu_Work/项目/老胡/老胡自媒体/老胡画面讲解/target/capmotion-release/animation-reliability/flow-preview.webm \
  --asset /absolute/external-evidence.png \
  --placement '{"x":120,"y":80,"scale":0.8}'
```

`--dry-run` 只计算并打印缓存计划，不产生渲染或缓存 receipt；它适合检查外部输入和 placement-only 复用关系，不能代替真实 Remotion 渲染验收。

## 规则

- 本 workspace 是长期资产，不放某条作品的一次性配置。
- 新组件先写 `模板/components/组件名.md`，再写 Remotion 源码。
- 组件输入尽量结构化，不靠散文提示词驱动。
- 动画必须服务口播理解，不做贴片式重复叠加。
- `out/` 只用于临时 QA，验收后删除；需要交付的输出放到对应作品目录。
