// 机器翻译 (Google gtx 非官方接口), 仅用于生成"草稿", 带占位符保护与校验
const { execFile } = require('child_process');

const PROTECT = [
  'Devin', 'Windsurf', 'Cascade', 'Codeium', 'ACUs', 'ACU', 'MCP', 'API', 'SSH', 'GitHub', 'GitLab', 'Bitbucket', 'Slack', 'Linear', 'Jira',
  'Azure DevOps', 'Notion', 'Sentry', 'Datadog', 'Vercel', 'Confluence', 'Teams', 'SAML', 'SSO', 'SCIM',
  'OAuth', 'JSON', 'YAML', 'HTML', 'CSS', 'URL', 'URLs', 'IDE', 'CLI', 'VS Code', 'Git', 'PRs', 'PR', 'AI', 'LLM', 'SWE-1.5', 'SWE-1.6', 'Claude',
  'GPT', 'Gemini', 'Docker', 'Kubernetes', 'AWS', 'GCP', 'Terraform', 'Okta', 'Entra', 'Zapier', 'Figma', 'Stripe', 'DeepWiki', 'Devin Review',
  'Ask Devin', 'Fast Mode', 'Windsurf Tab', 'Tab', 'Hooks', 'Webhook', 'Webhooks', 'Token', 'Tokens', 'Markdown', 'README', 'ID', 'IDs', 'UUID',
].sort((a, b) => b.length - a.length);

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PROT_RE = new RegExp('\\b(?:' + PROTECT.map(escRe).join('|') + ')\\b', 'g');
// 需要原样保留的片段: {{x}} {x} <0> </0> <b> <br/> %s %d ${x} `code` URL、以及 \n
const KEEP_RE = /\{\{[^}]*\}\}|\{[^{}]*\}|<\/?[A-Za-z0-9]+(?:\s[^<>]*)?\/?>|%[sdif]|\$\{[^}]*\}|`[^`]*`|https?:\/\/\S+/g;

const GLOSS = (() => {
  const g = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data', 'glossary.json'), 'utf8'));
  delete g['_说明'];
  const keys = Object.keys(g).sort((a, b) => b.length - a.length);
  return { g, re: new RegExp('\\b(?:' + keys.map(escRe).join('|') + ')\\b', 'g') };
})();

function shield(text) {
  const slots = [];
  const put = m => { slots.push(m); return '[' + (slots.length - 1) + ']'; };
  let t = text.replace(KEEP_RE, put).replace(PROT_RE, put).replace(GLOSS.re, m => put(GLOSS.g[m]));
  return { t, slots };
}
// 没有需要机翻的英文了 (只剩占位符/术语): 直接还原, 与原文相同则无需翻译
const hasWords = t => /[A-Za-z]{2}/.test(t.replace(/\[\d+\]/g, ''));
function direct(text, s) { const r = unshield(s.t, s.slots).zh; return r === text ? null : r; }
function unshield(zh, slots) {
  let ok = true;
  const out = zh.replace(/[\[【［]\s*(\d+)\s*[\]】］]/g, (m, i) => (slots[i] === undefined ? ((ok = false), m) : '\u0000' + i + '\u0000'));
  const used = new Set();
  let res = out.replace(/\u0000(\d+)\u0000/g, (m, i) => (used.add(+i), slots[i]));
  res = res.replace(/([\u4e00-\u9fff])[ ]+(?=[\u4e00-\u9fff])/g, '$1').replace(/[ ]+([，。！？；：、）])/g, '$1').replace(/([（])[ ]+/g, '$1');
  if (used.size !== slots.length) ok = false;
  return { zh: res, ok };
}

const parse = s => [].concat(JSON.parse(s)).join('\n');

// 用 curl 而不是 node https: 后者的 TLS 指纹会被该接口直接 429
const get = q => new Promise((res, rej) => {
  const u = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=zh-CN&q=' + encodeURIComponent(q);
  execFile('curl', ['-s', '-m', '15', '-w', '\n%{http_code}', u], { maxBuffer: 1 << 24 }, (err, out) => {
    if (err) return rej(err);
    const i = out.lastIndexOf('\n'), code = out.slice(i + 1);
    if (code !== '200') return rej(new Error('HTTP ' + code));
    try { res(parse(out.slice(0, i))); } catch (e) { rej(e); }
  });
});

async function translate(text, tries = 4) {
  const s = shield(text), { t, slots } = s;
  if (!hasWords(t)) return direct(text, s);
  for (let i = 0; i < tries; i++) {
    try {
      const raw = await get(t);
      const { zh, ok } = unshield(raw, slots);
      return ok ? zh : null;
    } catch (e) { await new Promise(r => setTimeout(r, 800 * (i + 1))); }
  }
  return null;
}

const post = q => new Promise((res, rej) => {
  execFile('curl', ['-s', '-m', '30', '-w', '\n%{http_code}', '--data-urlencode', 'q@-',
    'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=zh-CN'], { maxBuffer: 1 << 25 }, (err, out) => {
    if (err) return rej(err);
    const i = out.lastIndexOf('\n'), code = out.slice(i + 1);
    if (code !== '200') return rej(new Error('HTTP ' + code));
    try { res(parse(out.slice(0, i))); } catch (e) { rej(e); }
  }).stdin.end(q);
});

// 批量: 每条用换行分隔一次请求翻译; 行数对不上则回退逐条
async function translateBatch(texts) {
  const sh = texts.map(shield);
  const idx = sh.map((s, i) => (hasWords(s.t) && !/\n/.test(s.t) ? i : -1)).filter(i => i >= 0);
  const res = sh.map((s, i) => (hasWords(s.t) ? null : direct(texts[i], s)));
  if (!idx.length) return res;
  let lines = null;
  for (let k = 0; k < 8 && !lines; k++) {
    try { const raw = await post(idx.map(i => sh[i].t).join('\n')); const l = raw.replace(/\n$/, '').split('\n'); if (l.length === idx.length) lines = l; else break; }
    catch (e) { const wait = /429/.test(e.message) ? 60000 * (k + 1) : 2000 * (k + 1); console.log('  限流/错误, 等待', wait / 1000, 's', e.message); await new Promise(r => setTimeout(r, wait)); }
  }
  await new Promise(r => setTimeout(r, +process.env.GAP || 3000));
  if (!lines) { for (const i of idx) res[i] = await translate(texts[i]); return res; }
  idx.forEach((i, j) => { const { zh, ok } = unshield(lines[j].trim(), sh[i].slots); res[i] = ok ? zh : null; });
  return res;
}

module.exports = { translate, translateBatch, shield, unshield };
if (require.main === module) {
  (async () => {
    for (const s of process.argv.slice(2)) console.log(s, '=>', await translate(s));
  })();
}
