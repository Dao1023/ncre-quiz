#!/usr/bin/env node
/**
 * 浏览器冒烟测试：用本机 Chrome 的无头模式渲染页面，检查关键 DOM。
 * 运行：node tools/browser-smoke.mjs
 * 可选：node tools/browser-smoke.mjs --shots   （同时输出截图到 tools/shots/）
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
];
const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome) {
  console.error('未找到 Chrome / Edge，跳过浏览器测试');
  process.exit(2);
}

const shots = process.argv.includes('--shots');
const shotDir = path.join(ROOT, 'tools', 'shots');
if (shots) fs.mkdirSync(shotDir, { recursive: true });

function render(url, extraArgs = []) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ncre-chrome-'));
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--virtual-time-budget=6000',
    '--user-data-dir=' + profile,
    '--dump-dom'
  ].concat(extraArgs, [url]);
  const res = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 80 * 1024 * 1024, timeout: 60000 });
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  return { dom: res.stdout || '', err: res.stderr || '', status: res.status };
}

function shot(url, file, size, extra = []) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ncre-shot-'));
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--virtual-time-budget=6000', '--user-data-dir=' + profile,
    '--screenshot=' + file, '--window-size=' + size
  ].concat(extra, [url]);
  const res = spawnSync(chrome, args, { encoding: 'utf8', timeout: 60000 });
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  return res.status;
}

const httpUrl = 'http://127.0.0.1:8899/';
const fileUrl = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
}

console.log('浏览器：' + chrome);
console.log('HTTP  ：' + httpUrl);
console.log('FILE  ：' + fileUrl + '\n');

/* ---------- HTTP ---------- */
const http = render(httpUrl);
const hd = http.dom;
check('HTTP 渲染出题目卡片', (hd.match(/class="q-card/g) || []).length > 0,
  'q-card 数量 ' + (hd.match(/class="q-card/g) || []).length);
check('HTTP 题干已渲染', hd.includes('二进制数') && hd.includes('1011'));
check('HTTP 选项已渲染', (hd.match(/class="option/g) || []).length >= 4,
  'option 数量 ' + (hd.match(/class="option/g) || []).length);
check('HTTP 答题卡已渲染', (hd.match(/sheet-cell/g) || []).length >= 50,
  'sheet-cell 数量 ' + (hd.match(/sheet-cell/g) || []).length);
check('HTTP 无致命错误', !hd.includes('题库加载失败') && !hd.includes('renderFatal'));
check('HTTP 数据源为 fetch', hd.includes('data/questions.json') || !hd.includes('本地脚本'));

/* ---------- file:// ---------- */
const file = render(fileUrl);
const fd = file.dom;
check('file:// 渲染出题目卡片', (fd.match(/class="q-card/g) || []).length > 0,
  'q-card 数量 ' + (fd.match(/class="q-card/g) || []).length);
check('file:// 题干已渲染', fd.includes('二进制数') && fd.includes('1011'));
check('file:// 选项已渲染', (fd.match(/class="option/g) || []).length >= 4);
check('file:// 无致命错误', !fd.includes('题库加载失败') && !fd.includes('renderFatal'));

if (shots) {
  shot(httpUrl, path.join(shotDir, 'desktop-light.png'), '1440,1000');
  shot(httpUrl + '?theme=dark', path.join(shotDir, 'desktop-dark.png'), '1440,1000');
  shot(httpUrl, path.join(shotDir, 'mobile-light.png'), '390,844');
  shot(fileUrl, path.join(shotDir, 'file-desktop.png'), '1440,1000');
  console.log('\n截图已输出到 tools/shots/');
}

const failed = results.filter((r) => !r.ok);
console.log('\n结果：' + (results.length - failed.length) + '/' + results.length + ' 通过');
if (failed.length) {
  console.log('\n--- 失败详情 ---');
  for (const f of failed) console.log(f.name + ': ' + f.detail);
  process.exit(1);
}
