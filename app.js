/* ==========================================================================
   NCRE 刷题 · app.js
   纯浏览器脚本（非 ES Module，保证 file:// 双击可用）。
   数据加载顺序：本地导入题库 > fetch(data/questions.json) > 注入 data/questions.js。
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------ 常量 ------------------------------ */
  const APP_VERSION = '1.0.0';
  const LS_PROGRESS = 'ncre.quiz.progress.v1';
  const LS_BANK = 'ncre.quiz.bank.v1';

  const TYPE_ORDER = ['single', 'multi', 'judge', 'fill', 'essay', 'operation'];
  const TYPE_LABEL = {
    single: '单选题',
    multi: '多选题',
    judge: '判断题',
    fill: '填空题',
    essay: '简答题',
    operation: '操作题'
  };
  const TYPE_SHORT = {
    single: '单选',
    multi: '多选',
    judge: '判断',
    fill: '填空',
    essay: '简答',
    operation: '操作'
  };
  const MODE_LABEL = {
    seq: '顺序刷题',
    random: '随机刷题',
    wrong: '只刷错题',
    fav: '只刷收藏',
    study: '背题模式'
  };

  /* ------------------------------ 小工具 ------------------------------ */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  function clamp(n, min, max) { return Math.min(Math.max(n, min), max); }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }

  function debounce(fn, wait) {
    let timer = null;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(ctx, args), wait);
    };
  }

  function toast(message, kind) {
    const root = $('#toast-root');
    if (!root) return;
    const node = document.createElement('div');
    node.className = 'toast' + (kind ? ' ' + kind : '');
    node.textContent = message;
    root.appendChild(node);
    setTimeout(() => {
      node.classList.add('out');
      setTimeout(() => node.remove(), 220);
    }, 1700);
  }

  function scrollTop() {
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch (e) { window.scrollTo(0, 0); }
  }

  const HTML_TAG_RE = /<\/?[a-z][\s\S]*?>/i;

  /** 允许题干里的常见排版标签，但去掉脚本 / 事件属性 / javascript: URL */
  function sanitizeHtml(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html == null ? '' : html);
    tpl.content.querySelectorAll('script,style,iframe,object,embed,link,meta,base,form,input,button,textarea,select,noscript')
      .forEach((n) => n.remove());
    const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_ELEMENT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((el) => {
      Array.prototype.slice.call(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || '');
        if (name.indexOf('on') === 0) { el.removeAttribute(attr.name); return; }
        if ((name === 'href' || name === 'src' || name === 'xlink:href' || name === 'srcset') &&
            /^\s*(javascript|vbscript|data:text\/html)/i.test(value)) {
          el.removeAttribute(attr.name);
          return;
        }
        if (name === 'style' && /expression\s*\(|javascript:/i.test(value)) el.removeAttribute(attr.name);
      });
      if (el.tagName === 'A') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
      if (el.tagName === 'IMG') {
        el.setAttribute('loading', 'lazy');
        el.setAttribute('alt', el.getAttribute('alt') || '题目配图');
      }
    });
    return tpl.innerHTML;
  }

  /** 题干/解析可能是 HTML，也可能是纯文本 */
  function richText(value) {
    const text = String(value == null ? '' : value);
    if (!text) return '';
    if (!HTML_TAG_RE.test(text)) {
      return '<p>' + esc(text).replace(/\r?\n/g, '<br>') + '</p>';
    }
    return sanitizeHtml(text);
  }

  function plainText(value) {
    const box = document.createElement('div');
    box.innerHTML = richText(value);
    return (box.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeForCompare(value) {
    return String(value == null ? '' : value)
      .replace(/\u3000/g, ' ')
      .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .toLowerCase()
      .replace(/[\s，。；、,.;:!?！？'"“”‘’（）()【】\[\]]/g, '');
  }

  /* ------------------------------ 存储 ------------------------------ */
  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  function safeRemove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  function defaultProgress() {
    return {
      v: 1,
      answers: {},
      flags: {},
      favs: {},
      wrong: {},
      mistakes: {},
      drafts: {},
      reveals: {},
      counters: { attempts: 0, correct: 0 },
      last: { qid: null, subject: 'all', type: 'all', mode: 'seq' },
      settings: { theme: 'auto' }
    };
  }

  function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function sanitizeProgress(raw) {
    const base = defaultProgress();
    const src = asObject(raw);
    const last = asObject(src.last);
    const settings = asObject(src.settings);
    const counters = asObject(src.counters);
    return {
      v: 1,
      answers: asObject(src.answers),
      flags: asObject(src.flags),
      favs: asObject(src.favs),
      wrong: asObject(src.wrong),
      mistakes: asObject(src.mistakes),
      drafts: asObject(src.drafts),
      reveals: asObject(src.reveals),
      counters: {
        attempts: Number(counters.attempts) || 0,
        correct: Number(counters.correct) || 0
      },
      last: {
        qid: last.qid == null ? null : String(last.qid),
        subject: last.subject ? String(last.subject) : base.last.subject,
        type: last.type ? String(last.type) : base.last.type,
        mode: MODE_LABEL[last.mode] ? last.mode : base.last.mode
      },
      settings: {
        theme: ['auto', 'light', 'dark'].indexOf(settings.theme) >= 0 ? settings.theme : 'auto'
      }
    };
  }

  function loadProgress() {
    let raw = null;
    try { raw = JSON.parse(safeGet(LS_PROGRESS) || 'null'); } catch (e) { raw = null; }
    return sanitizeProgress(raw);
  }

  /* ------------------------------ 状态 ------------------------------ */
  let bank = null;
  let progress = defaultProgress();
  let filters = { subject: 'all', type: 'all' };
  let mode = 'seq';
  let view = 'quiz';
  let order = [];
  let idx = 0;
  let pending = null;           // 多选题待提交：{ qid, keys: [] }
  let studyHidden = false;

  const save = function () {
    if (!safeSet(LS_PROGRESS, JSON.stringify(progress))) {
      toast('进度保存失败：浏览器存储空间可能已满', 'bad');
    }
  };
  const saveDraftSoon = debounce(save, 350);

  /* ------------------------------ 题库加载 ------------------------------ */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('加载超时：' + src));
      }, 8000);
      script.onload = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      script.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('无法加载 ' + src + '（请确认文件存在）'));
      };
      document.head.appendChild(script);
    });
  }

  async function loadBundledBank() {
    if (window.__BANK__) return window.__BANK__;
    await loadScript('data/questions.js');
    if (!window.__BANK__) throw new Error('data/questions.js 没有导出 window.__BANK__');
    return window.__BANK__;
  }

  function readCustomBank() {
    try {
      const raw = JSON.parse(safeGet(LS_BANK) || 'null');
      if (raw && (Array.isArray(raw.questions) || Array.isArray(raw))) return raw;
    } catch (e) { /* ignore broken local data */ }
    return null;
  }

  async function loadBankData() {
    const custom = readCustomBank();
    if (custom) {
      try {
        return Object.assign(normalizeBank(custom), { source: 'custom' });
      } catch (e) {
        console.warn('本地导入题库无法解析，将回退内置题库', e);
        safeRemove(LS_BANK);
      }
    }

    if (location.protocol === 'file:') {
      return Object.assign(normalizeBank(await loadBundledBank()), { source: 'file' });
    }

    try {
      const res = await fetch('data/questions.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return Object.assign(normalizeBank(await res.json()), { source: 'fetch' });
    } catch (err) {
      console.warn('fetch 加载失败，改用脚本降级：', err);
      return Object.assign(normalizeBank(await loadBundledBank()), { source: 'script' });
    }
  }

  /* ------------------------------ 数据归一化 ------------------------------ */
  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeType(rawType, raw) {
    const key = String(rawType == null ? '' : rawType).trim().toLowerCase();
    const map = {
      single: 'single', danxuan: 'single', '单选': 'single', '单选题': 'single',
      multi: 'multi', duoxuan: 'multi', '多选': 'multi', '多选题': 'multi',
      judge: 'judge', panduan: 'judge', '判断': 'judge', '判断题': 'judge',
      fill: 'fill', '填空': 'fill', '填空题': 'fill', blank: 'fill',
      essay: 'essay', '简答': 'essay', '简答题': 'essay', short: 'essay',
      operation: 'operation', '操作': 'operation', '操作题': 'operation'
    };
    if (map[key]) return map[key];
    if (TYPE_ORDER.indexOf(key) >= 0) return key;

    const options = asArray(raw && raw.options);
    const answer = String((raw && raw.answer) == null ? '' : raw.answer).trim();
    if (/^(对|错|正确|错误|是|否|√|×|T|F|TRUE|FALSE)$/i.test(answer)) return 'judge';
    if (options.length && /^[A-Za-z][A-Za-z,，、\s]*$/.test(answer) && answer.replace(/[^A-Za-z]/g, '').length > 1) return 'multi';
    if (options.length) return 'single';
    return 'fill';
  }

  function normalizeOptions(rawOptions, type) {
    if (type === 'judge') {
      return [{ key: 'T', text: '对' }, { key: 'F', text: '错' }];
    }
    const list = [];
    const source = rawOptions;
    if (Array.isArray(source)) {
      source.forEach((item, i) => {
        if (item == null) return;
        if (typeof item === 'string' || typeof item === 'number') {
          list.push({ key: String.fromCharCode(65 + i), text: String(item) });
        } else if (typeof item === 'object') {
          const key = item.key != null ? item.key : (item.label != null ? item.label : item.value != null && String(item.value).length === 1 ? item.value : null);
          const text = item.text != null ? item.text : (item.value != null ? item.value : (item.content != null ? item.content : ''));
          list.push({ key: String(key != null ? key : String.fromCharCode(65 + i)).toUpperCase(), text: String(text) });
        }
      });
    } else if (source && typeof source === 'object') {
      Object.keys(source).forEach((key) => {
        list.push({ key: String(key).toUpperCase(), text: String(source[key] == null ? '' : source[key]) });
      });
    }
    const seen = {};
    return list.filter((opt) => {
      if (!opt.key || seen[opt.key]) opt.key = '';
      if (!opt.key) {
        let n = 0;
        while (seen[String.fromCharCode(65 + n)]) n++;
        opt.key = String.fromCharCode(65 + n);
      }
      seen[opt.key] = true;
      return opt.text !== '' || opt.key;
    });
  }

  function judgeSide(raw, options) {
    const text = String(raw == null ? '' : raw).trim();
    if (/^(对|正确|是|√|T|TRUE|Y|YES|1)$/i.test(text)) return 'T';
    if (/^(错|错误|否|×|X|F|FALSE|N|NO|0)$/i.test(text)) return 'F';
    const letters = text.toUpperCase().replace(/[^A-Z]/g, '');
    if (letters.length === 1 && options && options.length) {
      const opt = options.filter((o) => o.key === letters)[0];
      if (opt) return /错|错误|×|否|false|不正确/i.test(opt.text) ? 'F' : 'T';
    }
    return null;
  }

  function normalizeAnswer(raw, type, options) {
    const text = String(raw == null ? '' : raw).trim();
    if (type === 'judge') return judgeSide(text, options) || 'T';
    if (type === 'single' || type === 'multi') {
      let letters = (text.match(/[A-Za-z]/g) || []).map((c) => c.toUpperCase());
      let valid = letters.filter((c) => options.some((o) => o.key === c));
      if (type === 'single' && !valid.length && options.length) {
        const hit = options.filter((o) => normalizeForCompare(o.text) === normalizeForCompare(text))[0];
        if (hit) valid = [hit.key];
      }
      letters = Array.from(new Set(valid)).sort();
      // 单选却给了多个有效字母时保留全部，交给 normalizeQuestion 升级为多选
      if (type === 'single') return letters.join('') || text.toUpperCase();
      return letters.join('');
    }
    return text;
  }

  function normalizeQuestion(raw, i, fallbackSubject) {
    if (!raw || typeof raw !== 'object') return null;
    const stem = String(raw.stem != null ? raw.stem : (raw.question != null ? raw.question : (raw.content != null ? raw.content : (raw.title != null ? raw.title : ''))));
    let type = normalizeType(raw.type, raw);
    let options = normalizeOptions(raw.options, type);
    let answer = normalizeAnswer(raw.answer != null ? raw.answer : (raw.correct != null ? raw.correct : raw.answerText), type, options);

    if (type === 'single') {
      const letters = String(answer).replace(/[^A-Z]/g, '');
      if (letters.length > 1) { type = 'multi'; answer = letters.split('').sort().join(''); }
    }
    if (type === 'judge' && !/^[TF]$/.test(answer)) {
      type = 'fill';
      options = [];
    }
    if ((type === 'single' || type === 'multi') && !options.length) {
      type = 'fill';
      answer = String(raw.answer == null ? '' : raw.answer);
    }

    const id = raw.id != null && String(raw.id).trim() ? String(raw.id).trim() : 'q' + (i + 1);
    const tags = Array.isArray(raw.tags)
      ? raw.tags.map(String).filter(Boolean)
      : (raw.tags ? String(raw.tags).split(/[,，;；]/).map((s) => s.trim()).filter(Boolean) : []);
    const images = Array.isArray(raw.images)
      ? raw.images.map(String).filter(Boolean)
      : (raw.images ? [String(raw.images)] : []);

    return {
      id: id,
      subject: String(raw.subject || raw.subjectCode || fallbackSubject || 'DEFAULT'),
      type: type,
      stem: stem,
      options: options,
      answer: answer,
      explain: String(raw.explain != null ? raw.explain : (raw.analysis != null ? raw.analysis : (raw.explanation != null ? raw.explanation : ''))),
      images: images,
      tags: tags
    };
  }

  function normalizeBank(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('题库文件内容不是对象');
    const src = Array.isArray(raw) ? { questions: raw } : raw;
    let list = null;
    if (Array.isArray(src.questions)) list = src.questions;
    else if (Array.isArray(src.data)) list = src.data;
    if (!list) throw new Error('题库中缺少 questions 数组');
    if (!list.length) throw new Error('题库 questions 为空');

    const metaSrc = asObject(src.meta);
    const meta = {
      title: String(metaSrc.title || src.title || '计算机等级考试题库'),
      updated: String(metaSrc.updated || src.updated || ''),
      subjects: asArray(metaSrc.subjects).filter((s) => s && s.code).map((s) => ({
        code: String(s.code),
        name: String(s.name || s.code)
      }))
    };
    const fallbackSubject = meta.subjects.length ? meta.subjects[0].code : 'DEFAULT';

    const questions = [];
    const idSeen = {};
    list.forEach((item, i) => {
      const q = normalizeQuestion(item, i, fallbackSubject);
      if (!q) return;
      if (!q.stem && !q.options.length) return;
      if (!q.stem) q.stem = q.options.map((o) => o.key + '. ' + o.text).join('\n');
      if (idSeen[q.id]) {
        let n = 2;
        while (idSeen[q.id + '-' + n]) n++;
        q.id = q.id + '-' + n;
      }
      idSeen[q.id] = true;
      questions.push(q);
    });
    if (!questions.length) throw new Error('没有解析出任何有效题目');

    const subjectMap = {};
    meta.subjects.forEach((s) => { subjectMap[s.code] = s; });
    questions.forEach((q) => {
      if (!subjectMap[q.subject]) {
        subjectMap[q.subject] = {
          code: q.subject,
          name: q.subject === 'DEFAULT' ? '未分类' : q.subject
        };
      }
    });

    const types = TYPE_ORDER.filter((t) => questions.some((q) => q.type === t));
    const byId = {};
    questions.forEach((q) => { byId[q.id] = q; });

    return {
      meta: meta,
      questions: questions,
      subjects: Object.keys(subjectMap).map((k) => subjectMap[k]),
      types: types,
      byId: byId
    };
  }

  /* ------------------------------ 主题 ------------------------------ */
  function resolvedTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme() {
    const pref = progress.settings.theme || 'auto';
    let resolved = pref;
    if (pref !== 'dark' && pref !== 'light') {
      resolved = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    const params = new URLSearchParams(location.search);
    const forced = params.get('theme');
    if (forced === 'dark' || forced === 'light') resolved = forced;
    document.documentElement.setAttribute('data-theme', resolved);
    const btn = $('#btn-theme');
    if (btn) {
      btn.textContent = resolved === 'dark' ? '☀️' : '🌙';
      btn.setAttribute('aria-label', resolved === 'dark' ? '切换到浅色' : '切换到深色');
    }
  }

  /* ------------------------------ 题目集合 ------------------------------ */
  function currentQuestion() {
    const id = order[idx];
    return id ? bank.byId[id] : null;
  }

  function qidFromElement(el) {
    const holder = el && el.closest ? el.closest('[data-qid]') : null;
    if (holder && holder.dataset.qid && bank && bank.byId && bank.byId[holder.dataset.qid]) return holder.dataset.qid;
    const q = currentQuestion();
    return q ? q.id : null;
  }

  function filteredQuestions() {
    return bank.questions.filter((q) => (
      (filters.subject === 'all' || q.subject === filters.subject) &&
      (filters.type === 'all' || q.type === filters.type)
    ));
  }

  function buildOrder(keepQid) {
    let list = filteredQuestions();
    if (mode === 'wrong') list = list.filter((q) => !!progress.wrong[q.id]);
    else if (mode === 'fav') list = list.filter((q) => !!progress.favs[q.id]);
    if (mode === 'random') shuffle(list);
    order = list.map((q) => q.id);
    if (keepQid) {
      const at = order.indexOf(String(keepQid));
      idx = at >= 0 ? at : 0;
    }
    if (!order.length) idx = 0;
    else idx = clamp(idx, 0, order.length - 1);
    pending = null;
  }

  function saveLast() {
    const q = currentQuestion();
    progress.last = {
      qid: q ? q.id : progress.last.qid,
      subject: filters.subject,
      type: filters.type,
      mode: mode
    };
    save();
  }

  function setIndex(next, options) {
    const opts = options || {};
    if (!order.length) return;
    const target = clamp(next, 0, order.length - 1);
    if (target === idx && !opts.force) return;
    idx = target;
    pending = null;
    saveLast();
    render();
    if (opts.scroll !== false) scrollTop();
  }

  function nextQuestion() {
    if (!order.length) return;
    if (idx >= order.length - 1) { toast('已经是最后一题了'); return; }
    setIndex(idx + 1);
  }

  function prevQuestion() {
    if (!order.length) return;
    if (idx <= 0) { toast('已经是第一题了'); return; }
    setIndex(idx - 1);
  }

  /* ------------------------------ 统计小工具 ------------------------------ */
  function setStats() {
    const total = order.length;
    let answered = 0, right = 0, wrong = 0;
    order.forEach((id) => {
      const rec = progress.answers[id];
      if (rec && typeof rec.correct === 'boolean') {
        answered++;
        if (rec.correct) right++; else wrong++;
      }
    });
    return { total: total, answered: answered, right: right, wrong: wrong };
  }

  function bankStats() {
    const total = bank ? bank.questions.length : 0;
    let answered = 0, right = 0, wrong = 0;
    if (bank) {
      bank.questions.forEach((q) => {
        const rec = progress.answers[q.id];
        if (rec && typeof rec.correct === 'boolean') {
          answered++;
          if (rec.correct) right++; else wrong++;
        }
      });
    }
    return { total: total, answered: answered, right: right, wrong: wrong };
  }

  function subjectName(code) {
    const found = bank && bank.subjects.filter((s) => s.code === code)[0];
    if (found) return found.name;
    return code === 'all' ? '全部科目' : code;
  }

  function typeLabel(type) {
    return TYPE_LABEL[type] || '题目';
  }

  function answerLabel(q) {
    if (q.type === 'judge') return q.answer === 'F' ? '错' : '对';
    if (q.type === 'multi') return q.answer.split('').join('、');
    return String(q.answer || '（无）');
  }

  function pickedLabel(q, picked) {
    if (picked == null || picked === '') return '（未作答）';
    if (q.type === 'judge') return picked === 'F' || picked === '错' ? '错' : '对';
    if (q.type === 'multi') return String(picked).split('').join('、');
    if (q.type === 'single') return String(picked);
    return String(picked);
  }

  function checkFill(userText, answer) {
    const targets = String(answer == null ? '' : answer)
      .split(/[|｜]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!targets.length) return false;
    const normalized = normalizeForCompare(userText);
    return targets.some((t) => normalizeForCompare(t) === normalized);
  }

  /* ------------------------------ 顶部与侧栏 ------------------------------ */
  let selectsBuilt = false;

  function initSelects() {
    const subjectSelect = $('#sel-subject');
    const typeSelect = $('#sel-type');
    if (!subjectSelect || !typeSelect || !bank) return;

    const counts = {};
    bank.questions.forEach((q) => { counts[q.subject] = (counts[q.subject] || 0) + 1; });
    const subjectOptions = ['<option value="all">全部科目（' + bank.questions.length + '）</option>'];
    bank.subjects.forEach((s) => {
      subjectOptions.push('<option value="' + esc(s.code) + '">' + esc(s.name) + '（' + (counts[s.code] || 0) + '）</option>');
    });
    subjectSelect.innerHTML = subjectOptions.join('');

    const typeOptions = ['<option value="all">全部题型</option>'];
    bank.types.forEach((t) => {
      typeOptions.push('<option value="' + t + '">' + typeLabel(t) + '</option>');
    });
    typeSelect.innerHTML = typeOptions.join('');
    selectsBuilt = true;
  }

  function syncTopbar() {
    if (!bank) return;
    const title = $('#bank-title');
    const sub = $('#bank-sub');
    if (title) title.textContent = bank.meta.title;
    if (sub) {
      const bits = [bank.questions.length + ' 题'];
      if (bank.meta.updated) bits.push('更新 ' + bank.meta.updated);
      sub.textContent = bits.join(' · ');
    }
    document.title = bank.meta.title + ' · NCRE 刷题';

    const subjectSelect = $('#sel-subject');
    const typeSelect = $('#sel-type');
    const modeSelect = $('#sel-mode');
    if (subjectSelect) subjectSelect.value = filters.subject;
    if (typeSelect) typeSelect.value = filters.type;
    if (modeSelect) modeSelect.value = mode;

    const stats = setStats();
    const pct = stats.total ? Math.round(stats.answered / stats.total * 100) : 0;
    const label = $('#progress-label');
    const pctEl = $('#progress-pct');
    const bar = $('#progress-bar');
    if (label) label.textContent = '已做 ' + stats.answered + ' / ' + stats.total;
    if (pctEl) pctEl.textContent = pct + '%';
    if (bar) bar.style.width = pct + '%';

    const ring = $('#ring');
    if (ring) {
      ring.style.setProperty('--p', String(pct));
      const ringText = $('#ring-pct');
      if (ringText) ringText.textContent = pct + '%';
    }
    const done = $('#stat-done');
    const right = $('#stat-right');
    const wrong = $('#stat-wrong');
    if (done) done.textContent = String(stats.answered);
    if (right) right.textContent = String(stats.right);
    if (wrong) wrong.textContent = String(stats.wrong);

    const note = $('#set-note');
    if (note) {
      note.textContent = subjectName(filters.subject) + ' · ' +
        (filters.type === 'all' ? '全部题型' : typeLabel(filters.type)) + ' · ' + MODE_LABEL[mode];
    }

    const btnStats = $('#btn-stats');
    if (btnStats) {
      btnStats.classList.toggle('is-active', view === 'stats');
      btnStats.textContent = view === 'stats' ? '返回刷题' : '统计';
    }
    const src = $('#data-source');
    if (src) {
      const map = {
        fetch: '内置题库 · fetch 加载',
        script: '内置题库 · 脚本降级加载',
        file: '内置题库 · 本地文件模式',
        custom: '自定义题库 · 本地存储'
      };
      src.textContent = map[bank.source] || '题库已加载';
    }
    const ver = $('#app-version');
    if (ver) ver.textContent = 'v' + APP_VERSION;
  }

  function renderSidebar() {
    const sheet = $('#sheet');
    if (!sheet) return;
    if (!order.length) {
      sheet.innerHTML = '<p class="empty-inline">当前筛选下没有题目</p>';
      return;
    }
    const cells = [];
    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      const q = bank.byId[id];
      const rec = progress.answers[id];
      let cls = 'sheet-cell';
      let status = '未作答';
      if (rec && typeof rec.correct === 'boolean') {
        if (rec.correct) { cls += ' ok'; status = '已答对'; }
        else { cls += ' bad'; status = '已答错'; }
      }
      if (progress.flags[id]) cls += ' flag';
      if (progress.favs[id]) cls += ' fav';
      if (i === idx) cls += ' current';
      const title = '第 ' + (i + 1) + ' 题 · ' + (q ? TYPE_SHORT[q.type] : '') + ' · ' + status +
        (progress.flags[id] ? ' · 已标记' : '') + (progress.favs[id] ? ' · 已收藏' : '');
      cells.push('<button type="button" class="' + cls + '" data-act="jump" data-idx="' + i +
        '" title="' + esc(title) + '" aria-label="' + esc(title) + '">' + (i + 1) + '</button>');
    }
    sheet.innerHTML = cells.join('');
    const currentCell = sheet.querySelector('.current');
    if (currentCell) {
      // 只滚动答题卡容器本身，避免 scrollIntoView 把整个页面带着跳走
      try {
        const cr = currentCell.getBoundingClientRect();
        const sr = sheet.getBoundingClientRect();
        const top = sheet.scrollTop + (cr.top - sr.top) - sheet.clientHeight / 2 + cr.height / 2;
        sheet.scrollTop = Math.max(0, top);
      } catch (e) { /* ignore */ }
    }
  }

  /* ------------------------------ 渲染：刷题 ------------------------------ */
  function emptyState(icon, title, desc, actionsHtml) {
    return '<div class="empty-card">' +
      '<div class="empty-icon">' + icon + '</div>' +
      '<h2>' + esc(title) + '</h2>' +
      '<p>' + esc(desc) + '</p>' +
      '<div class="empty-actions">' + (actionsHtml || '') + '</div>' +
      '</div>';
  }

  function renderQuiz() {
    const container = $('#view');
    if (!container) return;
    if (!order.length) {
      if (mode === 'wrong') {
        container.innerHTML = emptyState('🎯', '错题本是空的',
          '答错的题会自动进入错题本；答对后自动移出。先去顺序练习吧。',
          '<button class="btn primary" data-act="mode-seq">去顺序练习</button>' +
          '<button class="btn ghost" data-act="reset-filters">查看全部题目</button>');
      } else if (mode === 'fav') {
        container.innerHTML = emptyState('★', '还没有收藏题目',
          '刷题时点击右上角「收藏」，或按 F 键，就能在这里集中复习。',
          '<button class="btn primary" data-act="mode-seq">去刷题</button>');
      } else {
        const why = filters.subject !== 'all' || filters.type !== 'all'
          ? '当前科目 / 题型筛选下没有题目。'
          : '题库中没有可显示的题目。';
        container.innerHTML = emptyState('🔍', '没有匹配的题目', why,
          '<button class="btn primary" data-act="reset-filters">重置筛选</button>');
      }
      return;
    }

    const q = currentQuestion();
    if (!q) {
      container.innerHTML = emptyState('⚠️', '题目不存在', '题库数据可能已变化，请刷新页面。',
        '<button class="btn primary" data-act="reload">刷新</button>');
      return;
    }

    const rec = progress.answers[q.id];
    const graded = !!(rec && typeof rec.correct === 'boolean');
    const revealed = !!progress.reveals[q.id];
    const isMulti = q.type === 'multi';
    const pendingKeys = pending && pending.qid === q.id ? pending.keys : [];
    const userKeys = graded
      ? (isMulti ? String(rec.picked || '').split('') : [String(rec.picked == null ? '' : rec.picked)])
      : pendingKeys;
    const correctKeys = isMulti ? String(q.answer || '').split('') : [String(q.answer || '')];

    const tagHtml = q.tags.slice(0, 3).map((t) => '<span class="q-tag">#' + esc(t) + '</span>').join('');
    const stemImages = q.images.filter((src) => src && q.stem.indexOf(src) < 0);
    const figureHtml = stemImages.length
      ? '<figure class="q-figure">' + stemImages.map((src) =>
        '<img src="' + esc(src) + '" alt="题目配图" loading="lazy">').join('') + '</figure>'
      : '';

    let optionsHtml = '';
    if (q.options.length && (q.type === 'single' || q.type === 'multi' || q.type === 'judge')) {
      optionsHtml = '<div class="options" role="group" aria-label="选项">' + q.options.map((opt) => {
        const own = userKeys.indexOf(opt.key) >= 0;
        const correct = correctKeys.indexOf(opt.key) >= 0;
        let cls = 'option' + (q.type === 'judge' ? ' judge' : '');
        if (graded) {
          if (correct) cls += ' is-correct';
          else if (own) cls += ' is-wrong';
          else cls += ' is-dim';
        } else if (isMulti && own) {
          cls += ' is-selected';
        }
        const mark = graded && correct ? '✓' : (graded && own ? '✗' : '');
        return '<button type="button" class="' + cls + '" data-act="pick" data-key="' + esc(opt.key) + '"' +
          (graded ? ' disabled' : '') + ' aria-pressed="' + (isMulti && own && !graded ? 'true' : 'false') + '">' +
          '<span class="opt-key">' + esc(opt.key) + '</span>' +
          '<span class="opt-text">' + richText(opt.text || '') + '</span>' +
          '<span class="opt-mark" aria-hidden="true">' + mark + '</span>' +
          '</button>';
      }).join('') + '</div>';

      if (isMulti && !graded) {
        optionsHtml += '<div class="multi-tip"><span>多选题：可多选，选好后提交（或按 Enter）</span>' +
          '<button type="button" class="btn primary small" data-act="submit-multi"' +
          (pendingKeys.length ? '' : ' disabled') + '>提交答案</button></div>';
      }
    }

    let writeHtml = '';
    if (q.type === 'fill' || q.type === 'essay' || q.type === 'operation') {
      const draft = progress.drafts[q.id];
      const value = graded ? String(rec.picked == null ? '' : rec.picked) : (draft == null ? '' : draft);
      const placeholder = q.type === 'fill'
        ? '输入答案（多个空可用“|”分隔不同写法）'
        : '写下你的思路或答案，再对照参考答案自评';
      const buttonLabel = q.type === 'fill' ? '提交答案' : '对照参考答案';
      writeHtml = '<div class="write-area">' +
        '<textarea id="write-input" rows="' + (q.type === 'fill' ? 2 : 4) + '" placeholder="' + esc(placeholder) + '"' +
        (graded ? ' disabled' : '') + ' spellcheck="false">' + esc(value) + '</textarea>' +
        '<div class="write-actions">' +
        (!graded && !revealed ? '<button type="button" class="btn primary" data-act="submit-write">' + buttonLabel + '</button>' : '') +
        '<span class="write-hint">' + (graded ? '已记录本题作答' : (q.type === 'fill' ? '按 Ctrl+Enter 也可提交' : '主观题按自评结果记录对错')) + '</span>' +
        '</div></div>';
    }

    let resultHtml = '';
    if (graded) {
      const ok = !!rec.correct;
      let extra = '';
      if (q.type === 'fill' || q.type === 'essay' || q.type === 'operation') {
        extra = '<div class="answer-line"><span class="lab">你的答案</span>' +
          '<span class="val plain">' + esc(String(rec.picked == null ? '' : rec.picked) || '（空）') + '</span></div>';
      }
      const reference = '<div class="answer-line"><span class="lab">' +
        (q.type === 'fill' ? '参考答案' : (q.type === 'essay' || q.type === 'operation' ? '参考要点' : '正确答案')) +
        '</span><span class="val' + (q.type === 'fill' || q.type === 'essay' || q.type === 'operation' ? ' plain' : '') + '">' +
        esc(answerLabel(q)) + '</span></div>';
      resultHtml = '<div class="result">' +
        '<div class="result-banner ' + (ok ? 'ok' : 'bad') + '">' +
        '<span class="ico">' + (ok ? '✓' : '✗') + '</span>' +
        '<span>' + (ok ? '回答正确' : '回答错误') + '</span>' +
        '<span class="spacer"></span>' +
        '<span class="sub">' + (ok ? '继续保持' : '已加入错题本') + '</span>' +
        '</div>' + extra + reference +
        (q.explain ? '<div class="explain"><div class="explain-title">解析</div>' + richText(q.explain) + '</div>' : '') +
        '</div>';
    } else if (revealed) {
      resultHtml = '<div class="result">' +
        '<div class="answer-line"><span class="lab">参考答案</span><span class="val plain">' + esc(answerLabel(q)) + '</span></div>' +
        (q.explain ? '<div class="explain"><div class="explain-title">解析</div>' + richText(q.explain) + '</div>' : '') +
        '<div class="self-grade"><span>对照后自评：</span>' +
        '<button type="button" class="btn small primary" data-act="self-grade" data-ok="1">我答对了</button>' +
        '<button type="button" class="btn small danger" data-act="self-grade" data-ok="0">我答错了</button>' +
        '</div></div>';
    }

    const canReset = graded || revealed || (progress.drafts[q.id] != null && progress.drafts[q.id] !== '');
    const footHtml = '<div class="q-foot">' +
      '<button type="button" class="btn ghost" data-act="prev"' + (idx <= 0 ? ' disabled' : '') + '>← 上一题</button>' +
      '<button type="button" class="btn ghost" data-act="reset"' + (canReset ? '' : ' disabled') + '>↺ 重置</button>' +
      '<span class="spacer"></span>' +
      '<span class="kbd-hint"><kbd>←</kbd><kbd>→</kbd> 切换 · <kbd>M</kbd> 标记 · <kbd>F</kbd> 收藏</span>' +
      '<button type="button" class="btn primary" data-act="next"' + (idx >= order.length - 1 ? ' disabled' : '') + '>下一题 →</button>' +
      '</div>';

    container.innerHTML = '<article class="q-card" data-qid="' + esc(q.id) + '">' +
      '<div class="q-head">' +
      '<div class="q-meta">' +
      '<span class="badge t-' + q.type + '">' + typeLabel(q.type) + '</span>' +
      '<span class="q-no">第 <b>' + (idx + 1) + '</b> / ' + order.length + ' 题</span>' +
      '<span class="q-subject" title="' + esc(subjectName(q.subject)) + '">' + esc(subjectName(q.subject)) + '</span>' +
      tagHtml +
      '</div>' +
      '<div class="q-actions">' +
      '<button type="button" class="chip" data-act="flag" aria-pressed="' + (progress.flags[q.id] ? 'true' : 'false') + '">' +
      (progress.flags[q.id] ? '⚑ 已标记' : '⚑ 标记') + '</button>' +
      '<button type="button" class="chip fav" data-act="fav" aria-pressed="' + (progress.favs[q.id] ? 'true' : 'false') + '">' +
      (progress.favs[q.id] ? '★ 已收藏' : '☆ 收藏') + '</button>' +
      '</div></div>' +
      '<div class="q-stem">' + richText(q.stem) + '</div>' +
      figureHtml + optionsHtml + writeHtml + resultHtml + footHtml +
      '</article>';
  }

  /* ------------------------------ 渲染：背题 ------------------------------ */
  function renderStudy() {
    const container = $('#view');
    if (!container) return;
    if (!order.length) {
      container.innerHTML = emptyState('📖', '没有可背的题目',
        '当前筛选下没有题目，换个科目或题型试试。',
        '<button class="btn primary" data-act="reset-filters">重置筛选</button>');
      return;
    }

    const cards = order.map((id, i) => {
      const q = bank.byId[id];
      if (!q) return '';
      const rec = progress.answers[id];
      const status = rec && typeof rec.correct === 'boolean' ? (rec.correct ? '已答对' : '已答错') : '未作答';
      const options = (q.options.length && q.type !== 'judge')
        ? '<ul class="study-options">' + q.options.map((o) =>
          '<li><span class="k">' + esc(o.key) + '</span><span>' + richText(o.text || '') + '</span></li>').join('') + '</ul>'
        : '';
      const extraImages = q.images.filter((src) => src && q.stem.indexOf(src) < 0);
      const figure = extraImages.length
        ? '<figure class="q-figure">' + extraImages.map((src) =>
          '<img src="' + esc(src) + '" alt="题目配图" loading="lazy">').join('') + '</figure>'
        : '';
      return '<article class="study-card" data-qid="' + esc(q.id) + '">' +
        '<div class="study-top">' +
        '<span class="study-no">' + (i + 1) + '</span>' +
        '<span class="badge t-' + q.type + '">' + typeLabel(q.type) + '</span>' +
        '<span>' + esc(subjectName(q.subject)) + '</span>' +
        '<span>· ' + status + '</span>' +
        '<span class="spacer"></span>' +
        '<button type="button" class="chip" data-act="study-answer" data-id="' + esc(q.id) + '">去作答</button>' +
        '<button type="button" class="chip" data-act="flag" aria-pressed="' + (progress.flags[q.id] ? 'true' : 'false') + '">⚑</button>' +
        '<button type="button" class="chip fav" data-act="fav" aria-pressed="' + (progress.favs[q.id] ? 'true' : 'false') + '">★</button>' +
        '</div>' +
        '<div class="study-stem">' + richText(q.stem) + options + figure + '</div>' +
        '<div class="study-answer"><span class="lab">答案</span><span class="val' +
        (q.answer ? '' : ' study-empty-answer') + '">' + esc(answerLabel(q)) + '</span></div>' +
        (q.explain ? '<div class="study-explain"><span class="lab">解析</span>' + richText(q.explain) + '</div>' : '') +
        '</article>';
    }).join('');

    container.innerHTML = '<div class="study-head">' +
      '<div><h2>背题模式</h2><p>共 ' + order.length + ' 题 · 题干、答案、解析直接铺开，上下滚动快速过</p></div>' +
      '<div class="study-tools">' +
      '<button type="button" class="btn ghost" data-act="toggle-reveal" aria-pressed="' + (studyHidden ? 'false' : 'true') + '">' +
      (studyHidden ? '显示答案（空格）' : '隐藏答案（空格）') + '</button>' +
      '</div></div>' +
      '<div class="study-list' + (studyHidden ? ' hide-answers' : '') + '">' + cards + '</div>';
  }

  /* ------------------------------ 渲染：统计 ------------------------------ */
  function statRows(list, groupLabel) {
    const groups = {};
    list.forEach((q) => {
      const key = groupLabel(q);
      if (!groups[key]) groups[key] = { total: 0, answered: 0, right: 0 };
      groups[key].total++;
      const rec = progress.answers[q.id];
      if (rec && typeof rec.correct === 'boolean') {
        groups[key].answered++;
        if (rec.correct) groups[key].right++;
      }
    });
    return groups;
  }

  function barRows(groups, emptyText) {
    const keys = Object.keys(groups);
    if (!keys.length) return '<p class="empty-inline">' + esc(emptyText) + '</p>';
    return keys.map((key) => {
      const g = groups[key];
      const acc = g.answered ? Math.round(g.right / g.answered * 100) : 0;
      const width = g.answered ? Math.max(acc, 2) : 0;
      return '<div class="bar-row">' +
        '<div class="bar-row-top"><span class="name">' + esc(key) + '</span>' +
        '<span class="num">' + g.answered + '/' + g.total + ' 题 · <b>' + (g.answered ? acc + '%' : '—') + '</b></span></div>' +
        '<div class="bar"><i class="' + (g.answered && acc < 60 ? 'bad' : 'warn') + '" style="width:' + width + '%"></i></div>' +
        '</div>';
    }).join('');
  }

  function renderStats() {
    const container = $('#view');
    if (!container || !bank) return;
    const all = bankStats();
    const accuracy = all.answered ? Math.round(all.right / all.answered * 100) : 0;
    const wrongBook = bank.questions.filter((q) => !!progress.wrong[q.id]).length;

    const subjectGroups = {};
    bank.subjects.forEach((s) => { subjectGroups[s.name] = { total: 0, answered: 0, right: 0 }; });
    bank.questions.forEach((q) => {
      const name = subjectName(q.subject);
      if (!subjectGroups[name]) subjectGroups[name] = { total: 0, answered: 0, right: 0 };
      const g = subjectGroups[name];
      g.total++;
      const rec = progress.answers[q.id];
      if (rec && typeof rec.correct === 'boolean') {
        g.answered++;
        if (rec.correct) g.right++;
      }
    });

    const typeGroups = {};
    bank.types.forEach((t) => { typeGroups[typeLabel(t)] = { total: 0, answered: 0, right: 0 }; });
    bank.questions.forEach((q) => {
      const name = typeLabel(q.type);
      const g = typeGroups[name] || (typeGroups[name] = { total: 0, answered: 0, right: 0 });
      g.total++;
      const rec = progress.answers[q.id];
      if (rec && typeof rec.correct === 'boolean') {
        g.answered++;
        if (rec.correct) g.right++;
      }
    });

    const wrongEntries = Object.keys(progress.mistakes)
      .map((id) => ({ id: id, count: Number(progress.mistakes[id]) || 0, q: bank.byId[id] }))
      .filter((item) => item.q && item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const wrongHtml = wrongEntries.length
      ? '<ul class="wrong-list">' + wrongEntries.map((item, i) => {
        const status = progress.wrong[item.id] ? '仍在错题本' : '已订正';
        return '<li class="wrong-item">' +
          '<span class="wrong-rank">' + (i + 1) + '</span>' +
          '<div class="wrong-body"><p>' + esc(plainText(item.q.stem).slice(0, 78) || '（无题干）') + '</p>' +
          '<small>' + typeLabel(item.q.type) + ' · ' + esc(subjectName(item.q.subject)) + ' · 答错 ' + item.count + ' 次 · ' + status + '</small></div>' +
          '<button type="button" class="btn small ghost" data-act="goto-wrong" data-id="' + esc(item.id) + '">去重做</button>' +
          '</li>';
      }).join('') + '</ul>'
      : '<p class="empty-inline">还没有错题记录，继续保持。</p>';

    const typeRows = barRows(typeGroups, '暂无题型数据');
    const subjectRows = barRows(subjectGroups, '暂无科目数据');
    const hasCustom = !!(bank && bank.source === 'custom');

    container.innerHTML = '<div class="stats-head">' +
      '<div><h2>学习统计</h2><p>累计作答 ' + progress.counters.attempts + ' 次 · 覆盖 ' + all.answered + ' / ' + all.total + ' 题</p></div>' +
      '<div class="study-tools">' +
      '<button type="button" class="btn ghost" data-act="export">导出备份</button>' +
      '<button type="button" class="btn ghost" data-act="toggle-stats">← 返回刷题</button>' +
      '</div></div>' +
      '<div class="stat-cards">' +
      '<div class="stat-card"><b>' + all.total + '</b><span>题库总题数</span></div>' +
      '<div class="stat-card accent"><b>' + all.answered + '</b><span>已作答</span></div>' +
      '<div class="stat-card ' + (accuracy >= 60 ? 'ok' : 'bad') + '"><b>' + (all.answered ? accuracy + '%' : '—') + '</b><span>正确率</span></div>' +
      '<div class="stat-card bad"><b>' + wrongBook + '</b><span>错题本</span></div>' +
      '</div>' +
      '<div class="stats-grid">' +
      '<section class="panel"><h3>按科目</h3><p class="panel-sub">正确率 = 答对题数 / 已作答题数</p>' + subjectRows + '</section>' +
      '<section class="panel"><h3>按题型</h3><p class="panel-sub">共 ' + bank.types.length + ' 种题型</p>' + typeRows + '</section>' +
      '</div>' +
      '<section class="panel" style="margin-top:14px"><h3>错题 TOP</h3>' +
      '<p class="panel-sub">按累计答错次数排序，最多显示 10 条</p>' + wrongHtml + '</section>' +
      '<section class="panel danger-panel" style="margin-top:14px"><h3>数据管理</h3>' +
      '<p class="panel-sub">答题记录与导入的题库都保存在当前浏览器的 localStorage 中，换设备请先导出备份。</p>' +
      '<div class="danger-actions">' +
      '<button type="button" class="btn ghost" data-act="export">导出备份</button>' +
      (hasCustom ? '<button type="button" class="btn ghost" data-act="restore-bank">恢复内置题库</button>' : '') +
      '<button type="button" class="btn danger" data-act="reset-progress">清空所有答题记录</button>' +
      '</div></section>';
  }

  /* ------------------------------ 总渲染 ------------------------------ */
  function render() {
    if (!bank) return;
    document.body.dataset.mode = mode;
    document.body.dataset.view = view;
    syncTopbar();
    if (view === 'stats') {
      renderStats();
      return;
    }
    if (mode === 'study') {
      renderStudy();
      return;
    }
    renderQuiz();
    renderSidebar();
  }

  /* ------------------------------ 作答记录 ------------------------------ */
  function recordAnswer(q, picked, correct) {
    progress.answers[q.id] = { picked: picked, correct: !!correct, ts: Date.now() };
    progress.counters.attempts = (progress.counters.attempts || 0) + 1;
    if (correct) {
      progress.counters.correct = (progress.counters.correct || 0) + 1;
      delete progress.wrong[q.id];
    } else {
      progress.wrong[q.id] = true;
      progress.mistakes[q.id] = (progress.mistakes[q.id] || 0) + 1;
    }
    delete progress.drafts[q.id];
    delete progress.reveals[q.id];
    save();
    render();
    if (correct) toast('回答正确', 'ok');
    else toast('回答错误，已加入错题本', 'bad');
  }

  function pickOption(key) {
    const q = currentQuestion();
    if (!q || view !== 'quiz' || mode === 'study') return;
    const rec = progress.answers[q.id];
    if (rec && typeof rec.correct === 'boolean') return;
    if (q.type === 'multi') {
      const keys = pending && pending.qid === q.id ? pending.keys.slice() : [];
      const at = keys.indexOf(key);
      if (at >= 0) keys.splice(at, 1);
      else keys.push(key);
      keys.sort();
      pending = { qid: q.id, keys: keys };
      render();
      return;
    }
    if (q.type === 'single' || q.type === 'judge') {
      recordAnswer(q, key, key === q.answer);
    }
  }

  function submitMulti() {
    const q = currentQuestion();
    if (!q || q.type !== 'multi') return;
    const keys = pending && pending.qid === q.id ? pending.keys : [];
    if (!keys.length) { toast('请先选择至少一个选项'); return; }
    const picked = keys.slice().sort().join('');
    const answer = String(q.answer || '').split('').sort().join('');
    recordAnswer(q, picked, picked === answer);
    pending = null;
  }

  function submitWrite() {
    const q = currentQuestion();
    if (!q) return;
    if (q.type !== 'fill' && q.type !== 'essay' && q.type !== 'operation') return;
    const input = $('#write-input');
    const text = input ? input.value.trim() : '';
    if (!text) {
      toast('请先输入答案');
      if (input) input.focus();
      return;
    }
    if (q.type === 'fill') {
      recordAnswer(q, text, checkFill(text, q.answer));
      return;
    }
    progress.drafts[q.id] = text;
    progress.reveals[q.id] = true;
    save();
    render();
  }

  function selfGrade(ok) {
    const q = currentQuestion();
    if (!q) return;
    const text = progress.drafts[q.id] != null ? progress.drafts[q.id] : '';
    recordAnswer(q, text, !!ok);
  }

  function toggleFlag(id) {
    const qid = id || qidFromElement(null);
    if (!qid) return;
    if (progress.flags[qid]) delete progress.flags[qid];
    else progress.flags[qid] = true;
    save();
    render();
    toast(progress.flags[qid] ? '已标记本题' : '已取消标记', 'ok');
  }

  function toggleFav(id) {
    const qid = id || qidFromElement(null);
    if (!qid) return;
    if (progress.favs[qid]) delete progress.favs[qid];
    else progress.favs[qid] = true;
    save();
    render();
    toast(progress.favs[qid] ? '已收藏' : '已取消收藏', 'ok');
  }

  function resetCurrent() {
    const q = currentQuestion();
    if (!q) return;
    delete progress.answers[q.id];
    delete progress.reveals[q.id];
    delete progress.drafts[q.id];
    delete progress.wrong[q.id];
    pending = null;
    save();
    render();
    toast('已重置本题', 'ok');
  }

  function jumpTo(target, closeSheet) {
    if (target < 0 || target >= order.length) return;
    idx = target;
    pending = null;
    saveLast();
    if (closeSheet) document.body.classList.remove('sheet-open');
    render();
    scrollTop();
  }

  function goAnswerFromStudy(qid) {
    mode = 'seq';
    const modeSelect = $('#sel-mode');
    if (modeSelect) modeSelect.value = mode;
    view = 'quiz';
    buildOrder(qid);
    render();
    scrollTop();
  }

  /* ------------------------------ 弹窗 ------------------------------ */
  let modalOpen = false;

  function openModal(html) {
    const root = $('#modal-root');
    if (!root) return;
    root.innerHTML = '<div class="modal-backdrop" data-act="close-modal"></div>' + html;
    root.hidden = false;
    modalOpen = true;
    document.documentElement.style.overflow = 'hidden';
    const focusable = root.querySelector('button, input, textarea, select');
    if (focusable) setTimeout(() => { try { focusable.focus(); } catch (e) { /* ignore */ } }, 30);
  }

  function closeModal() {
    const root = $('#modal-root');
    if (!root) return;
    root.hidden = true;
    root.innerHTML = '';
    modalOpen = false;
    document.documentElement.style.overflow = '';
    pendingImport = null;
  }

  function modalShell(title, bodyHtml, footHtml) {
    return '<div class="modal-card" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<div class="modal-head"><h3>' + esc(title) + '</h3>' +
      '<button type="button" class="icon-btn" data-act="close-modal" aria-label="关闭">×</button></div>' +
      '<div class="modal-body">' + bodyHtml + '</div>' +
      (footHtml ? '<div class="modal-foot">' + footHtml + '</div>' : '') +
      '</div>';
  }

  function openHelp() {
    const body = '<div class="help-grid">' +
      '<div><h4>答题</h4><ul class="key-list">' +
      '<li><span>选择选项</span><span class="keys"><kbd>1</kbd>–<kbd>9</kbd> / <kbd>A</kbd>–<kbd>D</kbd></span></li>' +
      '<li><span>提交多选 / 填空</span><span class="keys"><kbd>Enter</kbd></span></li>' +
      '<li><span>下一题</span><span class="keys"><kbd>Enter</kbd> / <kbd>→</kbd></span></li>' +
      '<li><span>上一题</span><span class="keys"><kbd>←</kbd></span></li>' +
      '<li><span>标记 / 收藏 / 重置</span><span class="keys"><kbd>M</kbd> <kbd>F</kbd> <kbd>R</kbd></span></li>' +
      '</ul></div>' +
      '<div><h4>浏览</h4><ul class="key-list">' +
      '<li><span>背题模式隐藏/显示答案</span><span class="keys"><kbd>空格</kbd></span></li>' +
      '<li><span>关闭弹窗 / 答题卡</span><span class="keys"><kbd>Esc</kbd></span></li>' +
      '<li><span>输入框内提交（填空/简答）</span><span class="keys"><kbd>Ctrl</kbd>+<kbd>Enter</kbd></span></li>' +
      '</ul></div></div>' +
      '<div class="help-note"><b>数据说明：</b>答题记录、标记、收藏、错题本与导入的自定义题库都保存在本机浏览器（localStorage）。' +
      '换电脑或清理浏览器缓存前，请用「导出」保存 JSON 备份。' +
      '<br><b>加载顺序：</b>本地导入题库 → <code>fetch(data/questions.json)</code> → 自动注入 <code>data/questions.js</code>；' +
      '所以直接双击 <code>index.html</code> 也能离线使用。</div>';
    openModal(modalShell('快捷键与说明', body, '<button type="button" class="btn primary" data-act="close-modal">知道了</button>'));
  }

  /* ------------------------------ 导入 / 导出 ------------------------------ */
  let pendingImport = null;

  function readFileText(file) {
    if (file && typeof file.text === 'function') return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsText(file, 'utf-8');
    });
  }

  function parseCSV(text) {
    const src = String(text).replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"') {
          if (src[i + 1] === '"') { cell += '"'; i++; }
          else quoted = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        row.push(cell); cell = '';
      } else if (ch === '\n') {
        row.push(cell); cell = '';
        rows.push(row); row = [];
      } else if (ch !== '\r') {
        cell += ch;
      }
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
  }

  function csvToBank(text, filename) {
    const rows = parseCSV(text);
    if (!rows.length) throw new Error('CSV 文件为空');
    const first = rows[0].map((s) => String(s).trim());
    const headerPattern = /^(题干|题目|问题|stem|question|选项[abcd]?|option[abcd]?|正确答案|答案|answer|解析|analysis|explain|科目|subject|题型|type|标签|tags)$/i;
    const headerHits = first.filter((h) => headerPattern.test(h.replace(/\s/g, ''))).length;
    const hasHeader = headerHits >= 2;

    function findCol(names) {
      for (let i = 0; i < first.length; i++) {
        const h = first[i].toLowerCase().replace(/\s/g, '');
        if (!h) continue;
        for (let n = 0; n < names.length; n++) {
          const key = names[n].toLowerCase();
          if (h === key || h.indexOf(key) >= 0) return i;
        }
      }
      return -1;
    }

    let col = { stem: 0, A: 1, B: 2, C: 3, D: 4, answer: 5, explain: 6, subject: 7, type: 8, tags: 9 };
    if (hasHeader) {
      col = {
        stem: findCol(['题干', '题目', '问题', 'stem', 'question']),
        A: findCol(['选项a', 'optiona', 'a']),
        B: findCol(['选项b', 'optionb', 'b']),
        C: findCol(['选项c', 'optionc', 'c']),
        D: findCol(['选项d', 'optiond', 'd']),
        answer: findCol(['正确答案', '答案', 'answer']),
        explain: findCol(['解析', 'analysis', 'explain']),
        subject: findCol(['科目', 'subject']),
        type: findCol(['题型', 'type']),
        tags: findCol(['标签', 'tags'])
      };
    }

    const questions = [];
    const warnings = [];
    const start = hasHeader ? 1 : 0;
    for (let i = start; i < rows.length; i++) {
      const row = rows[i];
      const get = (key) => (col[key] >= 0 && row[col[key]] != null ? String(row[col[key]]).trim() : '');
      const stem = get('stem');
      if (!stem) continue;
      const opts = [];
      ['A', 'B', 'C', 'D'].forEach((key) => {
        const text = get(key);
        if (text) opts.push({ key: key, text: text });
      });
      let answer = get('answer');
      if (!answer) { warnings.push('第 ' + (i + 1) + ' 行缺少答案，已跳过'); continue; }
      let type = get('type');
      if (!type) {
        if (!opts.length) type = 'fill';
        else if (/^(对|错|正确|错误|T|F)$/i.test(answer)) type = 'judge';
        else if ((answer.match(/[A-Za-z]/g) || []).length > 1) type = 'multi';
        else type = 'single';
      }
      questions.push({
        id: 'csv-' + (i + 1),
        subject: get('subject') || 'CUSTOM',
        type: type,
        stem: stem,
        options: opts,
        answer: answer,
        explain: get('explain'),
        tags: get('tags') ? get('tags').split(/[,，;；]/).map((s) => s.trim()).filter(Boolean) : ['CSV导入']
      });
    }
    if (!questions.length) throw new Error('CSV 中没有解析出题目，请检查列顺序或表头');

    return {
      bank: {
        meta: {
          title: filename ? filename.replace(/\.csv$/i, '') : '导入的 CSV 题库',
          updated: new Date().toISOString().slice(0, 10),
          subjects: questions[0].subject !== 'CUSTOM'
            ? [{ code: questions[0].subject, name: questions[0].subject }]
            : [{ code: 'CUSTOM', name: '自定义题库' }]
        },
        questions: questions
      },
      warnings: warnings
    };
  }

  function inspectImport(text, filename) {
    const trimmed = String(text || '').replace(/^\uFEFF/, '').trim();
    if (!trimmed) throw new Error('文件内容为空');

    if (/\.csv$/i.test(filename) ||
        (!/^[{[]/.test(trimmed) && (trimmed.indexOf('\n') > 0 || trimmed.indexOf(',') > 0))) {
      return csvToBank(trimmed, filename);
    }

    let data;
    try { data = JSON.parse(trimmed); }
    catch (e) { throw new Error('JSON 解析失败：' + e.message); }

    let bankRaw = data;
    let backupProgress = null;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      if (data.bank && (Array.isArray(data.bank.questions) || Array.isArray(data.bank))) {
        bankRaw = data.bank;
        backupProgress = data.progress || null;
      } else if (data.app === 'ncre-quiz' && data.progress) {
        bankRaw = null;
        backupProgress = data.progress;
      }
    }

    let normalized = null;
    if (bankRaw) normalized = normalizeBank(bankRaw);
    if (!normalized && !backupProgress) throw new Error('JSON 中没有找到 questions 数组');

    return {
      rawBank: bankRaw,
      bank: normalized,
      progress: backupProgress ? sanitizeProgress(backupProgress) : null,
      warnings: []
    };
  }

  function importReportHtml(result, filename) {
    const items = [];
    if (result.bank) {
      const typeCount = {};
      result.bank.questions.forEach((q) => { typeCount[q.type] = (typeCount[q.type] || 0) + 1; });
      const typeText = Object.keys(typeCount).map((t) => typeLabel(t) + ' ' + typeCount[t]).join(' / ');
      items.push('<div class="ok-box"><b>已识别题库：' + esc(filename || '未命名') + '</b><br>' +
        '共 ' + result.bank.questions.length + ' 道题 · ' + result.bank.subjects.length + ' 个科目<br>' +
        '<span>' + esc(typeText) + '</span></div>');
    } else {
      items.push('<div class="ok-box"><b>已识别答题记录备份</b><br>共 ' +
        Object.keys((result.progress && result.progress.answers) || {}).length + ' 条作答记录</div>');
    }
    if (result.warnings && result.warnings.length) {
      items.push('<div class="err-box"><b>部分内容被跳过</b><ul>' +
        result.warnings.slice(0, 6).map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>' +
        (result.warnings.length > 6 ? '<div class="warn-line">另有 ' + (result.warnings.length - 6) + ' 条…</div>' : '') +
        '</div>');
    }
    if (result.progress) {
      items.push('<label class="check-row"><input type="checkbox" id="import-progress" checked> 同时恢复答题记录（' +
        Object.keys(result.progress.answers || {}).length + ' 条）</label>');
    }
    if (result.bank) {
      items.push('<p class="panel-note" style="margin-top:10px">导入后会替换当前题库，并写入浏览器本地存储；' +
        '题目 id 相同的旧作答记录会保留。可随时在「统计 → 数据管理」里恢复内置题库。</p>');
    }
    return items.join('');
  }

  function openImport() {
    pendingImport = null;
    const body = '<div class="drop-zone" id="drop-zone">' +
      '<div class="dz-icon">⇪</div>' +
      '<p><b>把题库文件拖到这里</b>，或 <button type="button" class="btn small" data-act="pick-file">选择文件</button></p>' +
      '<p class="hint">支持 .json（题库 / 本应用备份）与 .csv（题干,选项A–D,答案,解析）</p>' +
      '</div>' +
      '<input type="file" id="file-input" accept=".json,.csv,application/json,text/csv" hidden>' +
      '<div class="import-report" id="import-report"></div>';
    const foot = '<button type="button" class="btn ghost" data-act="download-template">下载 CSV 模板</button>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn ghost" data-act="close-modal">取消</button>' +
      '<button type="button" class="btn primary" data-act="confirm-import" disabled>确认导入</button>';
    openModal(modalShell('导入题库', body, foot));

    const input = $('#file-input');
    if (input) {
      input.addEventListener('change', () => {
        if (input.files && input.files[0]) handleImportFile(input.files[0]);
      });
    }
    const zone = $('#drop-zone');
    if (zone) {
      ['dragenter', 'dragover'].forEach((evt) => zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.add('over');
      }));
      ['dragleave', 'drop'].forEach((evt) => zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.remove('over');
      }));
      zone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleImportFile(e.dataTransfer.files[0]);
        }
      });
    }
  }

  async function handleImportFile(file) {
    const report = $('#import-report');
    try {
      const text = await readFileText(file);
      const result = inspectImport(text, file.name || '');
      pendingImport = {
        rawBank: result.rawBank,
        bank: result.bank,
        progress: result.progress,
        filename: file.name || ''
      };
      if (report) report.innerHTML = importReportHtml(result, file.name || '');
      const btn = $('[data-act="confirm-import"]');
      if (btn) btn.disabled = false;
      const box = $('#import-progress');
      if (box) {
        box.addEventListener('change', () => {
          if (pendingImport) pendingImport.includeProgress = box.checked;
        });
      }
    } catch (err) {
      pendingImport = null;
      if (report) report.innerHTML = '<div class="err-box"><b>导入失败</b><br>' + esc(err.message) + '</div>';
      const btn = $('[data-act="confirm-import"]');
      if (btn) btn.disabled = true;
    }
  }

  function confirmImport() {
    if (!pendingImport) { toast('请先选择题库文件'); return; }
    const pack = pendingImport;
    const box = $('#import-progress');
    const includeProgress = box ? box.checked : true;

    let stored = true;
    if (pack.rawBank) {
      stored = safeSet(LS_BANK, JSON.stringify(pack.rawBank));
      if (!stored) toast('题库较大，浏览器存储空间不足：本次会话可用，刷新后需重新导入', 'warn');
      bank = Object.assign(normalizeBank(pack.rawBank), { source: 'custom' });
    }
    if (includeProgress && pack.progress) {
      const theme = progress.settings.theme;
      progress = sanitizeProgress(pack.progress);
      progress.settings.theme = theme;
      save();
    }
    if (!bank) { closeModal(); return; }

    if (!bank.subjects.some((s) => s.code === filters.subject)) filters.subject = 'all';
    if (filters.type !== 'all' && bank.types.indexOf(filters.type) < 0) filters.type = 'all';
    initSelects();
    buildOrder(progress.last && progress.last.qid);
    view = 'quiz';
    closeModal();
    render();
    scrollTop();
    toast('题库导入成功：' + bank.questions.length + ' 题', 'ok');
  }

  function downloadText(filename, text, mime) {
    try {
      const blob = new Blob([text], { type: mime || 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    } catch (e) {
      toast('下载失败：' + e.message, 'bad');
      return false;
    }
  }

  function exportBackup() {
    if (!bank) { toast('题库尚未加载'); return; }
    const payload = {
      app: 'ncre-quiz',
      version: 1,
      exportedAt: new Date().toISOString(),
      bank: {
        meta: bank.meta,
        questions: bank.questions.map((q) => ({
          id: q.id,
          subject: q.subject,
          type: q.type,
          stem: q.stem,
          options: q.options,
          answer: q.answer,
          explain: q.explain,
          images: q.images,
          tags: q.tags
        }))
      },
      progress: progress
    };
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    downloadText('ncre-backup-' + stamp + '.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    toast('备份已导出', 'ok');
  }

  function downloadCsvTemplate() {
    const lines = [
      '题干,选项A,选项B,选项C,选项D,答案,解析',
      '"1KB 等于多少字节？",1000,1024,1024×1024,8,B,"1KB = 1024B。"',
      '"下列属于输入设备的是（多选）",键盘,鼠标,显示器,扫描仪,"ABD","显示器是输出设备。"',
      '"判断：TCP 是面向连接的协议。",,,,,"对","TCP 通过三次握手建立连接。"'
    ];
    downloadText('ncre-csv-template.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    toast('模板已下载，可用 Excel 编辑', 'ok');
  }

  function restoreBuiltin() {
    safeRemove(LS_BANK);
    loadBundledBank().then(function (raw) {
      bank = Object.assign(normalizeBank(raw), { source: 'script' });
      filters = { subject: 'all', type: 'all' };
      mode = 'seq';
      initSelects();
      buildOrder(null);
      idx = 0;
      view = 'quiz';
      closeModal();
      render();
      scrollTop();
      toast('已恢复内置题库', 'ok');
    }).catch(function (err) {
      toast('恢复失败：' + err.message, 'bad');
    });
  }

  function resetAllProgress() {
    openModal(modalShell('清空所有答题记录',
      '<p>将清除全部作答、对错、标记、收藏、错题本和草稿。题库本身不会被删除。</p>' +
      '<p class="panel-note">此操作不可撤销，建议先导出备份。</p>',
      '<button type="button" class="btn ghost" data-act="close-modal">取消</button>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn danger" data-act="reset-progress-confirm">确认清空</button>'));
  }

  function doResetProgress() {
    const theme = progress.settings.theme;
    progress = defaultProgress();
    progress.settings.theme = theme;
    save();
    pending = null;
    closeModal();
    buildOrder(null);
    idx = 0;
    view = 'quiz';
    render();
    toast('已清空答题记录', 'ok');
  }

  /* ------------------------------ 事件 ------------------------------ */
  function handleAction(act, el, event) {
    switch (act) {
      case 'home':
        event.preventDefault();
        view = 'quiz';
        render();
        scrollTop();
        break;
      case 'toggle-stats':
        view = view === 'stats' ? 'quiz' : 'stats';
        document.body.classList.remove('sheet-open');
        render();
        scrollTop();
        break;
      case 'toggle-theme': {
        const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
        progress.settings.theme = next;
        save();
        applyTheme();
        break;
      }
      case 'toggle-sheet':
        document.body.classList.toggle('sheet-open');
        break;
      case 'close-sheet':
        document.body.classList.remove('sheet-open');
        break;
      case 'open-help':
        openHelp();
        break;
      case 'open-import':
        openImport();
        break;
      case 'close-modal':
        closeModal();
        break;
      case 'export':
        exportBackup();
        break;
      case 'download-template':
        downloadCsvTemplate();
        break;
      case 'confirm-import':
        confirmImport();
        break;
      case 'pick-file': {
        const input = $('#file-input');
        if (input) input.click();
        break;
      }
      case 'pick':
        if (el.dataset.key) pickOption(el.dataset.key);
        break;
      case 'submit-multi':
        submitMulti();
        break;
      case 'submit-write':
        submitWrite();
        break;
      case 'self-grade':
        selfGrade(el.dataset.ok === '1');
        break;
      case 'next':
        nextQuestion();
        break;
      case 'prev':
        prevQuestion();
        break;
      case 'flag':
        toggleFlag(qidFromElement(el));
        break;
      case 'fav':
        toggleFav(qidFromElement(el));
        break;
      case 'reset':
        resetCurrent();
        break;
      case 'jump':
        jumpTo(Number(el.dataset.idx), true);
        break;
      case 'toggle-reveal':
        studyHidden = !studyHidden;
        render();
        break;
      case 'study-answer':
        if (el.dataset.id) goAnswerFromStudy(el.dataset.id);
        break;
      case 'mode-seq':
        mode = 'seq';
        view = 'quiz';
        buildOrder(null);
        idx = 0;
        saveLast();
        render();
        scrollTop();
        break;
      case 'reset-filters':
        filters = { subject: 'all', type: 'all' };
        mode = 'seq';
        view = 'quiz';
        if (selectsBuilt) initSelects();
        buildOrder(null);
        idx = 0;
        saveLast();
        render();
        scrollTop();
        break;
      case 'goto-wrong': {
        const id = el.dataset.id;
        if (!id) break;
        view = 'quiz';
        // 已订正的题不在错题本里，用顺序模式才能跳到它；仍在错题本则留在错题模式
        mode = progress.wrong[id] ? 'wrong' : 'seq';
        const modeSelect = $('#sel-mode');
        if (modeSelect) modeSelect.value = mode;
        buildOrder(id);
        if (order.indexOf(id) < 0) {
          filters = { subject: 'all', type: 'all' };
          initSelects();
          buildOrder(id);
        }
        idx = Math.max(0, order.indexOf(id));
        saveLast();
        render();
        scrollTop();
        break;
      }
      case 'reset-progress':
        resetAllProgress();
        break;
      case 'reset-progress-confirm':
        doResetProgress();
        break;
      case 'restore-bank':
        restoreBuiltin();
        break;
      case 'reload':
        location.reload();
        break;
      default:
        break;
    }
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const el = event.target.closest('[data-act]');
      if (!el) return;
      const act = el.getAttribute('data-act');
      if (!act) return;
      handleAction(act, el, event);
    });

    document.addEventListener('input', (event) => {
      if (event.target && event.target.id === 'write-input') {
        const q = currentQuestion();
        if (q) {
          progress.drafts[q.id] = event.target.value;
          saveDraftSoon();
        }
      }
    });

    const subjectSelect = $('#sel-subject');
    const typeSelect = $('#sel-type');
    const modeSelect = $('#sel-mode');
    if (subjectSelect) {
      subjectSelect.addEventListener('change', () => {
        filters.subject = subjectSelect.value;
        view = 'quiz';
        buildOrder(null);
        idx = 0;
        saveLast();
        render();
        scrollTop();
      });
    }
    if (typeSelect) {
      typeSelect.addEventListener('change', () => {
        filters.type = typeSelect.value;
        view = 'quiz';
        buildOrder(null);
        idx = 0;
        saveLast();
        render();
        scrollTop();
      });
    }
    if (modeSelect) {
      modeSelect.addEventListener('change', () => {
        mode = modeSelect.value;
        view = 'quiz';
        buildOrder(null);
        idx = 0;
        saveLast();
        render();
        scrollTop();
      });
    }

    // 页面任意位置拖拽文件
    let dragDepth = 0;
    window.addEventListener('dragenter', (event) => {
      if (!event.dataTransfer) return;
      const hasFiles = Array.prototype.indexOf.call(event.dataTransfer.types || [], 'Files') >= 0;
      if (!hasFiles) return;
      event.preventDefault();
      dragDepth++;
      const hint = $('#drop-hint');
      if (hint) hint.classList.add('show');
    });
    window.addEventListener('dragover', (event) => {
      if (event.dataTransfer && Array.prototype.indexOf.call(event.dataTransfer.types || [], 'Files') >= 0) {
        event.preventDefault();
      }
    });
    window.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        const hint = $('#drop-hint');
        if (hint) hint.classList.remove('show');
      }
    });
    window.addEventListener('drop', (event) => {
      if (!event.dataTransfer) return;
      dragDepth = 0;
      const hint = $('#drop-hint');
      if (hint) hint.classList.remove('show');
      const files = event.dataTransfer.files;
      if (!files || !files[0]) return;
      event.preventDefault();
      if (modalOpen) {
        const zone = $('#drop-zone');
        if (zone) handleImportFile(files[0]);
      } else {
        openImport();
        setTimeout(() => handleImportFile(files[0]), 60);
      }
    });

    document.addEventListener('keydown', onKeyDown);
  }

  function onKeyDown(event) {
    const target = event.target;
    const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' ||
      (target && target.isContentEditable);

    if (event.key === 'Escape') {
      if (modalOpen) { closeModal(); return; }
      if (document.body.classList.contains('sheet-open')) {
        document.body.classList.remove('sheet-open');
        return;
      }
      if (typing && target.blur) target.blur();
      return;
    }

    if (typing) {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && tag === 'textarea' && view === 'quiz') {
        event.preventDefault();
        submitWrite();
      }
      return;
    }

    if (modalOpen) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (view === 'stats') return;

    if (mode === 'study') {
      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        studyHidden = !studyHidden;
        render();
      }
      return;
    }

    if (view !== 'quiz') return;

    if (event.key === 'ArrowRight') { event.preventDefault(); nextQuestion(); return; }
    if (event.key === 'ArrowLeft') { event.preventDefault(); prevQuestion(); return; }

    if (event.key === 'Enter') {
      const q = currentQuestion();
      if (!q) return;
      const rec = progress.answers[q.id];
      const graded = rec && typeof rec.correct === 'boolean';
      if (graded) { event.preventDefault(); nextQuestion(); return; }
      if (q.type === 'multi' && pending && pending.keys.length) { event.preventDefault(); submitMulti(); return; }
      if (q.type === 'fill') { event.preventDefault(); submitWrite(); return; }
      if (q.type === 'essay' || q.type === 'operation') { event.preventDefault(); submitWrite(); return; }
      return;
    }

    if (/^[1-9]$/.test(event.key)) {
      const q = currentQuestion();
      if (!q) return;
      const opt = q.options[Number(event.key) - 1];
      if (opt) { event.preventDefault(); pickOption(opt.key); }
      return;
    }

    const lower = String(event.key || '').toLowerCase();
    if (['a', 'b', 'c', 'd'].indexOf(lower) >= 0) {
      const q = currentQuestion();
      if (!q) return;
      const key = lower.toUpperCase();
      if (q.options.some((o) => o.key === key)) { event.preventDefault(); pickOption(key); }
      return;
    }
    if (lower === 'm') { event.preventDefault(); toggleFlag(); return; }
    if (lower === 'f') { event.preventDefault(); toggleFav(); return; }
    if (lower === 'r') { event.preventDefault(); resetCurrent(); return; }
  }

  /* ------------------------------ 启动 ------------------------------ */
  function renderFatal(error) {
    const container = $('#view');
    if (!container) return;
    container.innerHTML = '<div class="fatal-card">' +
      '<div class="empty-icon">⚠️</div>' +
      '<h2>题库加载失败</h2>' +
      '<p>请确认 <code>data/questions.json</code> 与 <code>data/questions.js</code> 存在；' +
      '如果是直接双击打开，请确认 <code>data/questions.js</code> 已生成。</p>' +
      '<pre>' + esc(error && error.message ? error.message : String(error)) + '</pre>' +
      '<div class="fatal-actions">' +
      '<button type="button" class="btn primary" data-act="reload">重新加载</button>' +
      '<button type="button" class="btn ghost" data-act="open-import">导入题库</button>' +
      '</div></div>';
  }

  async function boot() {
    progress = loadProgress();
    applyTheme();
    bindEvents();
    try {
      const loaded = await loadBankData();
      // 极慢网络下，用户可能在加载完成前就从弹窗导入了题库；不要覆盖它
      if (bank) return;
      bank = loaded;
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').addEventListener) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
          if (progress.settings.theme === 'auto') applyTheme();
        });
      }
      initSelects();

      filters.subject = progress.last.subject || 'all';
      filters.type = progress.last.type || 'all';
      if (!bank.subjects.some((s) => s.code === filters.subject)) filters.subject = 'all';
      if (filters.type !== 'all' && bank.types.indexOf(filters.type) < 0) filters.type = 'all';
      mode = MODE_LABEL[progress.last.mode] ? progress.last.mode : 'seq';

      buildOrder(progress.last.qid);
      render();
      if (!window.__BANK__ && bank.source === 'fetch') {
        // 不阻塞首屏：后台预取脚本版，供 file:// 或恢复内置题库时秒用
        loadBundledBank().catch(() => { /* 忽略 */ });
      }
    } catch (err) {
      console.error(err);
      renderFatal(err);
    }
  }

  /* 暴露少量只读/调试接口，便于在控制台排查（不影响正常使用） */
  window.NCREQuiz = {
    version: APP_VERSION,
    get bank() { return bank; },
    get progress() { return progress; },
    get order() { return order.slice(); },
    get index() { return idx; },
    jumpTo: function (index) { jumpTo(Number(index)); },
    subjectName: subjectName
  };

  boot();
})();
