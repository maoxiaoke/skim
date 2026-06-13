# Skim 设计语言 — "Codex Native"

> 来源：用户提供的 Codex macOS 桌面应用截图提炼 ｜ 日期：2026-06-12
> 地位：UI 唯一事实源。原型 `prototypes/d-codex-native.html` 是本规范的参考实现；技术方案与开发阶段的所有界面决策以本文档为准。

## 0. 设计原则

1. **像系统设置，不像网页** —— Skim 是一个管理工具，气质应贴近 macOS 系统偏好设置：克制、安静、可信。用户来这里做决定（禁用/删除），界面不能有任何营销感或玩具感。
2. **边框分层，不用阴影** —— 层级靠 1px 细边框和底色差表达；阴影只允许出现在浮层（popover / 批量条）和应用窗口本身。
3. **色彩即语义** —— 界面 98% 是黑白灰；蓝色 = 可交互/已启用，橙色 = 警示/破坏性。看到颜色就意味着"这里需要注意"。
4. **文字两层制** —— 每个条目都是"标题 + 灰色说明"两行结构（如 Codex 设置页的 Auto-review 行）。说明文字承担解释成本，让操作无需文档。
5. **留白即层级** —— 区块间距大于组内间距，组内行高一致；不靠分隔标题字号制造层级。

## 1. 色彩 Tokens

### 1.1 中性色（界面骨架）

| Token | 值 | 用途 |
|---|---|---|
| `bg-app` | `#FFFFFF` | 主内容区背景 |
| `bg-sidebar` | `#F7F7F8` | 侧边栏、低强调区域 |
| `bg-hover` | `#F2F2F3` | 行/条目 hover |
| `bg-selected` | `#ECECEE` | 侧边栏选中态（灰，**不用蓝**） |
| `bg-inset` | `#F6F6F7` | 代码块、内嵌区域 |
| `border-default` | `#E5E5E7` | 卡片、输入框边框 |
| `border-divider` | `#E8E8EA` | 行分隔线、栏分隔线 |
| `text-primary` | `#1A1A1A` | 标题、正文 |
| `text-secondary` | `#6E6E73` | 说明文字、次要信息 |
| `text-tertiary` | `#9A9AA0` | 小节标签、占位符、计数 |

### 1.2 语义色

| Token | 值 | 用途 | 约束 |
|---|---|---|---|
| `accent` | `#007AFF` | 开关 On、选中 radio、链接、focus ring | 不用于大面积底色 |
| `accent-soft` | `#EEF6FF` | 蓝色徽章底 | — |
| `warning` | `#E8590C` | Delete 按钮文字、破坏性图标、警示徽章字 | 仅警示/破坏性，禁止装饰用 |
| `warning-soft` | `#FFF1E8` | 警示徽章底（如 Duplicate） | — |
| `toggle-off` | `#E9E9EB` | 开关 Off 轨道 | — |

### 1.3 暗色模式

MVP 仅浅色。Token 体系已按语义命名，暗色映射后置（v1.x），禁止在组件里写死色值绕过 token。

## 2. 字体

| 用途 | 字体 | 字号/字重 | 行高 |
|---|---|---|---|
| 全局字族 | `-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif` | — | — |
| 页面大标题 | 同上 | 22px / 600 | 1.3 |
| 抽屉/对话框标题 | 同上 | 17px / 600 | 1.3 |
| 条目标题 | 同上 | 15px / 500 | 1.4 |
| 正文/说明 | 同上 | 13px / 400 | 1.55 |
| 小节标签 | 同上 | 13px / 500，普通大小写（**不全大写**） | 1.4 |
| 微文字（体积、时间戳） | 同上 | 11–12px / 400 | 1.4 |
| 代码/路径 | `ui-monospace, "SF Mono", Menlo, monospace` | 12px / 400 | 1.5 |

中文（zh-CN）回退 PingFang SC，无需单独配字。

## 3. 形状与间距

| 项 | 值 |
|---|---|
| 圆角 | 卡片/浮层 12px ｜ 输入框/按钮/侧栏选中态 8px ｜ 徽章 6px 或胶囊 ｜ 应用窗口 12px |
| 边框 | 一律 1px，禁用 2px 粗边和 ring 式描边（focus 除外） |
| 阴影 | 仅两档：浮层 `0 4px 16px rgba(0,0,0,.08)`；应用窗口 `0 8px 32px rgba(0,0,0,.10)`。卡片**无阴影** |
| 间距基准 | 4px 网格。组内行内边距 12–14px；卡片间 24px；区块间 32–40px；页面内容边距 32–40px |
| 侧边栏 | 宽 230px；条目高 34px；图标 16px 与文字间距 10px |
| 行控件区 | 行右侧控件之间 12px；toggle 约 40×24 |

## 4. 组件规范

### 4.1 侧边栏条目
图标（16px 细线）+ 13.5px 文字 + 右侧灰色计数。选中态 = `bg-selected` 圆角 8px，文字仍 `text-primary`（不变蓝）。hover = `bg-hover`。

### 4.2 分组卡（核心容器）
组标题在卡片**上方**作为 `text-tertiary` 小节标签（含路径时路径用等宽字体）。卡片 = 白底 + `border-default` + 12px 圆角，组内行用 `border-divider` 分隔。

### 4.3 条目行（核心单元）
左侧两行制：标题行（15px/500，可后缀徽章）+ 说明行（13px `text-secondary`，单行截断）。右侧从右到左：更多菜单（…）→ 状态控件 → 体积微文字。禁用态：左侧文字整体 45% 不透明度，控件保持可点。

### 4.4 开关（iOS Toggle）
40×24 胶囊，On = `accent` 填充 + 白球右侧；Off = `toggle-off` + 白球左侧。切换动画 200ms ease-out。仅用于二元 on/off 场景。

### 4.5 状态下拉（四档，Claude 技能高级模式）
macOS 选择器样式：当前值 + 上下双 chevron，8px 圆角细边框。展开浮层：每项 = 档位名 + 右侧蓝色对勾（当前项）+ 下一行 12px 灰色解释。四档解释文案（固定）：
- **On** — Fully available, description loaded into context
- **Name-only** — Saves context, Claude sees only the name
- **User-invocable only** — Hidden from Claude — you can still invoke it with /name（M0 实测修正：模型侧完全不可见，仅保留用户斜杠调用）
- **Off** — Completely hidden from Claude

### 4.6 徽章
6px 圆角、11px/500 文字、软底深字：警示类（Duplicate / Stray file）用 `warning-soft`/`warning`；信息类（agent、scope）用细边框白底灰字；状态类（Name-only）用 `accent-soft`/`accent`。

### 4.7 按钮
- **次要（默认）**：白底 + `border-default` + 8px 圆角 + 13px/500 `text-primary`，hover `bg-hover`
- **主要**：`accent` 底白字（出现频率低，每屏至多一个）
- **破坏性**：文字按钮，`warning` 色文字，无底无边；确认对话框中可升级为橙底白字
- 高度统一 32px（紧凑场景 28px）

### 4.8 输入框 / 搜索框
8px 圆角 + `border-default`，前置放大镜图标，placeholder `text-tertiary`。聚焦：边框变 `accent` + 2px `accent` 30% focus ring。

### 4.9 浮层（popover / 菜单 / 批量条）
白底 + `border-default` + 12px 圆角 + 浮层阴影。批量操作条：窗口底部居中悬浮，内容 = "N selected" 灰字 + 次要按钮组 + 橙字 Delete + 灰字 Cancel。

### 4.10 对话框（确认删除/归档冲突）
同浮层质感；标题 17px/600 + 13px 说明 + 操作区右对齐；破坏性确认主按钮为橙底白字。

## 5. 图标

- 细线风格（Lucide / SF Symbols 气质），stroke-width 1.5，统一 viewBox 24×24
- 常规 16px，空状态/引导 24–32px
- **禁止 emoji 当图标**；语义图标固定映射：锁 = bundled 不可删，垃圾桶 = 删除（破坏性场景着 `warning` 色），归档盒 = archive，刷新 = 循环箭头

## 6. 动效

| 场景 | 规格 |
|---|---|
| hover / 颜色变化 | `transition-colors` 150ms |
| 开关切换 | 200ms ease-out |
| 浮层出现 | 150ms 透明度 + 4px 位移，**无缩放弹跳** |
| 列表项移除（归档/删除后） | 高度塌缩 + 淡出 200ms |
| 全局约束 | 尊重 `prefers-reduced-motion`；无装饰性动画 |

## 7. 可访问性底线

- 文字对比度 ≥ 4.5:1（`text-secondary` on white = 4.6:1 达标；`text-tertiary` 仅限非关键信息）
- 所有交互元素：`cursor-pointer`、可见 focus ring（`accent` 2px）、键盘可达
- 颜色不是唯一信号：Off 行同时有文字变灰；警示徽章同时有文字
- 图标按钮必须带 `aria-label`；toggle 用真实 `role="switch"` + `aria-checked`

## 8. 语调（UI 文案）

- 默认英文，句式短平、动词开头（"Disable 3 skills?" 而非 "Are you sure you want to…"）
- 说明文字承担教育职责（参照 Codex 的 "Auto-review can make mistakes."）：状态档位、归档去向、删除去向都要一行说明
- 破坏性确认必须说明后果与退路："Moves to Trash. You can restore it from there."
