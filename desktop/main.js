'use strict';
// Git 提交图谱 · Electron 桌面壳（软件化版）
// 启动 → 启动器欢迎页（本地文件夹 / GitHub URL 两个入口）→ 扫描/克隆 → 窗口加载图谱
// 图谱页内注入「切换仓库 / 刷新」按钮；最近仓库与偏好存于 userData
const { app, BrowserWindow, dialog, Menu, shell, ipcMain } = require('electron');
const { execFileSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { scan } = require('./scan.js');
const { build } = require('./build.js');

let win = null;
let lastRepo = null;          // { name, path, url }
let lastIncludeDiff = true;   // 默认完整档（含 diff）

function userData(){ return app.getPath('userData'); }
function dataPath(){ return path.join(userData(), 'data.json'); }
function outHtmlPath(){ return path.join(userData(), 'git-graph.html'); }
function launcherHtmlPath(){ return path.join(__dirname, 'launcher.html'); }
function loadingHtmlPath(){ return path.join(__dirname, 'loading.html'); }
function reposRoot(){ return path.join(userData(), 'repos'); }
function recentsPath(){ return path.join(userData(), 'repos.json'); }

function readRecents(){
  try { return JSON.parse(fs.readFileSync(recentsPath(), 'utf8')); } catch (e) { return []; }
}
function addRecent(r){
  const list = readRecents().filter(x => x.name !== r.name);
  list.unshift({ name: r.name, path: r.path, url: r.url || '', time: Date.now() });
  try { fs.writeFileSync(recentsPath(), JSON.stringify(list.slice(0, 10))); } catch (e) {}
}
function repoNameFromUrl(url){
  let n = url.trim().replace(/\/+$/, '').split(/[\/\\]/).pop() || '';
  n = n.replace(/\.git$/i, '').replace(/[^\w.\-]+/g, '_');
  return n || null;
}
function looksLikeRepoUrl(url){
  return /^https?:\/\/.+\/.+/i.test(url) || /^git@.+\:.+/i.test(url) || /^ssh:\/\/.+/i.test(url);
}

// 扫描 + 构建 + 记录最近仓库；成功后由调用方 loadFile 图谱
function loadRepoSync(repoPath, includeDiff){
  process.env.GITGRAPH_LITE = includeDiff ? '' : '1';
  const summary = scan(repoPath, dataPath());
  build(dataPath(), outHtmlPath());
  lastRepo = { name: summary.name, path: repoPath };
  lastIncludeDiff = includeDiff;
  addRecent(lastRepo);
  return summary;
}
function showGraph(){
  if (win){ win.loadFile(outHtmlPath()); win.setTitle('Git 提交图谱 · ' + (lastRepo ? lastRepo.name : '')); }
}
function errorBox(msg){
  dialog.showMessageBox(win, { type: 'error', title: '出错了', message: String(msg) });
}

// ---------- IPC ----------
ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { title: '选择 Git 仓库文件夹', properties: ['openDirectory'] });
  return (r.canceled || !r.filePaths.length) ? null : r.filePaths[0];
});
ipcMain.handle('scan-repo', (e, repoPath, includeDiff) => {
  try {
    const s = loadRepoSync(repoPath, includeDiff);
    showGraph();
    return { ok: true, name: s.name, commits: s.commits };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
// ---------- 异步克隆（进度推送 + 可取消） ----------
let cloneTask = null; // { child, target, name, url, includeDiff, cancelled }
function sendCloneDone(payload){ try { if (win && !win.isDestroyed()) win.webContents.send('clone-done', payload); } catch (e) {} }
function sendCloneProgress(payload){ try { if (win && !win.isDestroyed()) win.webContents.send('clone-progress', payload); } catch (e) {} }
function clonePct(text){
  const m = /(\d{1,3})\s*%/.exec(text);
  return m ? Math.min(100, parseInt(m[1], 10)) : null;
}
function cloneStage(text){
  if (/Cloning into/i.test(text)) return '正在创建仓库目录';
  if (/Enumerating objects/i.test(text)) return '正在枚举对象';
  if (/Counting objects/i.test(text)) return '正在统计对象';
  if (/Receiving objects/i.test(text)) return '正在接收对象';
  if (/Resolving deltas/i.test(text)) return '正在解析差异';
  if (/Checking out files/i.test(text)) return '正在检出文件';
  return '克隆中';
}
function cleanupDir(dir){ try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }

ipcMain.handle('clone-repo-start', (e, url, includeDiff) => {
  url = (url || '').trim();
  if (!looksLikeRepoUrl(url)) return { ok: false, error: '地址格式不对，示例：https://github.com/user/repo' };
  const name = repoNameFromUrl(url);
  if (!name) return { ok: false, error: '无法从地址识别仓库名: ' + url };
  if (cloneTask) return { ok: false, error: '已有克隆任务进行中，可先取消' };
  const target = path.join(reposRoot(), name);
  if (fs.existsSync(target)) {
    try {
      const s = loadRepoSync(target, includeDiff);
      lastRepo.url = url;
      showGraph();
      return { ok: true, name: s.name, commits: s.commits, reused: true };
    } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
  }
  fs.mkdirSync(reposRoot(), { recursive: true });
  const child = spawn('git', ['clone', url, target], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  cloneTask = { child, target, name, url, includeDiff, cancelled: false };
  let buf = '';
  child.stderr.on('data', d => {
    buf = (buf + d.toString()).slice(-4096);
    const lastLine = buf.split('\r').pop();
    const pct = clonePct(lastLine);
    if (pct !== null) sendCloneProgress({ name, pct, stage: cloneStage(lastLine) });
  });
  const timer = setTimeout(() => {
    if (cloneTask){ cloneTask.cancelled = true; try { cloneTask.child.kill(); } catch (e) {} }
  }, 600000);
  child.on('error', err => {
    clearTimeout(timer); const t = cloneTask; cloneTask = null;
    if (t) cleanupDir(t.target);
    sendCloneDone({ ok: false, error: '无法启动 git clone：' + String(err.message || err) });
  });
  child.on('close', code => {
    clearTimeout(timer);
    const t = cloneTask; cloneTask = null;
    if (!t) return;
    if (code !== 0) {
      cleanupDir(t.target);
      sendCloneDone({ ok: false, error: t.cancelled ? '已取消克隆' : '克隆失败（git 退出码 ' + code + '），请检查地址、网络或凭据' });
      return;
    }
    try {
      const s = loadRepoSync(t.target, t.includeDiff);
      lastRepo.url = t.url;
      showGraph();
      sendCloneDone({ ok: true, name: s.name, commits: s.commits });
    } catch (err) { sendCloneDone({ ok: false, error: String((err && err.message) || err) }); }
  });
  return { ok: true, started: true };
});
ipcMain.handle('clone-cancel', () => {
  if (!cloneTask) return { ok: false, error: '没有进行中的克隆' };
  cloneTask.cancelled = true;
  try { cloneTask.child.kill(); } catch (e) {}
  return { ok: true };
});
ipcMain.handle('get-recents', () => readRecents());
ipcMain.handle('open-launcher', () => { if (win) win.loadFile(launcherHtmlPath()); });
ipcMain.handle('refresh', () => {
  if (!lastRepo) return { ok: false, error: '尚未打开任何仓库' };
  try {
    const s = loadRepoSync(lastRepo.path, lastIncludeDiff);
    showGraph();
    return { ok: true, name: s.name, commits: s.commits };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
ipcMain.handle('get-current-repo', () => lastRepo ? { name: lastRepo.name } : null);

// ---------- 图谱页注入「切换仓库 / 刷新」按钮 ----------
const INJECT_GRAPH_BUTTONS = `
(function(){
  try {
    if (document.getElementById('ggSwitchRepo')) return;
    var tb = document.getElementById('toolbar'); if (!tb) return;
    function mk(id, label, title, fn){
      var b = document.createElement('button');
      b.id = id; b.textContent = label; b.title = title || '';
      b.style.marginLeft = '4px';
      b.onclick = fn;
      return b;
    }
    tb.insertBefore(mk('ggRefresh', '刷新', '重新扫描当前仓库', function(){ window.gitGraphAPI.refresh(); }), tb.firstChild.nextSibling);
    tb.insertBefore(mk('ggSwitchRepo', '切换仓库', '返回启动器选择其他仓库', function(){ window.gitGraphAPI.openLauncher(); }), tb.firstChild.nextSibling);
  } catch (e) {}
})();
`;

function wireGraphPage(){
  win.webContents.on('did-finish-load', () => {
    try {
      const url = win.webContents.getURL();
      if (url.indexOf('git-graph.html') >= 0) win.webContents.executeJavaScript(INJECT_GRAPH_BUTTONS);
    } catch (e) {}
  });
}

// ---------- 窗口与菜单 ----------
function createWindow(){
  win = new BrowserWindow({
    width: 1360, height: 860,
    title: 'Git 提交图谱',
    backgroundColor: '#f5f6f8',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.on('closed', () => { win = null; });
  wireGraphPage();
}
function buildMenu(){
  const menu = Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        { label: '选择仓库并生成图谱…', accelerator: 'CmdOrCtrl+O', click: async () => {
            const r = await dialog.showOpenDialog(win, { title: '选择 Git 仓库文件夹', properties: ['openDirectory'] });
            if (!r.canceled && r.filePaths.length) loadRepoSync(r.filePaths[0], lastIncludeDiff), showGraph();
          } },
        { label: '返回启动器', accelerator: 'CmdOrCtrl+H', click: () => { if (win) win.loadFile(launcherHtmlPath()); } },
        { type: 'separator' },
        { label: '打开图谱文件所在目录', click: () => shell.showItemInFolder(outHtmlPath()) },
        { type: 'separator' },
        { label: '退出', role: 'quit' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于', click: () => dialog.showMessageBox(win, {
            type: 'info', title: '关于 Git 提交图谱',
            message: 'Git 提交图谱 v2.0\n\n本地优先的 Git 提交历史可视化工具。\n入口：选择本地仓库文件夹，或粘贴 GitHub 仓库地址自动克隆。\n图谱页内可随时「切换仓库 / 刷新」。'
          }) }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createWindow();
  buildMenu();
  win.loadFile(launcherHtmlPath());
});
app.on('window-all-closed', () => { app.quit(); });
