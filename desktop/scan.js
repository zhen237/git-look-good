#!/usr/bin/env node
'use strict';
// Git 图谱 · M1 数据层扫描器
// CLI:    node scan.js <repoPath> [outputJsonPath]
// 模块:   const { scan } = require('./scan.js'); scan(repoPath, outPath) -> {name, commits, authors, branches}
// 解析 git log --all --source --numstat，按分支精确归属提交，输出结构化 JSON
// （含逐文件增删行数、作者配色、每个提交所属分支数组）

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function scan(repo, out) {
  repo = path.resolve(repo);
  if (!fs.existsSync(path.join(repo, '.git'))) {
    throw new Error('不是 Git 仓库（未找到 .git）: ' + repo);
  }

  function git(args) {
    return execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 });
  }

  // 0) 仓库校验
  try {
    git(['rev-parse', '--is-inside-work-tree']);
  } catch (e) {
    throw new Error('不是 Git 仓库: ' + repo);
  }

  // 1) 本地分支列表
  let branches = [];
  try {
    branches = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'])
      .split('\n').map(s => s.trim()).filter(Boolean);
  } catch (e) {
    branches = [];
  }

  // 2) 每个分支包含的提交（精确归属：一个提交可属于多个分支）
  const branchCommits = {}; // hash -> [branchNames]
  for (const b of branches) {
    let hashes = [];
    try {
      hashes = git(['rev-list', b]).split('\n').map(s => s.trim()).filter(Boolean);
    } catch (e) {
      hashes = [];
    }
    for (const h of hashes) {
      if (!branchCommits[h]) branchCommits[h] = [];
      branchCommits[h].push(b);
    }
  }

  // 3) 解析提交流：每行以 COMMIT 开头 -> 新提交；后续 numstat 行归属当前提交
  const US = '\x1f';
  const pretty = 'COMMIT%x1f%H%x1f%an%x1f%ae%x1f%ad%x1f%P%x1f%s%x1f%S';
  let raw;
  try {
    raw = git(['log', '--all', '--source', '--date=iso', '--pretty=format:' + pretty, '--numstat']);
  } catch (e) {
    throw new Error('git log 失败: ' + e.message);
  }

  const commits = [];
  let cur = null;
  const numRe = /^(\d+|-)\t(\d+|-)\t(.*)$/;
  for (const line of raw.split('\n')) {
    if (line.startsWith('COMMIT')) {
      if (cur) commits.push(cur);
      const p = line.slice('COMMIT'.length + 1).split(US);
      if (p.length < 7) { cur = null; continue; }
      const [hash, an, ae, ad, parents, subject, source] = p;
      cur = {
        hash,
        authorId: ae,
        authorName: an,
        branches: branchCommits[hash] || [],
        primaryBranch: (source && source !== 'HEAD') ? source : '(unknown)',
        time: ad,
        message: subject,
        parents: parents ? parents.split(' ').filter(Boolean) : [],
        filesChanged: 0, additions: 0, deletions: 0,
        files: []
      };
    } else if (cur) {
      const m = line.match(numRe);
      if (m) {
        const a = m[1] === '-' ? 0 : parseInt(m[1], 10);
        const d = m[2] === '-' ? 0 : parseInt(m[2], 10);
        cur.additions += a; cur.deletions += d; cur.filesChanged++;
        cur.files.push({ path: m[3], additions: a, deletions: d });
      }
    }
  }
  if (cur) commits.push(cur);

  // 3.5) 抓取每个提交的 diff patch（完整档）；合并提交跳过以省体积
  for (const c of commits) {
    if (c.parents.length > 1) { c.patch = ''; continue; }
    try {
      c.patch = git(['show', '--format=', '--no-color', '--patch', c.hash]).replace(/^\n+/, '');
    } catch (e) {
      c.patch = '';
    }
  }

  // 4) 作者聚合 + 配色（基准：A. 活泼彩色，循环取色）
  const authorsMap = new Map();
  const authorOrder = [];
  for (const c of commits) {
    const ae = c.authorId;
    if (!authorsMap.has(ae)) {
      authorsMap.set(ae, { id: ae, name: c.authorName, email: ae, commitCount: 0, _min: c.time, _max: c.time });
      authorOrder.push(ae);
    }
    const a = authorsMap.get(ae);
    a.commitCount++;
    if (c.time < a._min) a._min = c.time;
    if (c.time > a._max) a._max = c.time;
  }
  const palette = ['#4E79A7', '#F28E2B', '#59A14F', '#E15759', '#B07AA1', '#76B7B2', '#EDC948', '#FF9DA7'];
  const authors = authorOrder.map((email, i) => {
    const a = authorsMap.get(email);
    return {
      id: a.id, name: a.name, email: a.email,
      color: palette[i % palette.length],
      commitCount: a.commitCount,
      activeStart: a._min, activeEnd: a._max
    };
  });

  // 5) 各分支提交数
  const branchCounts = {};
  for (const c of commits) for (const b of c.branches) branchCounts[b] = (branchCounts[b] || 0) + 1;
  const branchInfo = branches.map(name => ({ name, commitCount: branchCounts[name] || 0 }));

  // 5.1) 默认分支（用于前端"分支拓扑"模式的主干）
  let defaultBranch = '';
  try { defaultBranch = git(['symbolic-ref', '--short', 'HEAD']).trim(); } catch (e) { defaultBranch = branches[0] || 'main'; }
  if (!branches.includes(defaultBranch)) defaultBranch = branches[0] || 'main';

  // 6) 组装并写出
  const result = {
    meta: {
      generatedAt: new Date().toISOString(),
      gitVersion: git(['--version']).trim(),
      source: 'git log --all --source --numstat + rev-list per branch'
    },
    repo: {
      name: path.basename(path.resolve(repo)),
      path: path.resolve(repo),
      defaultBranch,
      branches: branchInfo,
      commitCount: commits.length,
      authorCount: authors.length
    },
    authors,
    commits
  };

  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  return { name: result.repo.name, commits: commits.length, authors: authors.length, branches: branches.length, out };
}

module.exports = { scan };

// ---- CLI 入口（保持原有命令行用法）----
if (require.main === module) {
  const repo = process.argv[2] || process.cwd();
  const out = process.argv[3] || path.join(process.cwd(), 'git-graph-data.json');
  try {
    const r = scan(repo, out);
    console.log('扫描完成:', r.name);
    console.log('  提交数:', r.commits, ' 作者数:', r.authors, ' 分支数:', r.branches);
    console.log('  输出:', r.out);
  } catch (e) {
    console.error('错误：' + e.message);
    process.exit(1);
  }
}
