'use strict';
// preload：把主进程能力安全暴露给渲染进程（启动器页 + 图谱页注入脚本共用）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gitGraphAPI', {
  // 启动器
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  scanRepo: (p, includeDiff) => ipcRenderer.invoke('scan-repo', p, !!includeDiff),
  cloneRepoStart: (u, includeDiff) => ipcRenderer.invoke('clone-repo-start', u, !!includeDiff),
  cloneCancel: () => ipcRenderer.invoke('clone-cancel'),
  getRecents: () => ipcRenderer.invoke('get-recents'),
  // 克隆进度/完成事件（返回取消订阅函数）
  onCloneProgress: (cb) => {
    const l = (e, d) => cb(d);
    ipcRenderer.on('clone-progress', l);
    return () => ipcRenderer.removeListener('clone-progress', l);
  },
  onCloneDone: (cb) => {
    const l = (e, d) => cb(d);
    ipcRenderer.on('clone-done', l);
    return () => ipcRenderer.removeListener('clone-done', l);
  },
  // 图谱页
  openLauncher: () => ipcRenderer.invoke('open-launcher'),
  refresh: () => ipcRenderer.invoke('refresh'),
  getCurrentRepo: () => ipcRenderer.invoke('get-current-repo')
});
