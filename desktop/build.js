#!/usr/bin/env node
'use strict';
// 构建脚本：把 data.json 嵌入 template.html，产出单文件可双击打开的 git-graph.html
// CLI:  node build.js [dataJsonPath] [outHtmlPath]
// 模块: const { build } = require('./build.js'); build(dataJsonPath, outHtmlPath)
const fs = require('fs');
const path = require('path');

function build(dataPath, outPath) {
  dataPath = dataPath || path.join(__dirname, 'data.json');
  outPath = outPath || path.join(__dirname, 'git-graph.html');
  const tplPath = path.join(__dirname, 'template.html');

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  let tpl = fs.readFileSync(tplPath, 'utf8');

  if (!tpl.includes('__DATA__')) {
    throw new Error('模板缺少 __DATA__ 占位符: ' + tplPath);
  }
  // 关键修复：第二个参数必须是「函数」而不是字符串。
  // 若直接传 JSON.stringify(data) 这个字符串，数据里一旦出现 $& / $` / $' / $1~$9
  // 会被 String.replace 当作特殊替换标记解释（例如 $` 会把模板前缀整段注入数据，
  // 其中包含换行等控制字符，导致 JSON.parse 报 "Bad control character"、整文件 JS 语法错误）。
  // 用 replacer 函数返回，返回值一律按字面量插入，彻底规避该坑。
  tpl = tpl.replace('__DATA__', () => JSON.stringify(data).replace(/<\/script>/gi, '<\\/script>'));
  fs.writeFileSync(outPath, tpl);
  return { out: outPath, commits: data.commits.length, sizeKB: (fs.statSync(outPath).size / 1024).toFixed(1) };
}

module.exports = { build };

// ---- CLI 入口 ----
// 用法: node build.js [dataJsonPath] [outHtmlPath]
if (require.main === module) {
  const dataPath = process.argv[2] || path.join(__dirname, 'data.json');
  const outPath = process.argv[3] || path.join(__dirname, 'git-graph.html');
  try {
    const r = build(dataPath, outPath);
    console.log('已生成:', r.out, '  嵌入提交数:', r.commits, ' 大小:', r.sizeKB + ' KB');
  } catch (e) {
    console.error('错误：' + e.message);
    process.exit(1);
  }
}
