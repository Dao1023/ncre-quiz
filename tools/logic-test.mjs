#!/usr/bin/env node
/**
 * 纯逻辑冒烟测试（不依赖浏览器）：
 * 把 app.js 的 IIFE 尾部 boot() 替换为测试导出，然后用 Node 直接调用内部的
 * 归一化 / CSV 解析 / 判题 / 组卷函数，覆盖真实题库和一堆脏数据。
 *
 * 运行：node tools/logic-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const ROOT = path.resolve(import.meta.dirname, '..');
const appPath = path.join(ROOT, 'app.js');

/* ---------- 极简浏览器环境，够 IIFE 求值即可 ---------- */
globalThis.window = globalThis;
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => { memory.set(k, String(v)); },
  removeItem: (k) => { memory.delete(k); }
};
globalThis.document = {
  documentElement: {
    getAttribute: () => null,
    setAttribute: () => {},
    style: {}
  },
  body: { dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
  addEventListener() {},
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, appendChild() {}, remove() {}, click() {} }),
  head: { appendChild() {} }
};

/* ---------- 注入测试导出 ---------- */
let src = fs.readFileSync(appPath, 'utf8');
const bootAt = src.lastIndexOf('  boot();');
if (bootAt < 0) throw new Error('app.js 中找不到 boot() 调用，测试注入失败');
const exportCode = [
  '  globalThis.__NCRE__ = {',
  '    normalizeType, normalizeOptions, normalizeAnswer, normalizeQuestion, normalizeBank,',
  '    judgeSide, checkFill, parseCSV, csvToBank, inspectImport, sanitizeProgress,',
  '    buildOrder, filteredQuestions, bankStats, defaultProgress,',
  '    setBank: (b) => { bank = b; },',
  '    setProgress: (p) => { progress = p; },',
  '    setFilters: (f) => { filters = f; },',
  '    setMode: (m) => { mode = m; },',
  '    setView: (v) => { view = v; },',
  '    render, renderQuiz, renderStudy, renderStats,',
  '    loadBankData,',
  '    getOrder: () => order.slice(),',
  '    getIndex: () => idx',
  '  };'
].join('\n');
src = src.slice(0, bootAt) + exportCode + src.slice(bootAt + '  boot();'.length);
vm.runInThisContext(src, { filename: 'app.js' });

const T = globalThis.__NCRE__;
if (!T) throw new Error('测试导出未生成');

/* ---------- 渲染冒烟用的极简 DOM（记录 innerHTML，不做真实布局） ---------- */
const els = new Map();
function makeEl(sel) {
  return {
    sel,
    innerHTML: '',
    textContent: '',
    value: '',
    title: '',
    disabled: false,
    style: { width: '', setProperty() {} },
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    scrollTop: 0,
    clientHeight: 0,
    offsetTop: 0,
    offsetHeight: 0,
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild() {},
    removeChild() {},
    setAttribute() {},
    getAttribute: () => null,
    addEventListener() {},
    focus() {},
    click() {},
    remove() {}
  };
}
globalThis.NodeFilter = { SHOW_ELEMENT: 1 };
globalThis.document = {
  title: '',
  body: makeEl('body'),
  documentElement: makeEl('html'),
  querySelector(sel) {
    if (!els.has(sel)) els.set(sel, makeEl(sel));
    return els.get(sel);
  },
  querySelectorAll: () => [],
  createElement: (tag) => {
    // sanitizeHtml 用 <template> 解析；测试里只做透传，不做节点清洗
    if (tag === 'template') {
      return {
        innerHTML: '',
        content: { querySelectorAll: () => [] }
      };
    }
    if (tag === 'script') {
      return {
        tag: 'script',
        src: '',
        _onload: null,
        _onerror: null,
        set onload(fn) { this._onload = fn; },
        get onload() { return this._onload; },
        set onerror(fn) { this._onerror = fn; },
        get onerror() { return this._onerror; }
      };
    }
    return makeEl(tag);
  },
  head: {
    appendChild(script) {
      // 模拟浏览器执行经典 <script>：同步求值 data/questions.js
      try {
        const code = fs.readFileSync(path.join(ROOT, script.src), 'utf8');
        vm.runInThisContext(code, { filename: script.src });
        if (script._onload) script._onload();
      } catch (err) {
        if (script._onerror) script._onerror(err);
      }
    }
  },
  createTreeWalker: () => ({ nextNode: () => false }),
  addEventListener() {}
};

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('PASS ' + name);
  } catch (err) {
    const where = (err.stack || '').split('\n')[1] || '';
    failures.push({ name, message: err.message + ' @' + where.trim() });
    console.log('FAIL ' + name + ' — ' + err.message + ' @' + where.trim());
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('PASS ' + name);
  } catch (err) {
    const where = (err.stack || '').split('\n')[1] || '';
    failures.push({ name, message: err.message + ' @' + where.trim() });
    console.log('FAIL ' + name + ' — ' + err.message + ' @' + where.trim());
  }
}

/* ================= 真实题库 ================= */
const sampleBank = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'questions.json'), 'utf8'));
const bank = T.normalizeBank(sampleBank);

test('真实题库：51 题、4 科、题型齐全', () => {
  assert.equal(bank.questions.length, 51);
  assert.equal(bank.subjects.length, 4);
  assert.deepEqual(bank.types, ['single', 'multi', 'judge', 'fill', 'essay', 'operation']);
});

test('真实题库：每道题答案与题型自洽', () => {
  for (const q of bank.questions) {
    if (q.type === 'single') {
      assert.equal(q.answer.length, 1, q.id + ' 单选答案应为 1 个字母，实际 ' + q.answer);
      assert.ok(q.options.some((o) => o.key === q.answer), q.id + ' 单选答案不在选项中');
    } else if (q.type === 'multi') {
      assert.ok(q.answer.length >= 2, q.id + ' 多选答案少于 2 个');
      for (const letter of q.answer) {
        assert.ok(q.options.some((o) => o.key === letter), q.id + ' 多选答案 ' + letter + ' 不在选项中');
      }
    } else if (q.type === 'judge') {
      assert.ok(/^[TF]$/.test(q.answer), q.id + ' 判断答案应为 T/F');
      assert.equal(q.options.length, 2);
    } else {
      assert.ok(String(q.answer).length > 0, q.id + ' 非选择题答案为空');
    }
  }
});

test('questions.js 与 questions.json 内容一致', () => {
  // questions.js 是经典 IIFE + module.exports，可用 CJS require 同步加载
  const mod = require(path.join(ROOT, 'data', 'questions.js'));
  assert.equal(mod.questions.length, 51);
  assert.equal(globalThis.window.__BANK__.questions.length, 51);
  assert.deepEqual(JSON.parse(JSON.stringify(globalThis.window.__BANK__)), sampleBank);
});

test('questions.js 作为浏览器经典 script 能挂载 window.__BANK__', () => {
  const code = fs.readFileSync(path.join(ROOT, 'data', 'questions.js'), 'utf8');
  const sandbox = {};
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'questions.js' });
  assert.equal(sandbox.__BANK__.questions.length, 51);
  assert.equal(sandbox.window.__BANK__.questions.length, 51);
});

/* ================= 脏数据容错 ================= */
test('normalizeType：中英文题型都能识别', () => {
  const cases = {
    single: 'single', '单选题': 'single', '多选': 'multi', '判断题': 'judge',
    '填空题': 'fill', '简答题': 'essay', '操作题': 'operation',
    '': 'fill'
  };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(T.normalizeType(input, {}), expected, '题型 ' + input);
  }
});

test('normalizeOptions：数组、对象映射、判断题', () => {
  assert.deepEqual(T.normalizeOptions(['甲', '乙', '丙'], 'single').map((o) => o.key + o.text), ['A甲', 'B乙', 'C丙']);
  const mapped = T.normalizeOptions({ A: '一', B: '二' }, 'single');
  assert.deepEqual(mapped.map((o) => o.key), ['A', 'B']);
  const judge = T.normalizeOptions(null, 'judge');
  assert.deepEqual(judge.map((o) => o.key), ['T', 'F']);
});

test('normalizeQuestion：缺字段 / 纯文本 / 选项按文本给答案', () => {
  const q = T.normalizeQuestion({ stem: '纯文本题干', options: ['甲', '乙'], answer: '乙' }, 0, 'X');
  assert.equal(q.id, 'q1');
  assert.equal(q.subject, 'X');
  assert.equal(q.type, 'single');
  assert.equal(q.answer, 'B');
  assert.equal(q.explain, '');
});

test('normalizeQuestion：中文判断答案与多选答案', () => {
  const judge = T.normalizeQuestion({ type: '判断题', stem: 's', answer: '正确' }, 0);
  assert.equal(judge.type, 'judge');
  assert.equal(judge.answer, 'T');
  const multi = T.normalizeQuestion({ type: 'multi', stem: 's', options: ['1', '2', '3', '4'], answer: 'a,d' }, 1);
  assert.equal(multi.type, 'multi');
  assert.equal(multi.answer, 'AD');
});

test('normalizeQuestion：单选却给多个字母时升级为多选', () => {
  const q = T.normalizeQuestion({ type: 'single', stem: 's', options: ['1', '2', '3'], answer: 'AB' }, 0);
  assert.equal(q.type, 'multi');
  assert.equal(q.answer, 'AB');
});

test('normalizeQuestion：没有选项的单选题降级为填空', () => {
  const q = T.normalizeQuestion({ type: 'single', stem: 's', answer: 'A' }, 0);
  assert.equal(q.type, 'fill');
  assert.equal(q.answer, 'A');
});

test('normalizeBank：重复 id 自动加后缀，自动补科目', () => {
  const b = T.normalizeBank({ questions: [
    { id: 'x', stem: '一', options: ['a', 'b'], answer: 'A' },
    { id: 'x', stem: '二', options: ['a', 'b'], answer: 'B' }
  ] });
  assert.equal(b.questions.length, 2);
  assert.deepEqual(b.questions.map((q) => q.id), ['x', 'x-2']);
  assert.ok(b.subjects.some((s) => s.code === 'DEFAULT'));
});

test('normalizeBank：裸数组与 data 字段都能接受', () => {
  const a = T.normalizeBank([{ stem: 's', options: ['a', 'b'], answer: 'A' }]);
  assert.equal(a.questions.length, 1);
  const d = T.normalizeBank({ data: [{ stem: 's', options: ['a', 'b'], answer: 'A' }] });
  assert.equal(d.questions.length, 1);
});

/* ================= 判题 ================= */
test('checkFill：去空格、全角数字、多答案分隔', () => {
  assert.equal(T.checkFill(' 1024 ', '1024'), true);
  assert.equal(T.checkFill('１０２４', '1024'), true);
  assert.equal(T.checkFill('正确', '对|正确'), true);
  assert.equal(T.checkFill('1025', '1024'), false);
  assert.equal(T.checkFill('', '1024'), false);
});

test('judgeSide：多种对错写法', () => {
  assert.equal(T.judgeSide('对'), 'T');
  assert.equal(T.judgeSide('FALSE'), 'F');
  assert.equal(T.judgeSide('√'), 'T');
  assert.equal(T.judgeSide(''), null);
});

/* ================= CSV / 导入 ================= */
test('parseCSV：引号内的逗号与换行、CRLF、BOM', () => {
  const rows = T.parseCSV('\uFEFF题干,选项A,选项B,答案,解析\r\n"含,逗号",甲,乙,A,"解析,也含逗号"\r\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], '含,逗号');
  assert.equal(rows[1][4], '解析,也含逗号');
});

test('csvToBank：带表头导入并推断题型', () => {
  const csv = [
    '题干,选项A,选项B,选项C,选项D,答案,解析',
    '1+1=?,1,2,3,4,B,基础算术',
    '下列属于偶数的有,2,3,4,5,AC,2 和 4 是偶数',
    '太阳从东边升起,对,,,,对,常识'
  ].join('\n');
  const out = T.csvToBank(csv, '我的题库.csv');
  assert.equal(out.bank.questions.length, 3);
  assert.equal(out.bank.questions[0].type, 'single');
  assert.equal(out.bank.questions[1].type, 'multi');
  assert.equal(out.bank.questions[2].type, 'judge');
  assert.equal(out.bank.questions[0].subject, 'CUSTOM');
  assert.equal(out.bank.meta.title, '我的题库');
});

test('csvToBank：无表头按固定列序', () => {
  const out = T.csvToBank('1+1 等于几,1,2,3,4,B,基础算术', 'x.csv');
  assert.equal(out.bank.questions.length, 1);
  assert.equal(out.bank.questions[0].options.length, 4);
  assert.equal(out.bank.questions[0].answer, 'B');
});

test('inspectImport：单行 CSV（无扩展名提示）也走 CSV', () => {
  const out = T.inspectImport('1+1 等于几,1,2,3,4,B,基础算术', '');
  assert.equal(out.bank.questions.length, 1);
  assert.equal(out.bank.questions[0].answer, 'B');
});

test('inspectImport：容忍 JSON 文件带 BOM', () => {
  const out = T.inspectImport('\uFEFF' + JSON.stringify({ questions: [{ stem: 's', options: ['a', 'b'], answer: 'A' }] }), 'bom.json');
  assert.equal(out.bank.questions.length, 1);
});

test('inspectImport：识别完整备份、裸数组、仅进度', () => {
  const backup = T.inspectImport(JSON.stringify({
    app: 'ncre-quiz', version: 1,
    bank: { meta: { title: 't' }, questions: [{ stem: 's', options: ['a', 'b'], answer: 'A' }] },
    progress: { answers: { q1: { picked: 'A', correct: true } } }
  }), 'backup.json');
  assert.equal(backup.bank.questions.length, 1);
  assert.ok(backup.progress);

  const arr = T.inspectImport(JSON.stringify([{ stem: 's', options: ['a', 'b'], answer: 'A' }]), 'a.json');
  assert.equal(arr.bank.questions.length, 1);

  const progressOnly = T.inspectImport(JSON.stringify({ app: 'ncre-quiz', progress: { answers: {} } }), 'p.json');
  assert.equal(progressOnly.bank, null);
  assert.ok(progressOnly.progress);
});

test('inspectImport：坏 JSON 给出可读错误', () => {
  assert.throws(() => T.inspectImport('{oops', 'x.json'), /JSON 解析失败/);
});

/* ================= 进度与组卷 ================= */
test('sanitizeProgress：缺失字段补默认值', () => {
  const p = T.sanitizeProgress({ counters: { attempts: '3' } });
  assert.equal(p.counters.attempts, 3);
  assert.equal(p.counters.correct, 0);
  assert.deepEqual(p.answers, {});
  assert.equal(p.settings.theme, 'auto');
});

test('buildOrder：顺序 / 科目筛选 / 错题 / 收藏 / 随机', () => {
  T.setBank(bank);
  T.setProgress(T.defaultProgress());
  T.setFilters({ subject: 'all', type: 'all' });
  T.setMode('seq');
  T.buildOrder();
  assert.equal(T.getOrder().length, 51);
  assert.equal(T.getOrder()[0], '10001');

  T.setFilters({ subject: 'WLSJ', type: 'all' });
  T.buildOrder();
  assert.equal(T.getOrder().length, 14);

  T.setFilters({ subject: 'all', type: 'all' });
  const p = T.defaultProgress();
  p.wrong = { 10001: true, 10028: true };
  p.favs = { 10042: true };
  T.setProgress(p);

  T.setMode('wrong');
  T.buildOrder();
  assert.deepEqual(T.getOrder().sort(), ['10001', '10028']);

  T.setMode('fav');
  T.buildOrder();
  assert.deepEqual(T.getOrder(), ['10042']);

  T.setMode('random');
  T.buildOrder();
  const randomOrder = T.getOrder();
  assert.equal(randomOrder.length, 51);
  assert.deepEqual(randomOrder.slice().sort(), bank.questions.map((q) => q.id).sort());

  T.setMode('seq');
  T.buildOrder('10028');
  assert.equal(T.getOrder()[T.getIndex()], '10028');
});

test('buildOrder：错题模式为空时安全降级', () => {
  T.setBank(bank);
  T.setProgress(T.defaultProgress());
  T.setFilters({ subject: 'all', type: 'all' });
  T.setMode('wrong');
  T.buildOrder();
  assert.equal(T.getOrder().length, 0);
  assert.equal(T.getIndex(), 0);
});

/* ================= 渲染函数冒烟（DOM stub，无真实布局） ================= */
test('渲染冒烟：刷题界面含题干、选项、答题卡', () => {
  T.setBank(bank);
  T.setProgress(T.defaultProgress());
  T.setFilters({ subject: 'all', type: 'all' });
  T.setMode('seq');
  T.setView('quiz');
  T.buildOrder();
  T.render();
  const html = els.get('#view').innerHTML;
  assert.ok(html.indexOf('data-qid="10001"') >= 0, '缺少题目卡片');
  assert.ok(html.indexOf('data-act="pick"') >= 0, '缺少可点选项');
  assert.ok(html.indexOf('第 <b>1</b> / 51 题') >= 0, '缺少题号进度');
  assert.ok(html.indexOf('转换成十进制数') >= 0, '题干未渲染');
  const sheetHtml = els.get('#sheet').innerHTML;
  assert.equal((sheetHtml.match(/data-act="jump"/g) || []).length, 51, '答题卡格子数不是 51');
  assert.equal(els.get('#progress-label').textContent, '已做 0 / 51');
});

test('渲染冒烟：答对显示绿色/解析，答错显示红色/错题提示', () => {
  const p = T.defaultProgress();
  p.answers['10001'] = { picked: 'B', correct: true, ts: 1 };
  T.setProgress(p);
  T.setView('quiz');
  T.render();
  let html = els.get('#view').innerHTML;
  assert.ok(html.indexOf('is-correct') >= 0, '正确项没有高亮');
  assert.ok(html.indexOf('回答正确') >= 0, '缺少正确横幅');
  assert.ok(html.indexOf('class="explain"') >= 0, '缺少解析');

  p.answers['10001'] = { picked: 'A', correct: false, ts: 1 };
  p.wrong['10001'] = true;
  p.mistakes['10001'] = 1;
  T.setProgress(p);
  T.render();
  html = els.get('#view').innerHTML;
  assert.ok(html.indexOf('is-wrong') >= 0, '错误项没有标红');
  assert.ok(html.indexOf('is-correct') >= 0, '答错时未高亮正确项');
  assert.ok(html.indexOf('回答错误') >= 0, '缺少错误横幅');
  assert.equal(els.get('#stat-done').textContent, '1');
  assert.equal(els.get('#stat-wrong').textContent, '1');
});

test('渲染冒烟：背题模式铺开全部 51 题', () => {
  T.setMode('study');
  T.setView('quiz');
  T.setProgress(T.defaultProgress());
  T.render();
  const html = els.get('#view').innerHTML;
  assert.equal((html.match(/class="study-card"/g) || []).length, 51);
  assert.ok(html.indexOf('背题模式') >= 0);
  assert.ok(html.indexOf('class="study-answer"') >= 0, '背题模式没有直接显示答案');
  assert.ok(html.indexOf('class="study-explain"') >= 0, '背题模式没有解析');
});

test('渲染冒烟：统计页正确率、分布、错题 TOP', () => {
  const p = T.defaultProgress();
  p.answers['10001'] = { picked: 'B', correct: true, ts: 1 };
  p.answers['10002'] = { picked: 'A', correct: false, ts: 1 };
  p.wrong['10002'] = true;
  p.mistakes['10002'] = 2;
  T.setProgress(p);
  T.setMode('seq');
  T.setView('stats');
  T.render();
  const html = els.get('#view').innerHTML;
  assert.ok(html.indexOf('学习统计') >= 0);
  assert.ok(html.indexOf('50%') >= 0, '正确率应为 50%');
  assert.ok(html.indexOf('按科目') >= 0 && html.indexOf('按题型') >= 0);
  assert.ok(html.indexOf('错题 TOP') >= 0);
  assert.ok(html.indexOf('data-act="goto-wrong"') >= 0, '错题列表缺少去重做按钮');
  assert.ok(html.indexOf('答错 2 次') >= 0);
});

/* ================= 加载路径（模拟 file:// 与 fetch 失败） ================= */
await testAsync('file:// 加载：直接注入 data/questions.js 并拿到 __BANK__', async () => {
  delete globalThis.__BANK__;
  globalThis.location = { protocol: 'file:', search: '' };
  const loaded = await T.loadBankData();
  assert.equal(loaded.source, 'file');
  assert.equal(loaded.questions.length, 51);
  assert.equal(globalThis.window.__BANK__.questions.length, 51);
});

await testAsync('HTTP fetch 失败：自动降级到脚本加载', async () => {
  delete globalThis.__BANK__;
  globalThis.location = { protocol: 'http:', search: '' };
  globalThis.fetch = async () => { throw new Error('模拟 CORS/断网'); };
  const loaded = await T.loadBankData();
  assert.equal(loaded.source, 'script');
  assert.equal(loaded.questions.length, 51);
});

/* ================= 汇总 ================= */
console.log('\n结果：' + passed + '/' + (passed + failures.length) + ' 通过');
if (failures.length) {
  console.log('\n失败项：');
  for (const f of failures) console.log('- ' + f.name + ': ' + f.message);
  process.exit(1);
}
