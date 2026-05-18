# V4 README Image Prompts

本文件记录 V4 README 图像资产的生成思路，便于后续替换、重绘或使用其他图像后端复现。

## 使用的图像技能

- `imagegen`：用于实际生成 README 位图资产，并将最终图片复制到 `docs/images/`。
- `gpt-image-2`：用于结构化提示词设计，确定“技术架构图 / 升级对比图 / README 封面”的画面字段、文字约束和输出用途。
- `baoyu-cover-image`：用于封面图风格选型，参考其“类型、配色、渲染、文字、情绪”五维方法，最终选择 16:9、hero、digital、title-subtitle、balanced。

## 资产清单

### `v4-hero-cover.png`

用途：README 顶部封面。

Prompt 摘要：

```text
Create a polished 16:9 article cover image for a GitHub README.
Topic: "基金收益预测助手 V4".
Visual concept: modern fintech dashboard, fund portfolio analytics, modular architecture blocks, market sentiment indicators, AI assistant glow, charts and candlestick lines, Chinese A-share market feel.
Style: clean editorial digital illustration, professional software engineering product.
Palette: deep navy, white, cyan, emerald green, financial red accents, subtle gold.
Text: "基金收益预测助手 V4" and "从 V3 到 V4：模块化、持仓持久化、市场情绪升级".
```

### `v4-vs-v3-upgrade.png`

用途：README 中 V4 相对 V3 升级对比的视觉概览。精确内容以 Markdown 表格为准。

Prompt 摘要：

```text
Create a 16:9 Chinese technical infographic for a GitHub README section comparing V3 and V4 of a fund analytics project.
Title: "V4 相对 V3 的升级路径".
Layout: left column "V3：功能完整展示版", right column "V4：工程化增强版", center arrow "重构升级".
Comparison lanes: "模块化拆分", "代码注释与可读性", "功能变化", "创新点".
Style: crisp vector-like infographic, GitHub documentation friendly, white/light background, blue/green accents.
```

### `v4-modular-architecture.png`

用途：README 中 V4 模块化架构总览。

Prompt 摘要：

```text
Create a 16:9 technical architecture image for a GitHub README.
Title: "V4 模块化架构总览".
Show layers: Web / CLI / AI 助手; route layer; service layer; frontend modules; infrastructure; external data.
Include Flask, JavaScript, cache, rate limit, config template, tests, 东方财富, 新浪财经, OpenAI兼容接口, MySQL.
Style: clean software architecture diagram, readable Chinese labels, GitHub docs compatible.
```
