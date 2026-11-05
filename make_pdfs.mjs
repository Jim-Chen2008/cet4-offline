// CET4 离线卷 -> PDF 生成器
// 规则：试卷主体一整列连续排版（不强制分页）；听力原文单独起一页。
import { mkdir, writeFile, readFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { spawn } from "child_process";

const ROOT = "C:/Users/Jim/WorkBuddy/2026-11-03-21-42-19/cet4_offline";
const PAPERS = path.join(ROOT, "papers");
const SRC = path.join(ROOT, "pdf_src");   // 中间 HTML
const OUT = path.join(ROOT, "pdfs");       // 最终 PDF
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

function esc(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// 听力：不渲染可播放的 audio（PDF 里没用），改为音频标注
function renderListening(d) {
  const secs = (d.listening && d.listening.sections) || [];
  let h = `<section class="block"><h2>听力 (Listening)</h2>`;
  for (const s of secs) {
    const fname = "audio/" + s.title.replace(/\s/g, "") + ".mp3";
    h += `<div class="section"><h3>${esc(s.title)} ${s.type ? `<span class="tag">${esc(s.type)}</span>` : ""}</h3>`;
    if (s.description) h += `<p class="desc">${esc(s.description)}</p>`;
    h += `<p class="audiocaption">🎧 听力音频：${esc(fname)}（请使用离线包 papers 目录下对应 audio 文件夹播放）</p>`;
    const qs = s.questions || [];
    if (qs.length) {
      h += `<ol class="questions">`;
      for (const q of qs) {
        h += `<li><p class="q">${esc(q.question)}</p>`;
        if (q.options && q.options.length) h += `<ul class="opts">` + q.options.map((o) => `<li>${esc(o)}</li>`).join("") + `</ul>`;
        h += `</li>`;
      }
      h += `</ol>`;
    }
    h += `</div>`;
  }
  return h + `</section>`;
}
function renderReading(d) {
  const secs = (d.reading && d.reading.sections) || [];
  let h = `<section class="block"><h2>阅读 (Reading)</h2>`;
  for (const s of secs) {
    h += `<div class="section"><h3>${esc(s.title || "")} ${s.type ? `<span class="tag">${esc(s.type)}</span>` : ""}</h3>`;
    if (s.description) h += `<p class="desc">${esc(s.description)}</p>`;
    if (s.content) h += `<div class="passage">${esc(s.content)}</div>`;
    if (s.word_bank && s.word_bank.length) h += `<div class="wordbank"><strong>Word Bank:</strong><ul>` + s.word_bank.map((w) => `<li>${esc(w)}</li>`).join("") + `</ul></div>`;
    const qs = s.questions || [];
    if (qs.length) {
      h += `<ol class="questions">`;
      for (const q of qs) {
        h += `<li><p class="q">${esc(q.question)}</p>`;
        if (q.options && q.options.length) h += `<ul class="opts">` + q.options.map((o) => `<li>${esc(o)}</li>`).join("") + `</ul>`;
        h += `</li>`;
      }
      h += `</ol>`;
    }
    h += `</div>`;
  }
  return h + `</section>`;
}
function renderWriting(d) {
  const w = d.writing || {};
  return `<section class="block"><h2>写作 (Writing)</h2><div class="section">
    <p class="desc">${esc(w.directions || "")}</p>
    <p class="meta">建议时间：${esc(w.time_limit)} 分钟 ｜ 字数：${esc(w.word_limit_min)}-${esc(w.word_limit_max)} ｜ 分值：${esc(w.score)}</p>
    <div class="answerbox">作答区</div></div></section>`;
}
function renderTranslation(d) {
  const t = d.translation || {};
  return `<section class="block"><h2>翻译 (Translation)</h2><div class="section">
    <p class="desc">${esc(t.directions || "")}</p>
    <div class="passage">${esc(t.content || "")}</div>
    <p class="meta">建议时间：${esc(t.time_limit)} 分钟 ｜ 分值：${esc(t.score)}</p>
    <div class="answerbox">作答区</div></div></section>`;
}
// 听力原文：展开为可见块，整块强制单独起一页
function renderTranscripts(d) {
  const map = [
    ["news_transcript", "新闻听力原文"], ["conversations_transcript", "对话听力原文"], ["passages_transcript", "篇章听力原文"],
    ["news_transcript_en", "News Transcript (EN)"], ["news_transcript_zh", "新闻原文(中)"],
    ["conversations_transcript_en", "Conversations (EN)"], ["conversations_transcript_zh", "对话原文(中)"],
    ["passages_transcript_en", "Passages (EN)"], ["passages_transcript_zh", "篇章原文(中)"],
  ];
  const items = map.filter(([k]) => d[k]).map(([k, label]) => `<div class="ts-item"><h3>${esc(label)}</h3><div class="transcript">${esc(d[k])}</div></div>`);
  if (!items.length) return "";
  return `<section class="block transcripts-block"><h2>听力原文 / Transcripts</h2>${items.join("")}</section>`;
}
function renderPaperHTML(d, card) {
  const ed = d.exam_details || card;
  const css = `
  @page { size: A4; margin: 14mm; }
  *{box-sizing:border-box}
  body{font-family:"Microsoft YaHei","Segoe UI",Roboto,sans-serif;color:#1f2937;line-height:1.65;font-size:13px;margin:0}
  h1{font-size:22px;border-bottom:3px solid #2563eb;padding-bottom:8px;margin:0 0 6px}
  h2{font-size:18px;margin:26px 0 10px;color:#1e3a8a}
  h3{font-size:14px;margin:14px 0 6px}
  .meta{color:#6b7280;font-size:12px;margin:2px 0}
  .tag{background:#dbeafe;color:#1e40af;font-size:11px;padding:1px 8px;border-radius:10px;margin-left:6px}
  .block{margin-bottom:8px}
  .section{border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;margin-top:10px;background:#fafafa;break-inside:avoid}
  .desc{background:#eff6ff;padding:8px 12px;border-radius:6px;font-size:13px;margin:6px 0}
  .passage{white-space:pre-wrap;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:10px;margin:8px 0;font-size:13px}
  .questions{margin:6px 0;padding-left:20px}.questions li{margin:8px 0;break-inside:avoid}
  .q{font-weight:600;margin:0 0 3px}.opts{list-style:none;padding-left:0;margin:3px 0}.opts li{padding:2px 8px;border-radius:4px}.opts li:nth-child(odd){background:#f3f4f6}
  .wordbank{margin:6px 0}.wordbank ul{columns:2;font-size:12px}
  .answerbox{width:100%;min-height:120px;margin-top:8px;padding:10px;border:1px dashed #94a3b8;border-radius:6px;color:#94a3b8;font-size:12px}
  .audiocaption{background:#fef3c7;color:#92400e;padding:6px 10px;border-radius:6px;font-size:12px;margin:6px 0}
  /* 听力原文：单独起一页，整体不分页 */
  .transcripts-block{break-before:page}
  .ts-item{border:1px solid #e5e7eb;border-radius:6px;padding:8px 12px;margin:8px 0;background:#fff;break-inside:avoid}
  .transcript{white-space:pre-wrap;margin-top:6px;font-size:12px;color:#374151}
  .topnote{color:#6b7280;font-size:12px;margin-bottom:4px}`;
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
  <title>${esc(ed.title || card.title)} - CET4 试卷PDF</title><style>${css}</style></head><body>
  <h1>${esc(ed.title || card.title)}</h1>
  <p class="topnote">年份 ${esc(ed.year)} ｜ 月份 ${esc(ed.month)} ｜ 第 ${esc(ed.version)} 套 ｜ 时长 ${esc(ed.duration)} 分钟 ｜ 满分 ${esc(ed.total_score)}（及格 ${esc(ed.pass_score)}）</p>
  ${renderListening(d)}${renderReading(d)}${renderWriting(d)}${renderTranslation(d)}${renderTranscripts(d)}
  </body></html>`;
}

const folders = (await readdir(PAPERS, { withFileTypes: true }))
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

await mkdir(SRC, { recursive: true });
await mkdir(OUT, { recursive: true });

// 1) 生成所有 HTML
for (const f of folders) {
  const dir = path.join(PAPERS, f);
  const dataPath = path.join(dir, "data.json");
  if (!existsSync(dataPath)) { console.log(`[skip] ${f}: 无 data.json`); continue; }
  const d = JSON.parse(await readFile(dataPath, "utf8"));
  const card = { title: (d.exam_details && d.exam_details.title) || f, year: d.exam_details?.year, month: d.exam_details?.month, version: d.exam_details?.version, duration: d.exam_details?.duration, total_score: d.exam_details?.total_score, pass_score: d.exam_details?.pass_score };
  const html = renderPaperHTML(d, card);
  await mkdir(path.join(SRC, f), { recursive: true });
  await writeFile(path.join(SRC, f, "index.html"), html, "utf8");
}
console.log(`[html] 已生成 ${folders.length} 套 HTML`);

// 2) 用 Edge 无头打印 PDF
function printPDF(htmlFile, pdfFile) {
  return new Promise((resolve, reject) => {
    const udd = path.join(SRC, "_edge_" + Math.random().toString(36).slice(2));
    const args = [
      "--headless", "--no-sandbox", "--disable-gpu",
      "--user-data-dir=" + udd,
      "--no-pdf-header-footer",
      "--virtual-time-budget=8000",
      "--print-to-pdf=" + pdfFile,
      "file:///" + htmlFile.replace(/\\/g, "/"),
    ];
    const p = spawn(EDGE, args, { windowsHide: true });
    let err = "";
    p.stderr.on("data", (b) => (err += b.toString()));
    p.on("close", (code) => {
      if (code === 0 && existsSync(pdfFile)) resolve(pdfFile);
      else reject(new Error("Edge exit " + code + " " + err.slice(0, 200)));
    });
  });
}

let ok = 0, fail = 0;
for (const f of folders) {
  const htmlFile = path.join(SRC, f, "index.html");
  if (!existsSync(htmlFile)) continue;
  const pdfFile = path.join(OUT, f + ".pdf");
  try {
    await printPDF(htmlFile, pdfFile);
    ok++;
    if (ok % 10 === 0 || ok === folders.length) console.log(`[pdf] ${ok}/${folders.length} 完成`);
  } catch (e) {
    fail++;
    console.error(`[FAIL] ${f}: ${e.message}`);
  }
}
console.log(`DONE. 成功 ${ok}，失败 ${fail}。输出目录：${OUT}`);
