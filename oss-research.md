# Git 提交图谱 · 开源选型调研报告

> 调研日期：2026-08-17 ｜ 数据来源：GitHub API（star 数、license、归档状态为当日实时数据）
> 背景：落实「坚决杜绝闭门造车、重复造轮子」原则——启动本项目前先检索 GitHub 同类项目，评估后择优复用。

## 一、候选项目总览

| 项目 | Star | License | 状态 | 技术栈 | 一句话定位 |
|---|---|---|---|---|---|
| nicoespeon/gitgraph.js | 3073 | MIT | 已归档(2024-07) | TS | 最流行的 Git 图谱渲染库 |
| tclh123/commits-graph | 226 | 自定义 MIT（非 SPDX） | 2018 停更 | JS + Canvas | **git 原生分列/泳道分配算法（bitbucket 式）** |
| aaronsky/react-commits-graph | — | MIT | — | TS + React | commits-graph 的 React 移植 |
| Hayrsiane/git-commit-tree | 1 | MIT(README，无独立 LICENSE) | 2026-01 | TS + React | SVG 渲染 + 虚拟滚动 + 分支着色 + tooltip |
| beingmartinbmc/git-history-ui | 1 | MIT | 2026-08 活跃 | TS | local-first，按作者/文件/日期筛选 + Git Wrapped 年度回顾 |
| nshcr/git-commits-threadline | 5 | MIT | 2026-03 | TS + Rust | 力导向动画图，擅长超大仓库 |
| isomorphic-git/isomorphic-git | 8327 | MIT | 2026-08 活跃 | JS | 纯 JS 读 .git，无需 git CLI |
| bsara/git-grapher | 24 | — | 早期 | JS | 通用图可视化原型 |

## 二、逐项评估

### 1. nicoespeon/gitgraph.js（3073★）—— 最流行但已停维护
- **优点**：API 设计成熟（分支/提交/合并的声明式描述），社区认可度高。
- **缺点**：2024-07 已归档，不再维护；是通用渲染库，不直接解决「泳道分配」核心问题。
- **结论**：**不直接依赖**（已归档 + 需自己再包一层），但 API 设计思路可借鉴。

### 2. tclh123/commits-graph（226★）—— 核心算法唯一真源 ⭐
- **优点**：实现了 **git 原生分列/泳道分配算法**（与 `git log --graph` 同源思路）：新→旧遍历提交，维护活跃泳道数组，单父继续本列、合并时关闭多余父所在列并压缩，以此生成任意拓扑都能正确显示的泳道图。这是本项目手写「主干+上下分支」布局在**多分支/交叉/合并**场景下必然破局的关键。
- **缺点**：2018 年停更；JS 部分只是渲染器，算法主体在其 Python 侧（`git/commits_graph.py`）；**自定义 MIT 许可（非 SPDX 标准）**，直接拷贝源码有合规风险。
- **结论**：**复用其算法思想、自行实现**（规避非标准许可），不拷贝源码。

### 3. Hayrsiane/git-commit-tree（1★）—— 直接命中 M3 需求
- **优点**：SVG 渲染、**虚拟滚动**、**分支着色**、hover/选中/tooltip、响应式——与本项目 M3（交互打磨）逐项对应。
- **缺点**：过新（2026-01）、无 release、无独立 LICENSE 文件，风险高。
- **结论**：**借鉴思路**（虚拟化裁剪策略、分支配色范式），不引入依赖。

### 4. beingmartinbmc/git-history-ui（1★，活跃）—— 产品形态最接近
- **优点**：local-first、按作者/文件/日期筛选、Git Wrapped 年度回顾；2026-08 仍在活跃迭代。
- **缺点**：需 `npx` 起本地 server，非「双击文件即用」。
- **结论**：产品交互（筛选/统计面板/年度回顾）借鉴，形态不跟随。

### 5. 其余参考
- **nshcr/git-commits-threadline**（5★）：力导向动画，适合超大仓库浏览，但非泳道范式，仅作大仓库参考。
- **isomorphic-git**（8327★）：纯 JS 读 .git，可替代 scan.js 的 git CLI 调用；但体积大、浏览器 file:// 协议下仍有跨域限制，**暂不引入**。
- **bsara/git-grapher**（24★）：早期原型，价值有限。

## 三、采纳结论（本项目取舍）

| 决策 | 说明 |
|---|---|
| ✅ 移植 **commits-graph 泳道分配算法** | 自行实现 `computeLanes()`（已落地为模式 E 布局），规避非标准许可；支持任意分支拓扑 + 主干居中 |
| ✅ 借鉴 **git-commit-tree 的分支着色 + 虚拟滚动** | 已落地：泳道按列取色（10 色调色板）、scroll 视口裁剪渲染 |
| ✅ 借鉴 **git-history-ui 的筛选 / 统计** | 已落地：作者/分支筛选、统计面板（作者排行/活跃热力/趋势） |
| ❌ 不引入 gitgraph.js | 已归档 + 需二次封装 |
| ❌ 不引入 isomorphic-git | 体积大、file:// 受限，现用 git CLI 足够 |
| 🛡️ 保留差异化 | **单文件 HTML、双击即用、离线、零安装**——任何开源候选都不具备 |

## 四、遗留风险与后续

1. **泳道算法边界**：octopus 合并（>2 父）未单独验证；提交时间同毫秒时的排序依赖 tie-break（已用「主干优先」兜底）。
2. **超大仓库**：虚拟滚动已缓解渲染压力，但 `scan.js` 的 diff 抓取（每提交一次 `git show`）在大仓库会慢——后续可按需降级为「轻量档」（仅文件清单，不抓 patch）。
3. **exe 打包**：Electron（成熟、~100MB）vs Go+WebView（轻量、~10MB，需装 Go 工具链）——待用户拍板。
