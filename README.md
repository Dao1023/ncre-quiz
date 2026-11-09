# 计算机等级考试 · 在线刷题

一个 **打开就能刷题** 的静态网页刷题器，零后端、零构建、零登录。手机电脑都能用，进度存在本地浏览器里，不上传任何数据。

在线地址：**https://dao1023.github.io/ncre-quiz/**

## 有什么

| 科目 | 题量 |
| --- | --- |
| 四级 数据库工程师 | 2,746 |
| 三级 数据库技术 | 1,680 |

- 点选项即判对错，错了立刻标出正确项并显示解析
- 答题卡四色（答对 / 答错 / 未答 / 已标记），点数字直接跳题
- 五种模式：顺序刷题、随机刷题、只刷错题、只刷收藏、**背题模式**（默认显示答案，适合过一遍）
- 标记（M）、收藏（F）、左右方向键切题
- 进度用 localStorage 保存，关掉浏览器再回来接着刷
- 导出 / 导入备份 JSON，换设备不丢进度
- 拖拽导入自己的题库（JSON 或 CSV）
- 暗色主题、手机适配

## 离线 / 本地使用

整个目录是纯静态文件，双击 `index.html` 就能用（会自动走 `window.__BANK__` 注入，不需要起服务器）。也可以：

```bash
python -m http.server 8899
```

## 题库格式

```json
{
  "meta": { "title": "…", "subjects": [{ "code": "L4-DB", "name": "四级 数据库工程师", "count": 2746 }] },
  "questions": [
    {
      "id": "…",
      "subject": "L4-DB",
      "type": "single",
      "stem": "题干，支持 HTML",
      "options": [{ "tag": "A", "text": "选项" }],
      "answer": ["B"],
      "analysis": "解析，可空",
      "source": "2021年3月"
    }
  ]
}
```

改完题库后跑 `node tools/build-data.mjs` 重新生成 `data/questions.js`。

## 数据来源与致谢

- 四级 / 三级数据库题库转自 [Mcd0LUO/NCRE-Free-Practice](https://github.com/Mcd0LUO/NCRE-Free-Practice)（原项目未声明许可证，仅作学习交流转载，如有异议请提 issue，我会立即下架）。
- 前端为本仓库原创，MIT。

## 免责

题库内容版权归原出题方所有。本项目仅用于个人学习，禁止商用。若权利人认为侵权，请提 issue，会立刻删除相关数据。
