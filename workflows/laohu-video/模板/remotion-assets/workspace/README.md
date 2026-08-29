# Voice2Motion Remotion 组件库

本目录是项目级 Remotion workspace。它用于长期沉淀 12 个可复用动画组件家族，并支持独立成片、透明资产和外部调用，不为每条作品重复创建 Remotion 工程。

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
8. 若采用组合工作流，再由 HyperFrames 调用并按 ASR 对齐。
```

## 规则

- 本 workspace 是长期资产，不放某条作品的一次性配置。
- 新组件先写 `模板/components/组件名.md`，再写 Remotion 源码。
- 组件输入尽量结构化，不靠散文提示词驱动。
- 动画必须服务口播理解，不做贴片式重复叠加。
- `out/` 只用于临时 QA，验收后删除；需要交付的输出放到对应作品目录。
