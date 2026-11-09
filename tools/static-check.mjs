#!/usr/bin/env node
/**
 * 静态一致性检查：文件存在、id 引用、data-act 处理、图片存在、题库完整性。
 * 运行：node tools/static-check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..');
const failures = [];
let checks = 0;

function check(name, fn) {
  checks += 1;
  try {
    fn();
    console.log('PASS ' + name);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.log('FAIL ' + name + ' — ' + err.message);
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message);
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const html = read('index.html');
const app = read('app.js');
const css = read('styles.css');
const bankRaw = read('data/questions.json');
const bankJs = read('data/questions.js');
const bank = JSON.parse(bankRaw);

check('必需文件齐全', () => {
  for (const rel of ['index.html', 'app.js', 'styles.css', 'data/questions.json', 'data/questions.js',
    'tools/build-data.mjs', 'tools/make-sample-bank.mjs', 'README.md', 'images/net-topology.svg']) {
    assert(exists(rel), '缺少 ' + rel);
  }
});

check('index.html 引用了正确的样式与脚本', () => {
  assert(/<link[^>]+href="styles\.css"/.test(html), '没有引用 styles.css');
  assert(/<script[^>]+src="app\.js"><\/script>/.test(html), '没有经典 script 引入 app.js');
  assert(html.indexOf('type="module"') < 0, 'index.html 不应使用 module script（file:// 会被 CORS 拦）');
  assert(/id="view"/.test(html), '缺少根节点 #view');
  assert(/id="sheet"/.test(html), '缺少答题卡 #sheet');
  assert(!/data\/questions\.js(?!on)/.test(html), 'questions.js 应由 app.js 按需注入，不应静态写死');
});

check('所有 data/questions.js 注入路径存在', () => {
  assert(app.indexOf("'data/questions.js'") >= 0, 'app.js 没有脚本降级路径');
  assert(app.indexOf("fetch('data/questions.json'") >= 0, 'app.js 没有 fetch 主路径');
  assert(app.indexOf("location.protocol === 'file:'") >= 0, '没有 file:// 分支');
  assert(app.indexOf('window.__BANK__') >= 0, '没有 __BANK__ 兼容');
});

check('app.js 中 $(\'#id\') 引用都能找到对应节点', () => {
  const refs = new Set();
  const re = /\$\('#([A-Za-z0-9_-]+)'\)/g;
  let m;
  while ((m = re.exec(app))) refs.add(m[1]);
  const ids = new Set();
  const idRe = /id="([A-Za-z0-9_-]+)"/g;
  while ((m = idRe.exec(html))) ids.add(m[1]);
  while ((m = idRe.exec(app))) ids.add(m[1]);
  const missing = [...refs].filter((id) => !ids.has(id));
  assert(missing.length === 0, '找不到的 id：' + missing.join(', '));
});

check('index.html 中所有 data-act 都有处理分支', () => {
  const cases = new Set();
  const caseRe = /case '([a-z-]+)'/g;
  let m;
  while ((m = caseRe.exec(app))) cases.add(m[1]);
  const acts = new Set();
  const actRe = /data-act="([a-z-]+)"/g;
  for (const text of [html, app]) {
    while ((m = actRe.exec(text))) acts.add(m[1]);
  }
  const missing = [...acts].filter((a) => !cases.has(a));
  assert(missing.length === 0, '没有处理逻辑的 data-act：' + missing.join(', '));
});

check('题库图片引用都存在', () => {
  const refs = new Set();
  const add = (src) => {
    if (!src || /^(https?:|data:|blob:)/i.test(src)) return;
    refs.add(src.replace(/^\.?\//, ''));
  };
  for (const q of bank.questions) {
    (q.images || []).forEach(add);
    const re = /<img\b[^>]*\bsrc="([^"]+)"/gi;
    let m;
    while ((m = re.exec(q.stem || ''))) add(m[1]);
  }
  for (const text of [html, css]) {
    const re = /url\((['"]?)([^'")]+)\1\)/gi;
    let m;
    while ((m = re.exec(text))) add(m[2]);
  }
  const missing = [...refs].filter((rel) => !exists(rel));
  assert(missing.length === 0, '缺少图片：' + missing.join(', '));
});

check('题库 JSON 结构完整', () => {
  assert(bank && Array.isArray(bank.questions), 'questions 不是数组');
  assert(bank.questions.length >= 30 && bank.questions.length <= 60, '样例题数量不在 30~60：' + bank.questions.length);
  assert(bank.meta && Array.isArray(bank.meta.subjects) && bank.meta.subjects.length === 4, 'meta.subjects 不完整');
  assert(bank.meta.updated === '2026-11-09', 'meta.updated 应为 2026-11-09');
  const ids = new Set();
  for (const q of bank.questions) {
    assert(q.id && !ids.has(q.id), 'id 重复或为空：' + q.id);
    ids.add(q.id);
    assert(['single', 'multi', 'judge', 'fill', 'essay', 'operation'].includes(q.type), '非法题型：' + q.type);
    assert(typeof q.stem === 'string' && q.stem.length > 0, q.id + ' 题干为空');
    assert(q.answer != null && String(q.answer).length > 0, q.id + ' 答案为空');
  }
  const subjects = new Set(bank.meta.subjects.map((s) => s.code));
  for (const q of bank.questions) assert(subjects.has(q.subject), q.id + ' 的科目不在 meta.subjects 中');
});

check('questions.js 是经典脚本且与 JSON 等价', () => {
  assert(!/^\s*(import|export)\s/m.test(bankJs), 'questions.js 含 ESM 语法，file:// 下无法 classic 执行');
  assert(bankJs.indexOf('__BANK__') >= 0, 'questions.js 没有挂载 __BANK__');
  assert(bankJs.indexOf('module.exports') >= 0, 'questions.js 无法被 Node require');
  const mod = JSON.parse(JSON.stringify(require(path.join(ROOT, 'data', 'questions.js'))));
  assert(mod.questions.length === bank.questions.length, 'questions.js 与 JSON 题数不一致');
});

check('源码没有遗留 TODO/FIXME 占位', () => {
  for (const [rel, text] of [['index.html', html], ['app.js', app], ['styles.css', css]]) {
    const m = text.match(/\b(TODO|FIXME|XXX)\b/);
    assert(!m, rel + ' 残留 ' + (m ? m[0] : ''));
  }
});

console.log('\n结果：' + (checks - failures.length) + '/' + checks + ' 通过');
if (failures.length) {
  for (const f of failures) console.log('- ' + f.name + ': ' + f.message);
  process.exit(1);
}
