# Git 提交图谱（git-look-good）

本地优先的 Git 仓库提交可视化工具。把一个仓库的提交历史渲染成**横向树状 / 分支拓扑图谱**，叠加时间轴、统计面板与逐行 diff，双击即用、数据不出本机。

> 灵感：想把团队的 Git 提交历史做成可交互图谱，一眼看懂「谁、在哪个仓库、哪个分支、什么时间、提交了什么」。完整需求见 [`PRD.md`](./PRD.md)。

## 两种使用方式

**方式一：桌面程序（推荐，零环境）**
- 双击 `desktop/dist_v213/GitGraph-win32-x64/GitGraph.exe`（或重新打包后的版本）。
- 启动器页支持：选择本机仓库文件夹 / 输入 GitHub URL 自动 `git clone` / 打开最近仓库。
- 完整 diff 数据在扫描时生成，图谱随选随看。

**方式二：单文件 HTML（需 Node.js 生成一次）**
```bash
# 进入本仓库目录
node run.js "D:/path/to/your/repo"      # 指向任意标准 Git 仓库
# 或直接拖文件夹到 一键生成.bat
```
生成 `git-graph.html`（自带数据，单文件、可离线打开）。可用环境变量：
- `GITGRAPH_LITE=1`：跳过 patch 抓取（不要逐行 diff，速度快、体积小）
- `GITGRAPH_NO_OPEN=1`：生成后不自动打开
- `GITGRAPH_MAX=8000`：提交数超过上限时均匀抽样（见 PRD 风险项）

## 核心功能

- **多维度图谱**：模式 A（仓库→分支→作者→提交）、B（仓库→作者→提交）、C（作者→仓库→分支→提交）、D（时间线）、E（分支拓扑泳道，主干居中）。
- **时间轴**：模式 E 叠加年/月/日刻度，节点按时间对齐。
- **统计面板**：作者排行、日/周活跃热力图、提交趋势曲线，点击与图谱双向筛选联动。
- **提交详情**：点击提交展开文件清单 + 增删行数 + 逐行红绿 diff（完整档）。
- **交互**：hover 摘要、按作者/分支筛选、全局搜索高亮、缩放（Ctrl±/0）、拖拽平移（F 适应窗口）。
- **导出**：SVG / PNG（图谱图片）+ JSON（结构化数据），便于留存与分享。
- **偏好记忆**：分组模式、缩放、筛选、最近仓库本地持久化。

## 架构

| 文件 | 作用 |
|---|---|
| `scan.js` | 数据层：解析 `git log --all --numstat` + 逐提交 `git show --patch`，输出结构化 JSON（分支归属、作者去重、逐文件增删） |
| `build.js` | 把扫描数据注入 `template.html` 的 `__DATA__` 占位，产出单文件 `git-graph.html`（含 `</script>` 转义保护） |
| `run.js` | 一键入口：定位仓库 → 扫描 → 构建 → 打开 |
| `template.html` | 前端单文件模板（原生 JS + SVG，无框架），所有渲染与交互 |
| `desktop/` | Electron 外壳：`main.js`（clone/扫描 IPC）、`preload.js`、`launcher.html`（引导页）、`loading.html`（扫描进度） |

## 构建桌面程序

```bash
cd desktop
npm install
npm install electron-packager -D
npx electron-packager . GitGraph --platform=win32 --arch=x64 --out=dist_v214
```
产物在 `desktop/dist_v214/GitGraph-win32-x64/GitGraph.exe`。

## 已知边界

- 私有仓库 clone 依赖本机已配置的 git 凭据。
- octopus 合并（>2 父）已做 lane 兼容处理，超大型仓库建议配合 `GITGRAPH_MAX` 抽样。
- 导出 PNG 依赖浏览器 canvas，对超宽图谱会按当前缩放比例栅格化。

## License

MIT
