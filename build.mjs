// CET4 offline package builder (v2: rate-limit / challenge resilient)
import { mkdir, writeFile, readFile } from "fs/promises";
import { existsSync, statSync } from "fs";
import path from "path";
import { esc, paperHTML } from "./render.mjs";

const BASE = "https://admin.examcrafts.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const USER = "jim666";
const PASS = "chen2008";
const OUT = "C:/Users/Jim/WorkBuddy/2026-11-03-21-42-19/cet4_offline";
const PAPERS = path.join(OUT, "papers");

let TOKEN = null;
let LOGIN_TS = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rawReq(method, urlPath, { auth = true, data, params, binary = false } = {}) {
  let url = BASE + urlPath;
  if (params) url += "?" + new URLSearchParams(params).toString();
  const headers = { "User-Agent": UA, "Accept": "application/json, text/plain, */*" };
  if (data) headers["Content-Type"] = "application/json";
  if (auth && TOKEN) headers["Authorization"] = "Bearer " + TOKEN;
  const opts = { method, headers };
  if (data) opts.body = JSON.stringify(data);
  const r = await fetch(url, opts);
  if (binary) { const buf = Buffer.from(await r.arrayBuffer()); return { status: r.status, ok: r.ok, buf, headers: r.headers }; }
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, ok: r.ok, json, text };
}

async function login() {
  const { json } = await rawReq("POST", "/api/auth/login/", { auth: false, data: { username: USER, password: PASS } });
  TOKEN = json.access;
  LOGIN_TS = Date.now();
}

// Auth API GET with challenge detection + exponential backoff retry
async function apiGet(path, params, attempt = 0) {
  if (!TOKEN || Date.now() - LOGIN_TS > 50 * 60 * 1000) await login();
  const res = await rawReq("GET", path, { params });
  // challenge / block => json is a string (HTML) or missing expected shape
  if (res.status === 401) { await login(); return apiGet(path, params, attempt); }
  const blocked = res.status !== 200 || typeof res.json === "string" || (res.json && res.json.encrypted === undefined && res.json.payload === undefined && res.json.results === undefined && res.json.key === undefined && res.json.access === undefined);
  if (blocked) {
    if (attempt >= 5) throw new Error(`blocked after retries: ${res.status} ${String(res.text).slice(0, 80)}`);
    const wait = 1500 * Math.pow(2, attempt) + Math.random() * 800;
    console.log(`  [retry ${attempt + 1}] ${path} blocked (${res.status}); wait ${Math.round(wait)}ms`);
    await sleep(wait);
    return apiGet(path, params, attempt + 1);
  }
  return res.json;
}

// decryption
function hexToBytes(hex) { const a = new Uint8Array(hex.length / 2); for (let i = 0; i < hex.length; i += 2) a[i / 2] = parseInt(hex.substr(i, 2), 16); return a; }
const b64u = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
async function decryptPayload(payload, iv, keyHex) {
  const key = await crypto.subtle.importKey("raw", hexToBytes(keyHex), { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64u(iv) }, key, b64u(payload));
  return JSON.parse(new TextDecoder().decode(plain));
}
function rename(t, n = {}) {
  if (typeof t !== "object" || t === null) return t;
  if (Array.isArray(t)) return t.map((x) => rename(x, n));
  let o = null;
  for (const k of Object.keys(t)) if (k.startsWith("_") && k.endsWith("_meta")) { o = k.substring(1, 4); break; }
  if (!o) return t;
  const i = { audio_content: "listening", text_content: "reading", composition: "writing", convert: "translation", meta_info: "exam_details", dictation: "dictation", grammar: "grammar_vocabulary", cloze: "cloze", knowledge_items: "knowledge_points", connections: "relations", ...n };
  const a = {};
  for (const [s, c] of Object.entries(t)) {
    if (s === `_${o}_meta` || s.startsWith(`${o}_data_`) || s.startsWith(`${o}_noise_`)) continue;
    const k2 = s.startsWith(`${o}_`) ? s.substring(o.length + 1) : s;
    a[i[k2] ?? k2] = rename(c, n);
  }
  return a;
}
async function getContent(cardId) {
  const enc = await apiGet(`/api/exams/cet/cet-content/${cardId}/`, { mode: "exam", encrypt: "true" });
  const key = await apiGet(`/api/exams/decrypt-key-v2/${enc.key_id}/`);
  return rename(await decryptPayload(enc.payload, enc.iv, key.key));
}

async function downloadFile(url, dest, { retries = 4 } = {}) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await rawReq("GET", url.replace(BASE, ""), { auth: false, binary: true });
      if (!res.ok && res.status !== 206) throw new Error("HTTP " + res.status);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, res.buf);
      if (res.buf.length < 2000) throw new Error("too small " + res.buf.length);
      return res.buf.length;
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(700);
    }
  }
}

function slug(card) { return `${card.year}-${String(card.month).padStart(2, "0")}-${card.version}`; }
function renderMasterIndex(cards, done) {
  const rows = cards.map((c) => {
    const s = done[c.id];
    const link = s ? `papers/${s.folder}/index.html` : "#";
    const audio = s ? `${s.audio} 段音频` : "—";
    const status = s ? "✅" : "⏳";
    return `<tr><td>${status}</td><td><a href="${link}">${esc(c.title)}</a></td><td>${esc(c.year)}</td><td>${esc(c.month)}</td><td>${esc(c.version)}</td><td>${audio}</td></tr>`;
  }).join("");
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>CET4 离线真题包 - 总目录</title>
  <style>body{font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;max-width:900px;margin:0 auto;padding:24px;color:#1f2937}
  h1{color:#1e3a8a}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}th,td{border:1px solid #e5e7eb;padding:8px 10px;text-align:left}th{background:#eff6ff}
  a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}.note{background:#fffbeb;padding:10px 14px;border-left:4px solid #f59e0b;border-radius:4px;font-size:13px}</style></head>
  <body><h1>英语四级 (CET4) 离线真题包</h1>
  <p class="meta">共 ${cards.length} 套真题，已离线保存 ${Object.keys(done).length} 套（含听力音频）。点击进入试卷页，音频为本地文件，无需联网。</p>
  <div class="note">说明：本包含真题试卷与听力音频；标准答案/解析需登录原站查看（评分接口未包含在离线包中）。</div>
  <h2>试卷列表</h2><table><thead><tr><th></th><th>试卷</th><th>年份</th><th>月份</th><th>套次</th><th>音频</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

const CONCURRENCY = 2;
const REQ_GAP = 450; // ms between content requests
async function run() {
  await mkdir(PAPERS, { recursive: true });
  await login();
  const lst = await apiGet("/api/exams/exam-cards/", { subject: "CET4", page_size: "1000" });
  const cards = lst.results || [];
  console.log(`[list] CET4 papers: ${cards.length}`);

  const done = {};
  let idx = 0;
  const worker = async () => {
    while (idx < cards.length) {
      const card = cards[idx++];
      const s = slug(card);
      const folder = `${card.id}_${s}`;
      const dir = path.join(PAPERS, folder);
      try {
        // skip already-complete papers
        const idxHtml = path.join(dir, "index.html");
        const dataPath = path.join(dir, "data.json");
        if (existsSync(idxHtml) && existsSync(dataPath)) {
          try {
            const prev = JSON.parse(await readFile(dataPath, "utf8"));
            const aus = Object.keys(prev.audio_urls || {});
            const okAudio = aus.length && aus.every((sec) => {
              const p = path.join(dir, "audio", sec.replace(/\s/g, "") + ".mp3");
              if (!existsSync(p)) return false;
              try { return (statSync(p).size || 0) > 100 * 1024; } catch { return false; }
            });
            if (okAudio) {
              done[card.id] = { folder, audio: aus.length };
              console.log(`[skip] ${card.title} (already complete)`);
              continue;
            }
          } catch {}
        }
        await sleep(REQ_GAP);
        const d = await getContent(card.id);
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, "data.json"), JSON.stringify(d, null, 2));
        let audioN = 0;
        for (const [sec, url] of Object.entries(d.audio_urls || {})) {
          const fname = sec.replace(/\s/g, "") + ".mp3";
          const dest = path.join(dir, "audio", fname);
          if (existsSync(dest)) { const ex = await readFile(dest); if (ex.length > 2000) { audioN++; continue; } }
          const sz = await downloadFile(url, dest, {});
          if (sz > 2000) audioN++;
          await sleep(120);
        }
        await writeFile(path.join(dir, "index.html"), paperHTML(d, card.title));
        done[card.id] = { folder, audio: audioN };
        console.log(`[${Object.keys(done).length}/${cards.length}] ${card.title} -> ${audioN} audio`);
      } catch (e) {
        console.error(`[FAIL] ${card.title}: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await writeFile(path.join(OUT, "index.html"), renderMasterIndex(cards, done));
  console.log("DONE. Master index written. Completed:", Object.keys(done).length + "/" + cards.length);
}
run().catch((e) => { console.error("FATAL", e); process.exit(1); });
