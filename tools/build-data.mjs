#!/usr/bin/env node
/**
 * 把 data/questions.json 转换为可被 <script> 直接加载、也可被 Node require/import 的 data/questions.js
 *
 * 为什么需要它：
 *   双击 index.html 时页面处于 file:// 协议，fetch('data/questions.json') 会被浏览器的
 *   CORS 策略拦截。此时 app.js 会退回到注入 data/questions.js，从 window.__BANK__ 取题库。
 *
 * 用法：
 *   node tools/build-data.mjs                 # 转换 data/questions.json
 *   node tools/build-data.mjs path/to/x.json  # 转换指定文件（输出到同目录 x.js）
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const input = path.resolve(process.argv[2] || path.join(ROOT, 'data', 'questions.json'));
const output = input.replace(/\.json$/i, '') + '.js';

if (!fs.existsSync(input)) {
  console.error('找不到输入文件：' + input);
  process.exit(1);
}

let bank;
try {
  bank = JSON.parse(fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, ''));
} catch (err) {
  console.error('JSON 解析失败：' + err.message);
  process.exit(1);
}

/* ---------- 基本校验 ---------- */
const errors = [];
if (!bank || typeof bank !== 'object') errors.push('根节点必须是对象');
if (!Array.isArray(bank.questions)) errors.push('缺少 questions 数组');
if (bank.questions) {
  const ids = new Set();
  bank.questions.forEach((item, i) => {
    const at = 'questions[' + i + ']';
    if (!item || typeof item !== 'object') { errors.push(at + ' 不是对象'); return; }
    if (!item.id) errors.push(at + ' 缺少 id');
    else if (ids.has(String(item.id))) errors.push(at + ' id 重复：' + item.id);
    else ids.add(String(item.id));
    if (!item.stem) errors.push(at + ' 缺少 stem');
    if (!item.subject) errors.push(at + ' 缺少 subject');
    if (item.type !== 'essay' && item.type !== 'operation' && item.answer == null) {
      errors.push(at + ' 缺少 answer');
    }
    if (Array.isArray(item.options)) {
      for (const opt of item.options) {
        if (!opt || typeof opt !== 'object' || !opt.key) errors.push(at + ' 选项缺少 key');
      }
    }
  });
}
if (errors.length) {
  console.error('题库校验失败：');
  for (const line of errors.slice(0, 20)) console.error('  - ' + line);
  if (errors.length > 20) console.error('  ... 共 ' + errors.length + ' 处');
  process.exit(1);
}

/* ---------- 生成 JS ---------- */
const payload = JSON.stringify(bank);
const generatedAt = new Date().toISOString();
const js = `/*!
 * 计算机等级考试题库 - 自动生成文件，请勿手工编辑
 * 源文件：${path.basename(input)}
 * 生成时间：${generatedAt}
 * 题目数量：${bank.questions.length}
 *
 * 该文件同时兼容两种加载方式：
 *   1. 浏览器 <script> 直接加载：写入 window.__BANK__
 *   2. Node require() / 动态 import()：通过 module.exports 导出题库对象
 */
(function (root) {
  'use strict';
  var bank = ${payload};

  // Node 环境下没有 window，补一个，方便测试脚本模拟浏览器
  if (typeof globalThis !== 'undefined' && typeof globalThis.window === 'undefined') {
    try { globalThis.window = globalThis; } catch (e) { /* 忽略只读 window */ }
  }

  root.__BANK__ = bank;
  if (root.window && root.window !== root) {
    root.window.__BANK__ = bank;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = bank;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;

fs.writeFileSync(output, js, 'utf8');

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log('已生成 ' + path.relative(ROOT, output));
console.log('  题目数量：' + bank.questions.length);
console.log('  科目数量：' + (bank.meta && Array.isArray(bank.meta.subjects) ? bank.meta.subjects.length : 0));
console.log('  JSON 大小：' + kb(fs.statSync(input).size));
console.log('  JS   大小：' + kb(fs.statSync(output).size));
