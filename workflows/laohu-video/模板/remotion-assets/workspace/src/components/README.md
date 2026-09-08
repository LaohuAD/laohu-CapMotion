# Remotion 组件源码

本目录放长期可复用的 Remotion React 组件。

新增组件前先写：

```text
模板/components/组件名.md
```

确认组件目的、观众效果、schema、preset、禁用场景后，再在本目录实现对应组件。

推荐命名：

```text
FlowNodeGraph.tsx
GrowthCurve.tsx
ReviewDashboard.tsx
RiskLoop.tsx
TopicForm.tsx
```

组件内部应优先读取结构化 props，而不是解析自然语言提示词。

所有组件的 `items` 都支持可选 `revealAtFrame`。它是当前 composition 内的相对帧，用于让对象在对应口播语义点进入并在后续论证中保持可见；未提供时继续使用原有自动错峰。`revealAtFrame` 必须小于 `durationInFrames`，不能用绝对成片时码，也不能为了制造热闹给每个词都设触发帧。
