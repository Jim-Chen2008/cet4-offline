// 从本地 data.json 重建全部产物（不联网）：
//   papers/<套>/index.html        网页版（修复段落匹配/阅读理解空白）
//   pdf_src/<套>/原卷.html        打印中间文件
//   pdf_src/<套>/听力原文.html    打印中间文件
//   pdfs/<套>_原卷.pdf            恰好 1 页的超长连续页面
//   pdfs/<套>_听力原文.pdf        恰好 1 页的超长连续页面
// 用法：node rebuild.mjs [--only=1]
import { mkdir, writeFile, readFile, readdir, rm } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import path from "path";
import puppeteer from "puppeteer-core";
import { PDFDocument } from "pdf-lib";
import { paperHTML, printHTML } from "./render.mjs";

const ROOT = "C:/Users/Jim/WorkBuddy/2026-11-03-21-42-19/cet4_offline";
const PAPERS = path.join(ROOT, "papers");
const SRC = path.join(ROOT, "pdf_src");
const OUT = path.join(ROOT, "pdfs");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PW = 794;              // 210mm @96dpi
const MAX_H = 18500;         // PDF 单页硬上限 200inch ≈ 19200px，留余量

const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? Number(onlyArg.split("=")[1]) : 0;

// 统计 PDF 页数：直接用 pdf-lib 解析，最可靠
async function pageCount(buf) {
  const doc = await PDFDocument.load(buf);
  return doc.getPageCount();
}

async function renderOnePDF(page, html, pdfPath) {
  await page.setViewport({ width: PW, height: 1200, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  let H = Math.ceil(await page.evaluate(() => document.body.getBoundingClientRect().height)) + 8;
  let zoom = 1;
  if (H > MAX_H) {
    zoom = MAX_H / H;
    await page.evaluate((z) => { document.body.style.zoom = String(z); }, zoom);
    H = Math.ceil(await page.evaluate(() => document.body.getBoundingClientRect().height)) + 8;
  }
  const buf = await page.pdf({
    path: pdfPath,
    width: "210mm",
    height: H + "px",
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    printBackground: true,
    preferCSSPageSize: false,
  });
  return { H, zoom, pages: await pageCount(buf), bytes: buf.length, buf };
}

const folders = (await readdir(PAPERS, { withFileTypes: true }))
  .filter((e) => e.isDirectory() && existsSync(path.join(PAPERS, e.name, "data.json")))
  .map((e) => e.name);
const list = ONLY ? folders.slice(0, ONLY) : folders;

await mkdir(SRC, { recursive: true });
await mkdir(OUT, { recursive: true });

// 只生成新文件，不做删除（旧版多页 PDF 由外层单独清理）
if (!ONLY) console.log("[info] 生成新版单页 PDF；旧版多页 A4 PDF 稍后单独清理");

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();

let ok = 0, bad = [];
for (const f of list) {
  const d = JSON.parse(await readFile(path.join(PAPERS, f, "data.json"), "utf8"));
  // 1) 网页版
  await writeFile(path.join(PAPERS, f, "index.html"), paperHTML(d, f), "utf8");

  // 2) 两份单页长条 PDF
  const srcDir = path.join(SRC, f);
  await mkdir(srcDir, { recursive: true });
  const parts = [
    ["原卷", "paper"],
    ["听力原文", "transcript"],
  ];
  const stat = [];
  const bufs = [];
  for (const [label, part] of parts) {
    const html = printHTML(d, f, part);
    await writeFile(path.join(srcDir, label + ".html"), html, "utf8");
    const pdfPath = path.join(OUT, `${f}_${label}.pdf`);
    const r = await renderOnePDF(page, html, pdfPath);
    bufs.push(r.buf);
    stat.push(`${label}:${r.pages}页/${r.H}px/${Math.round(r.bytes / 1024)}KB${r.zoom < 1 ? "(zoom" + r.zoom.toFixed(2) + ")" : ""}`);
    if (r.pages !== 1) bad.push(`${f}_${label} => ${r.pages} 页`);
  }

  // 3) 合订版：一个文件恰好 2 页（第1页原卷、第2页听力原文），各页保留自己的高度
  const merged = await PDFDocument.create();
  for (const b of bufs) {
    const src = await PDFDocument.load(b);
    const [pg] = await merged.copyPages(src, [0]);
    merged.addPage(pg);
  }
  const mergedBytes = await merged.save();
  await writeFile(path.join(OUT, `${f}_完整.pdf`), mergedBytes);
  const heights = merged.getPages().map((p) => Math.round(p.getHeight()));
  stat.push(`完整:${merged.getPageCount()}页/高${heights.join("+")}pt`);
  if (merged.getPageCount() !== 2) bad.push(`${f}_完整 => ${merged.getPageCount()} 页`);

  ok++;
  console.log(`[${ok}/${list.length}] ${f}  ${stat.join("  ")}`);
}

await browser.close();
console.log(`\nDONE. 重建 ${ok} 套，每套 3 份 PDF（原卷 / 听力原文 / 两页合订）。`);
if (bad.length) console.log("⚠️ 页数异常：\n  " + bad.join("\n  "));
else console.log("✅ 全部 PDF 页数正确：单页版恰好 1 页、合订版恰好 2 页");
