# 组件说明书

本目录保存 12 个公开组件家族的选择与配置说明。动画导演先读 `规范/组件规则.md` 选候选，再只读选中组件的说明书。

公共字段和验证以以下代码为准：

```text
模板/remotion-assets/workspace/src/schemas/director.ts
模板/remotion-assets/workspace/src/schemas/components.ts
模板/remotion-assets/workspace/src/registry/componentRegistry.ts
```

每个组件说明书只记录自己的信息任务、模式、内容限制、禁用场景和质检点。视觉颜色、字体、安全区、来源标签、最终停留时间和公共输出方式不在各文件重复定义。

新组件必须先证明信息结构与现有 12 家族不同。只增加一种配色、入场或局部布局时，应增加 mode 或 preset，不创建新家族。
