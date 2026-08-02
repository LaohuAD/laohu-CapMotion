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
