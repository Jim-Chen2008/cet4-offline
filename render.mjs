// CET4 渲染共享模块：网页版 & 打印版共用
// 关键：reading.sections 有三种 type，字段各不相同：
//   word_fill           -> content(带 __26__ 空) + word_bank + blanks
//   paragraph_matching  -> paragraphs[{id,content}] + options[{id,content}]
//   reading_comprehension -> passages[{title,content,questions[]}]
export function esc(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function renderQuestions(qs) {
  if (!qs || !qs.length) return "";
  let h = `<ol class="questions">`;
  for (const q of qs) {
    h += `<li><p class="q">${esc(q.question)}</p>`;
    if (q.options && q.options.length) h += `<ul class="opts">` + q.options.map((o) => `<li>${esc(o)}</li>`).join("") + `</ul>`;
    h += `</li>`;
  }
  return h + `</ol>`;
}

export function renderListening(d, pdf = false) {
  const secs = (d.listening && d.listening.sections) || [];
  let h = `<section class="block"><h2>Part II　听力理解 (Listening Comprehension)</h2>`;
  for (const s of secs) {
    const fname = "audio/" + s.title.replace(/\s/g, "") + ".mp3";
    h += `<div class="section"><h3>${esc(s.title)} ${s.type ? `<span class="tag">${esc(s.type)}</span>` : ""}</h3>`;
    if (s.description) h += `<p class="desc">${esc(s.description)}</p>`;
    h += pdf
      ? `<p class="audiocaption">听力音频：${esc(fname)}（见离线包 papers 目录对应 audio 文件夹）</p>`
      : `<audio controls preload="none" src="${esc(fname)}"></audio>`;
    h += renderQuestions(s.questions);
    h += `</div>`;
  }
  return h + `</section>`;
}

// 修复重点：按 type 分别渲染，不再只认 content/questions
export function renderReading(d) {
  const secs = (d.reading && d.reading.sections) || [];
  let h = `<section class="block"><h2>Part III　阅读理解 (Reading Comprehension)</h2>`;
  for (const s of secs) {
    h += `<div class="section"><h3>${esc(s.title || "")}${s.description ? `　<span class="tag">${esc(s.description)}</span>` : ""}</h3>`;

    // Section A 选词填空
    if (s.type === "word_fill") {
      if (s.word_bank && s.word_bank.length) {
        h += `<div class="wordbank"><strong>Word Bank（词库）</strong><ul>` +
          s.word_bank.map((w, i) => `<li>${LETTERS[i] || i + 1}) ${esc(w)}</li>`).join("") + `</ul></div>`;
      }
      if (s.content) {
        h += `<div class="passage">` + esc(s.content).replace(/__(\d+)__/g, '<span class="blank">__$1__</span>') + `</div>`;
      }
      if (s.blanks && s.blanks.length) {
        h += `<p class="meta">空格题号：${s.blanks.map((b) => esc(b.id)).join("、")}</p>`;
      }
    }

    // Section B 段落匹配：11 个段落(A-K) + 10 条待匹配句子(36-45)
    if (s.type === "paragraph_matching") {
      h += `<p class="hint">Directions: 阅读下列段落，为每个句子选出所对应的段落。每个段落可能被选一次、多次或不被选择。</p>`;
      if (s.paragraphs && s.paragraphs.length) {
        h += `<div class="paras">`;
        for (const p of s.paragraphs) {
          h += `<div class="para"><span class="plabel">${esc(p.id)}</span><div class="paratext">${esc(p.content)}</div></div>`;
        }
        h += `</div>`;
      }
      if (s.options && s.options.length) {
        h += `<div class="matchbox"><h4>待匹配句子</h4><ol class="matchq">`;
        for (const o of s.options) h += `<li><span class="num">${esc(o.id)}.</span> ${esc(o.content)}</li>`;
        h += `</ol></div>`;
      }
    }

    // Section C 仔细阅读：每篇文章 + 该篇题目
    if (s.type === "reading_comprehension") {
      if (s.passages && s.passages.length) {
        for (const p of s.passages) {
          h += `<div class="passagebox">`;
          if (p.title) h += `<h4>${esc(p.title)}</h4>`;
          if (p.content) h += `<div class="passage">${esc(p.content)}</div>`;
          h += renderQuestions(p.questions);
          h += `</div>`;
        }
      }
    }

    // 兜底：任何计划外结构也尽量把内容吐出来
    if (!["word_fill", "paragraph_matching", "reading_comprehension"].includes(s.type)) {
      if (s.content) h += `<div class="passage">${esc(s.content)}</div>`;
      h += renderQuestions(s.questions);
    }
    h += `</div>`;
  }
  return h + `</section>`;
}

export function renderWriting(d, pdf = false) {
  const w = d.writing || {};
  return `<section class="block"><h2>Part I　写作 (Writing)</h2><div class="section">
    <p class="desc">${esc(w.directions || "")}</p>
    <p class="meta">建议时间：${esc(w.time_limit)} 分钟 ｜ 字数：${esc(w.word_limit_min)}-${esc(w.word_limit_max)} ｜ 分值：${esc(w.score)}</p>
    ${pdf ? `<div class="answerbox">作答区</div>` : `<textarea class="answer" placeholder="在此作答..."></textarea>`}
    </div></section>`;
}
export function renderTranslation(d, pdf = false) {
  const t = d.translation || {};
  return `<section class="block"><h2>Part IV　翻译 (Translation)</h2><div class="section">
    <p class="desc">${esc(t.directions || "")}</p>
    <div class="passage">${esc(t.content || "")}</div>
    <p class="meta">建议时间：${esc(t.time_limit)} 分钟 ｜ 分值：${esc(t.score)}</p>
    ${pdf ? `<div class="answerbox">作答区</div>` : `<textarea class="answer" placeholder="在此作答..."></textarea>`}
    </div></section>`;
}

// 站点有两套字段命名：早期卷用 *_transcript_en（纯英文），
// 新卷/部分卷用 news_transcript 等（中英对照）。两者都是 SRT 字幕格式。
// 策略：每段取内容最全（最长）的一份，并清理 SRT 序号/时间码，还原成可读原文。
const TRANSCRIPT_GROUPS = [
  ["新闻听力原文 / News Report", ["news_transcript", "news_transcript_en"]],
  ["长对话听力原文 / Conversations", ["conversations_transcript", "conversations_transcript_en"]],
  ["听力篇章原文 / Passages", ["passages_transcript", "passages_transcript_en"]],
];
function cleanSRT(raw) {
  const lines = String(raw).replace(/\r\n?/g, "\n").split("\n");
  const cues = [];
  let cur = [];
  const flush = () => { if (cur.length) { cues.push(cur.join(" ")); cur = []; } };
  for (const ln of lines) {
    const t = ln.trim();
    if (/^\d+$/.test(t)) { flush(); continue; }                          // 字幕序号
    if (/^\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(t)) continue;         // 时间码
    if (!t) { flush(); continue; }
    cur.push(t);
  }
  flush();
  return cues.join("\n");
}
export function renderTranscripts(d, pdf = false) {
  const items = [];
  for (const [label, keys] of TRANSCRIPT_GROUPS) {
    let raw = "";
    for (const k of keys) {
      const v = String(d[k] || "").trim();
      if (v.length > raw.length) raw = v;   // 取最全版本（中英对照通常更长）
    }
    const text = cleanSRT(raw);
    if (!text.trim()) continue;
    const zh = /[\u4e00-\u9fff]/.test(text);
    const full = `${label}${zh ? "（中英对照）" : "（英文）"}`;
    items.push(pdf
      ? `<div class="ts-item"><h3>${esc(full)}</h3><div class="transcript">${esc(text)}</div></div>`
      : `<details open><summary>${esc(full)}</summary><div class="transcript">${esc(text)}</div></details>`);
  }
  if (!items.length) return "";
  return `<section class="block"><h2>听力原文 / Transcripts</h2>${items.join("")}</section>`;
}

export function examTitle(d, fallback) {
  const ed = d.exam_details || {};
  return ed.title || fallback;
}
export function examMeta(d) {
  const ed = d.exam_details || {};
  return `年份 ${esc(ed.year)} ｜ 月份 ${esc(ed.month)} ｜ 第 ${esc(ed.version)} 套 ｜ 时长 ${esc(ed.duration)} 分钟 ｜ 满分 ${esc(ed.total_score)}（及格 ${esc(ed.pass_score)}）`;
}

const SHARED_CSS = `
  *{box-sizing:border-box}
  h1{font-size:23px;border-bottom:3px solid #2563eb;padding-bottom:8px;margin:0 0 6px}
  h2{font-size:18px;margin:26px 0 10px;color:#1e3a8a;border-left:5px solid #2563eb;padding-left:10px}
  h3{font-size:15px;margin:16px 0 8px}
  h4{font-size:14px;margin:14px 0 6px;color:#1e40af}
  .meta{color:#6b7280;font-size:12px;margin:4px 0}
  .tag{background:#dbeafe;color:#1e40af;font-size:11px;padding:1px 8px;border-radius:10px;margin-left:4px;font-weight:400}
  .block{margin-bottom:10px}
  .section{border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;margin-top:10px;background:#fafafa}
  .desc{background:#eff6ff;padding:8px 12px;border-radius:6px;margin:6px 0}
  .hint{background:#f0fdf4;color:#166534;padding:8px 12px;border-radius:6px;margin:8px 0}
  .passage{white-space:pre-wrap;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;margin:8px 0;line-height:1.8}
  .blank{background:#fef08a;font-weight:700;padding:0 2px;border-radius:3px}
  .questions{margin:8px 0;padding-left:22px}.questions li{margin:9px 0}
  .q{font-weight:600;margin:0 0 3px}.opts{list-style:none;padding-left:0;margin:3px 0}.opts li{padding:2px 8px;border-radius:4px}.opts li:nth-child(odd){background:#f3f4f6}
  .wordbank{margin:8px 0;background:#fff;border:1px dashed #94a3b8;border-radius:6px;padding:8px 12px}
  .wordbank ul{columns:3;font-size:12px;list-style:none;padding-left:0;margin:4px 0}.wordbank li{padding:1px 0}
  .paras{margin:8px 0}
  .para{display:flex;gap:10px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;margin:6px 0}
  .plabel{flex:0 0 24px;height:24px;line-height:24px;text-align:center;background:#1e3a8a;color:#fff;border-radius:4px;font-weight:700;font-size:13px}
  .paratext{flex:1;white-space:pre-wrap;line-height:1.8}
  .matchbox{background:#fff;border:1px solid #bfdbfe;border-radius:6px;padding:8px 12px;margin:10px 0}
  .matchq{padding-left:0;list-style:none;margin:6px 0}.matchq li{margin:7px 0;padding:4px 6px;background:#f8fafc;border-radius:4px}
  .matchq .num{font-weight:700;color:#1d4ed8;margin-right:6px}
  .passagebox{margin:12px 0;padding-top:6px;border-top:1px dashed #cbd5e1}
  .answerbox{width:100%;min-height:110px;margin-top:8px;padding:10px;border:1px dashed #94a3b8;border-radius:6px;color:#94a3b8;font-size:12px}
  .audiocaption{background:#fef3c7;color:#92400e;padding:6px 10px;border-radius:6px;font-size:12px;margin:6px 0}
  .transcript{white-space:pre-wrap;margin-top:6px;color:#374151;line-height:1.85}
  .ts-item{border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;margin:10px 0;background:#fff}
`;

// 网页版（含播放器 / 作答框 / 折叠原文）
export function paperHTML(d, fallback) {
  const css = `${SHARED_CSS}
  body{font-family:-apple-system,"Segoe UI",Roboto,"Microsoft YaHei",sans-serif;max-width:900px;margin:0 auto;padding:24px;color:#1f2937;line-height:1.7;font-size:13.5px}
  audio{width:100%;margin:8px 0;display:block}
  textarea.answer{width:100%;min-height:140px;margin-top:8px;padding:10px;border:1px solid #cbd5e1;border-radius:6px;font-family:inherit}
  details{margin:8px 0;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:8px 12px}summary{cursor:pointer;font-weight:600}
  .topbar{position:sticky;top:0;background:#fff;padding:10px 0;border-bottom:1px solid #e5e7eb;margin-bottom:12px}
  .topbar a{color:#2563eb;text-decoration:none;margin-right:16px;font-size:14px}`;
  const audioCount = Object.keys(d.audio_urls || {}).length;
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(examTitle(d, fallback))} - CET4 离线卷</title><style>${css}</style></head><body>
  <div class="topbar"><a href="../index.html">← 返回总目录</a><span class="meta">离线版 · 音频 ${audioCount} 段</span></div>
  <h1>${esc(examTitle(d, fallback))}</h1>
  <p class="meta">${examMeta(d)}</p>
  ${renderWriting(d, false)}${renderListening(d, false)}${renderReading(d)}${renderTranslation(d, false)}${renderTranscripts(d, false)}
  </body></html>`;
}

// 打印版：一份就是一整条连续内容，绝不分页（PDF 用 page.pdf 精确单页）
export function printHTML(d, fallback, part) {
  const css = `${SHARED_CSS}
  @page{margin:0}
  html,body{margin:0;padding:0}
  body{width:794px;padding:34px 40px 56px;font-family:"Microsoft YaHei","Segoe UI",Roboto,sans-serif;color:#1f2937;line-height:1.7;font-size:13.2px;background:#fff}
  .section,.para,.ts-item,.questions li,.passage{break-inside:auto}
  .passagebox{break-inside:auto}
  .phead{border-bottom:3px solid #2563eb;padding-bottom:10px;margin-bottom:6px}
  .phead h1{margin:0;border:0;padding:0;font-size:22px}
  .phead .sub{color:#6b7280;font-size:12px;margin-top:5px}
  .pfoot{margin-top:24px;padding-top:8px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:11px;text-align:center}`;
  const head = `<div class="phead"><h1>${esc(examTitle(d, fallback))}</h1><div class="sub">${part === "transcript" ? "听力原文 / Transcripts" : "原卷 / Question Paper"}　·　${examMeta(d)}</div></div>`;
  const foot = `<div class="pfoot">CET-4 离线试卷 · ${part === "transcript" ? "听力原文" : "原卷"} · 第 1 页 / 共 1 页</div>`;
  let body;
  if (part === "transcript") {
    body = renderTranscripts(d, true);
  } else {
    body = renderWriting(d, true) + renderListening(d, true) + renderReading(d) + renderTranslation(d, true);
  }
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${esc(examTitle(d, fallback))} - ${part}</title><style>${css}</style></head><body>${head}${body}${foot}</body></html>`;
}
