'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { mountDevinZh } = require('./runtime');
const ROOT = path.resolve(__dirname, '..');
const VERSION = '1.0.12';
const UPSTREAM_SHA = '6e050815196d41a7b0f77db7c95b3fb8748490331763a1e14b3b648dc280bbe2';
function loadWebData() {
  const source = fs.readFileSync(path.join(ROOT, 'data/web-dictionary.js'), 'utf8');
  const data = vm.runInNewContext(source + '\n;({DICTIONARY, REGEX_RULES})', Object.create(null), {timeout: 1000});
  const display = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/display.zh.json'), 'utf8'));
  const reviewed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/web-reviewed.zh.json'), 'utf8'));
  const shortcuts = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/web-shortcuts.zh.json'), 'utf8'));
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/web-settings.zh.json'), 'utf8'));
  const models = require('../src/model-translations');
  const dictionary = Object.assign(Object.create(null), data.DICTIONARY, display.nav, display.menu, shortcuts, reviewed, settings, models.descriptions, models.names);
  for (const [key, value] of Object.entries(dictionary)) {
    if (typeof value !== 'string' || !key.trim()) throw new Error('Invalid translation: ' + key);
  }
  const regex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/web-regex.zh.json'), 'utf8'));
  const reviewedRules = regex.map(rule => {
    if (!rule.pattern.startsWith('^') || !rule.pattern.endsWith('$') || /[^iu]/.test(rule.flags || '') || typeof rule.replacement !== 'string') throw new Error('Unsafe reviewed regex');
    return {pattern: new RegExp(rule.pattern, rule.flags), replacement: rule.replacement};
  });
  return { dictionary, rules: [...models.rules, ...reviewedRules, ...data.REGEX_RULES], reviewedCount: Object.keys(reviewed).length + Object.keys(shortcuts).length + Object.keys(settings).length + Object.keys(models.descriptions).length,
    baseEntries: Object.keys(data.DICTIONARY).length,
    newEntries: Object.keys(dictionary).filter(key=>!Object.hasOwn(data.DICTIONARY,key)).length,
    updatedTranslations: Object.keys(dictionary).filter(key=>Object.hasOwn(data.DICTIONARY,key)&&data.DICTIONARY[key]!==dictionary[key]).length };
}
function serializeRules(rules) {
  return '[' + rules.map(rule => `{pattern:${rule.pattern.toString()},replacement:${JSON.stringify(rule.replacement)}}`).join(',\n') + ']';
}
function buildUserscript() {
  const backup = fs.readFileSync(path.join(__dirname, 'upstream/Devin-Web-Chinese-1.0.7.user.js'));
  if (crypto.createHash('sha256').update(backup).digest('hex') !== UPSTREAM_SHA) throw new Error('Upstream backup changed');
  const { dictionary, rules, reviewedCount, baseEntries, newEntries, updatedTranslations } = loadWebData();
  const header = `// ==UserScript==
// @name         Devin 网页端汉化
// @namespace    https://github.com/KawaYiLab/Devin-Web-Chinese
// @version      ${VERSION}
// @description  Devin 简体中文本地维护版：保护整个会话区域、低开销动态汉化、模型名保持英文
// @author       KawaYiLab; GoodWay0223/devin-zh
// @match        https://app.devin.ai/*
// @match        https://app.beta.devin.ai/*
// @grant        none
// @run-at       document-idle
// @license      MIT
// @homepageURL  https://github.com/GoodWay0223/devin-zh
// @supportURL   https://github.com/GoodWay0223/devin-zh/issues
// @downloadURL  none
// @updateURL    none
// ==/UserScript==
// Based on the user's exported KawaYiLab Devin-Web-Chinese 1.0.7 (MIT).
// Copyright (c) 2026 KawaYiLab; modifications Copyright (c) 2026 GoodWay0223.
// MIT license: https://github.com/GoodWay0223/devin-zh/blob/master/LICENSE
// Maintain data/ and web/runtime.js in the source repository; rebuild generated output.
`;
  const license = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8')
    .replace('Copyright (c) 2026 GoodWay0223', 'Copyright (c) 2026 GoodWay0223\nCopyright (c) 2026 KawaYiLab');
  let source = header + '\n/*\n' + license + '*/\n\n(function () {\n"use strict";\n' +
    'if (location.protocol !== "https:" || !["app.devin.ai", "app.beta.devin.ai"].includes(location.hostname)) return;\n' +
    mountDevinZh.toString() + '\nconst dictionary = ' + JSON.stringify(dictionary, null, 1) + ';\n' +
    'const rules = ' + serializeRules(rules) + ';\n' +
    'function start() { mountDevinZh(window, dictionary, rules); }\n' +
    'if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once:true}); else start();\n})();\n';
  source = source.replace(/\r\n?/g, '\n'); // Same artifact on Windows and CI; preserve upstream bytes separately.
  new vm.Script(source); // Generated script must parse before it is delivered.
  return { source, version: VERSION, entries: Object.keys(dictionary).length, rules: rules.length, reviewedCount, baseEntries, newEntries, updatedTranslations, upstreamSha256: UPSTREAM_SHA };
}
function writeBuild(directory = path.join(__dirname, 'dist')) {
  const built = buildUserscript();
  fs.mkdirSync(directory, {recursive: true});
  fs.writeFileSync(path.join(directory, 'Devin-Web-Zh.user.js'), built.source, 'utf8');
  const {source, ...report} = built;
  report.sha256 = crypto.createHash('sha256').update(source).digest('hex');
  fs.writeFileSync(path.join(directory, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
if (require.main === module) console.log(JSON.stringify(writeBuild(process.argv[2]), null, 2));
module.exports = { loadWebData, buildUserscript, writeBuild, serializeRules };
