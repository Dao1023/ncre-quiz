#!/usr/bin/env node
/**
 * HTTP 验收：需要先在本目录启动 `python -m http.server 8899 --bind 127.0.0.1`。
 * 运行：node tools/http-check.mjs
 */
const BASE = 'http://127.0.0.1:8899';
const failures = [];
let checks = 0;

async function check(name, fn) {
  checks += 1;
  try {
    await fn();
    console.log('PASS ' + name);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.log('FAIL ' + name + ' — ' + err.message);
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function get(pathname) {
  const res = await fetch(BASE + pathname, { cache: 'no-store' });
  return { res, text: await res.text() };
}

await check('首页返回 200 且是 HTML', async () => {
  const { res, text } = await get('/');
  assert(res.status === 200, 'status=' + res.status);
  assert(/text\/html/.test(res.headers.get('content-type') || ''), 'content-type 不是 html');
  assert(text.indexOf('id="view"') >= 0, 'HTML 中没有根节点 #view');
  assert(text.indexOf('src="app.js"') >= 0, 'HTML 没有引用 app.js');
  assert(text.indexOf('href="styles.css"') >= 0, 'HTML 没有引用 styles.css');
});

await check('app.js / styles.css 可访问且非空', async () => {
  const js = await get('/app.js');
  assert(js.res.status === 200, 'app.js status=' + js.res.status);
  assert(js.text.length > 20000, 'app.js 体积异常：' + js.text.length);
  assert(js.text.indexOf('function normalizeBank') >= 0, 'app.js 内容不完整');
  const css = await get('/styles.css');
  assert(css.res.status === 200, 'styles.css status=' + css.res.status);
  assert(css.text.length > 5000, 'styles.css 体积异常：' + css.text.length);
});

await check('data/questions.json 返回 200 且有 51 题', async () => {
  const { res, text } = await get('/data/questions.json');
  assert(res.status === 200, 'status=' + res.status);
  const data = JSON.parse(text);
  assert(data.questions.length === 51, '题数=' + data.questions.length);
  assert(data.meta.subjects.length === 4, '科目数=' + data.meta.subjects.length);
});

await check('data/questions.js 返回 200 且能挂载 __BANK__', async () => {
  const { res, text } = await get('/data/questions.js');
  assert(res.status === 200, 'status=' + res.status);
  assert(text.indexOf('__BANK__') >= 0, '没有 __BANK__');
  assert(text.indexOf('module.exports') >= 0, '没有 CJS 兼容');
});

await check('题目配图可访问', async () => {
  const { res, text } = await get('/images/net-topology.svg');
  assert(res.status === 200, 'status=' + res.status);
  assert(/svg/.test(text.slice(0, 200)), '不是 SVG');
});

console.log('\n结果：' + (checks - failures.length) + '/' + checks + ' 通过');
if (failures.length) {
  for (const f of failures) console.log('- ' + f.name + ': ' + f.message);
  process.exit(1);
}
