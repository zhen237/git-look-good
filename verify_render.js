'use strict';
const fs = require('fs');
const vm = require('vm');

const tpl = fs.readFileSync('template.html', 'utf8');
const expressData = fs.readFileSync('D:/workbuddy/git/gh-demo/express-data.json', 'utf8');

// 提取最后一个 <script>...</script> 块
const m = tpl.match(/<script>([\s\S]*)<\/script>\s*<\/body>/);
if (!m) { console.error('未找到脚本块'); process.exit(1); }
let script = m[1];
// 把 __DATA__ 占位替换成真实 json（避免走 build.js 重新生成）
script = script.replace("const DATA = __DATA__;", "const DATA = __EXPRESS__;");
// 末尾暴露内部状态供校验（currentModel 是 let，vm 不会挂到 sandbox）
script += "\nglobalThis.__currentModel = currentModel;\nglobalThis.__clusterMode = clusterMode;\n";

// ---- DOM / window 打桩 ----
function fakeEl(){
  const el = {
    style: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, removeEventListener(){}, setAttribute(){}, getAttribute(){ return null; },
    appendChild(){}, querySelector(){ return fakeEl(); }, querySelectorAll(){ return []; },
    cloneNode(){ return fakeEl(); }, innerHTML: '', textContent: '', value: '', dataset: {},
    children: [], checked: true, click(){}, remove(){}, getContext(){ return { fillRect(){}, setTransform(){}, drawImage(){}, fillStyle:'' }; }
  };
  return el;
}
const documentStub = {
  getElementById(){ return fakeEl(); },
  querySelector(){ return fakeEl(); },
  querySelectorAll(){ return []; },
  createElement(){ return fakeEl(); },
  addEventListener(){}, body: fakeEl()
};
const windowStub = {
  requestAnimationFrame(cb){ return 0; }, cancelAnimationFrame(){}, devicePixelRatio: 1,
  addEventListener(){}, open(){}, URL: { createObjectURL(){ return ''; }, revokeObjectURL(){} }
};
const sandbox = {
  document: documentStub, window: windowStub, console,
  setTimeout(cb){ /* 立即执行以便初始化完成 */ try { cb(); } catch(e){} return 0; },
  clearTimeout(){}, requestAnimationFrame: windowStub.requestAnimationFrame,
  cancelAnimationFrame(){}, XMLSerializer: function(){}, Blob: function(){}, Image: function(){},
  LS: { _d:{}, get(k,d){ return (k in this._d)? this._d[k]: d; }, set(k,v){ this._d[k]=v; }, remove(k){ delete this._d[k]; } },
  __EXPRESS__: JSON.parse(expressData),
  URL: windowStub.URL
};
sandbox.globalThis = sandbox;

try {
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, { filename: 'template.html' });
} catch (e) {
  console.error('脚本执行抛错：', e.message);
  console.error(e.stack.split('\n').slice(0,5).join('\n'));
  process.exit(2);
}

const model = sandbox.__currentModel;
if (!model) { console.error('currentModel 未生成'); process.exit(3); }
const nodes = model.nodes || [];
let nan = 0, zero = 0;
let minx=Infinity, maxx=-Infinity, miny=Infinity, maxy=-Infinity;
for (const n of nodes){
  if (typeof n._x !== 'number' || isNaN(n._x) || typeof n._y !== 'number' || isNaN(n._y)) nan++;
  else { minx=Math.min(minx,n._x); maxx=Math.max(maxx,n._x); miny=Math.min(miny,n._y); maxy=Math.max(maxy,n._y); }
}
const types = {};
for (const n of nodes) types[n.type] = (types[n.type]||0)+1;
console.log('模式 E 节点总数:', nodes.length);
console.log('节点类型:', JSON.stringify(types));
console.log('NaN/非法坐标节点:', nan);
console.log('model.width =', model.width, ' model.height =', model.height);
console.log('节坐坐标范围 x:[', minx, ',', maxx, '] y:[', miny, ',', maxy, ']');
console.log('聚合模式 clusterMode =', sandbox.__clusterMode);
const ok = nan === 0 && nodes.length > 0 && isFinite(model.width) && isFinite(model.height);
console.log(ok ? '✅ 渲染逻辑正常，坐标合法' : '❌ 存在问题');
process.exit(ok ? 0 : 4);
