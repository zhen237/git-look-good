#!/usr/bin/env node
'use strict';
// ============================================================
//  Git 提交图谱 · 一键生成入口
//  用法:
//     node run.js <仓库路径>      —— 直接扫描指定仓库
//     node run.js                 —— 交互输入仓库路径（回车=当前目录）
//     （Windows 下也可把仓库文件夹拖到「一键生成.bat」上）
//  流程: scan.js(扫描) → build.js(构建单文件) → 自动打开图谱
//  环境变量 GITGRAPH_NO_OPEN=1 可跳过自动打开（供脚本测试用）
// ============================================================
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SELF = __dirname;                                   // 工具所在目录
const dataPath = path.join(SELF, 'data.json');            // 扫描中间产物（会被覆盖）
const outPath = path.join(SELF, 'git-graph.html');        // 最终单文件图谱

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(q, a => { rl.close(); res(a.trim()); }));
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('\n[错误] 执行失败: ' + cmd + ' ' + args.join(' '));
    process.exit(r.status || 1);
  }
}

function openFile(p) {
  const plat = process.platform;
  if (plat === 'win32') spawnSync('cmd', ['/c', 'start', '', p], { stdio: 'ignore' });
  else if (plat === 'darwin') spawnSync('open', [p], { stdio: 'ignore' });
  else spawnSync('xdg-open', [p], { stdio: 'ignore' });
}

async function main() {
  let repo = (process.argv[2] || '').replace(/^"|"$/g, '').trim();
  if (!repo) {
    repo = (await ask('请输入 Git 仓库路径（可直接指向 .git 目录；回车=扫描当前目录）: ')).replace(/^"|"$/g, '').trim() || process.cwd();
  }
  repo = path.resolve(repo);
  // 智能剥离结尾的 "/.git" 或 "\.git"（用户常误把 .git 当成仓库根）
  if (/[\\\/]\.git$/i.test(repo)) repo = path.dirname(repo);
  repo = repo.replace(/[\\\/]+$/, '');

  if (!fs.existsSync(path.join(repo, '.git'))) {
    console.error('[错误] 不是 Git 仓库（未找到 .git）: ' + repo);
    process.exit(1);
  }

  console.log('\n[1/3] 扫描仓库: ' + repo);
  run(process.execPath, [path.join(SELF, 'scan.js'), repo, dataPath]);

  console.log('\n[2/3] 构建单文件图谱...');
  run(process.execPath, [path.join(SELF, 'build.js'), dataPath]);

  console.log('\n[3/3] 完成 ✅');
  console.log('  图谱文件: ' + outPath);
  console.log('  以后查看: 直接双击 ' + path.basename(outPath) + ' 即可（离线可用）');
  if (!process.env.GITGRAPH_NO_OPEN) openFile(outPath);
}

main().catch(e => { console.error(e); process.exit(1); });
