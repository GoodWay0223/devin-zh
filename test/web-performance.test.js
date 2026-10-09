'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {mountDevinZh} = require('../web/runtime');

// This small DOM double exercises scheduling and observer work, not browser CSS
// conformance or React reconciliation. Real DOM coverage lives in web/fixture.js.
function matches(element, selector) {
  return selector.split(',').some(part => {
    let pattern = part.trim();
    const negated = pattern.match(/:not\(([^)]+)\)$/);
    if (negated) {
      if (matches(element, negated[1])) return false;
      pattern = pattern.slice(0, negated.index);
    }
    if (pattern.startsWith('.')) return (element.getAttribute('class') || '').split(/\s+/).includes(pattern.slice(1));
    const tag = pattern.match(/^[a-z][a-z\d-]*/i);
    if (tag) {
      if (element.tagName !== tag[0].toLowerCase()) return false;
      pattern = pattern.slice(tag[0].length);
    }
    let attributes = 0;
    const remaining = pattern.replace(/\[([^\s\]=*^~]+)(?:(\*=|\^=|~=|=)"([^"]*)")?\]/g, (_, name, operator, expected) => {
      attributes++;
      const actual = element.getAttribute(name);
      if (actual === null || operator === '=' && actual !== expected ||
          operator === '*=' && !actual.includes(expected) ||
          operator === '^=' && !actual.startsWith(expected) ||
          operator === '~=' && !actual.split(/\s+/).includes(expected)) attributes = -1000;
      return '';
    });
    assert.equal(remaining, '', 'DOM double needs support for selector: ' + selector);
    return !!tag && !pattern || attributes > 0;
  });
}

function browser({raf = true} = {}) {
  const timers = new Map(), observers = [], cancelled = [], walks = [];
  let timerId = 0;
  class Node {
    constructor(type) { this.nodeType = type; this.parentElement = null; }
    get isConnected() { return this === body || !!this.parentElement?.isConnected; }
  }
  class Text extends Node {
    constructor(value) { super(3); this.nodeValue = value; }
  }
  class Element extends Node {
    constructor(tag, attrs = {}) { super(1); this.tagName = tag; this.attributes = new Map(Object.entries(attrs)); this.childNodes = []; }
    get children() { return this.childNodes.filter(node => node.nodeType === 1); }
    get childElementCount() { return this.children.length; }
    get textContent() { return this.childNodes.map(node => node.nodeType === 3 ? node.nodeValue : node.textContent).join(''); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    matches(selector) { return matches(this, selector); }
    closest(selector) {
      for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
      return null;
    }
    append(...nodes) { for (const node of nodes) { node.parentElement = this; this.childNodes.push(node); } }
    contains(node) {
      for (let current = node; current; current = current.parentElement) if (current === this) return true;
      return false;
    }
    querySelectorAll(selector) {
      const result = [];
      const visit = parent => { for (const child of parent.childNodes) if (child.nodeType === 1) { if (child.matches(selector)) result.push(child); visit(child); } };
      visit(this); return result;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  const body = new Element('body');
  const schedule = (callback, kind, delay) => { const id = ++timerId; timers.set(id, {callback, kind, delay}); return id; };
  const cancel = (id, kind) => { cancelled.push({id, kind}); timers.delete(id); };
  const win = {
    location: {pathname: '/'}, performance: {now: () => 0},
    NodeFilter: {FILTER_ACCEPT: 1, FILTER_REJECT: 2},
    setTimeout: (fn, delay) => schedule(fn, 'timeout', delay), clearTimeout: id => cancel(id, 'timeout'),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.connected = false; this.disconnects = 0; observers.push(this); }
      observe() { this.connected = true; }
      disconnect() { this.connected = false; this.disconnects++; }
      emit(records) { if (this.connected) this.callback(records); }
    },
    document: {
      body, documentElement: body,
      createTreeWalker(root, _whatToShow, filter) {
        walks.push(root);
        const stack = root.childNodes.slice().reverse();
        return {nextNode() {
          while (stack.length) {
            const node = stack.pop();
            if (filter.acceptNode(node) === 2) continue;
            if (node.childNodes) stack.push(...node.childNodes.slice().reverse());
            return node;
          }
          return null;
        }};
      }
    }
  };
  if (raf) {
    win.requestAnimationFrame = fn => schedule(fn, 'raf');
    win.cancelAnimationFrame = id => cancel(id, 'raf');
  }
  function drain() {
    let runs = 0;
    while (timers.size) {
      assert.ok(++runs < 1000, 'translator work should converge instead of continuously rescheduling');
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      timer.callback(timer.kind === 'raf' ? win.performance.now() : undefined);
    }
    return runs;
  }
  return {win, body, observers, timers, cancelled, walks, drain, element: (tag, attrs) => new Element(tag, attrs), text: value => new Text(value)};
}

function countingRules() {
  const pattern = /^Recognized (\d+)$/;
  const original = pattern.test;
  let tests = 0;
  pattern.test = function(value) { tests++; return original.call(this, value); };
  return {rules: [{pattern, replacement: '已识别 $1'}], count: () => tests};
}

test('protected streaming text, attributes and inserted children do no regex or queued work', () => {
  const page = browser(), counted = countingRules();
  const roots = [
    page.element('div', {'data-testid': 'transcript-agent-message'}),
    page.element('div', {'data-testid': 'transcript-user-message'}),
    page.element('div', {'data-slot': 'sidebar-space'}),
    page.element('div', {'data-testid': 'file-tree'}),
    page.element('div', {'data-testid': 'project-tree'}),
    page.element('a', {href: '/sessions/custom-session-name?tab=browser'}),
    page.element('button', {'data-flash-channel': 'tab:file-one'}),
    page.element('div', {class: 'prose-main'})
  ];
  const scrolling = page.element('div', {'data-testid': 'session-list'});
  scrolling.append(page.element('a', {href: '/sessions/session-two'}));
  roots.push(scrolling);
  const targets = roots.map(root => {
    const button = page.element('button', {title: 'Recognized 12'}), text = page.text('Recognized 10');
    button.append(text); root.append(button); page.body.append(root);
    return {button, text};
  });
  const translator = mountDevinZh(page.win, {}, counted.rules);
  page.drain();
  const before = translator.getStats();
  const records = [];
  for (let i = 0; i < 1000; i++) {
    const {button, text} = targets[i % targets.length];
    const added = page.text('Recognized 99'); button.append(added);
    records.push({type: 'characterData', target: text},
      {type: 'attributes', target: button, attributeName: 'title'},
      {type: 'childList', target: button, addedNodes: [added]});
  }
  page.observers[0].emit(records);
  assert.equal(counted.count(), 0);
  assert.equal(translator.getStats().ruleTests, 0);
  assert.equal(translator.getStats().pending, 0);
  assert.equal(translator.getStats().visitedNodes, before.visitedNodes);
  assert.equal(translator.getStats().ignoredMutations - before.ignoredMutations, records.length);
  assert.equal(page.timers.size, 0);
  for (const {button, text} of targets) {
    assert.equal(text.nodeValue, 'Recognized 10');
    assert.equal(button.getAttribute('title'), 'Recognized 12');
  }
  translator.dispose();
});

test('bursts larger than 200 UI nodes stay local and never requeue a full body scan', () => {
  for (const directBody of [false, true]) {
    const page = browser(), container = directBody ? page.body : page.element('section');
    if (!directBody) page.body.append(container);
    const translator = mountDevinZh(page.win, {'Open settings': '打开设置'}, []);
    page.drain();
    const initialScans = translator.getStats().fullRootScans;
    const buttons = Array.from({length: 350}, () => {
      const button = page.element('button'); button.append(page.text('Open settings')); container.append(button); return button;
    });
    page.observers[0].emit([{type: 'childList', target: container, addedNodes: buttons}]);
    assert.ok(translator.getStats().pending > 0);
    const rounds = page.drain();
    assert.ok(rounds > 1, 'large work batches should yield between scheduling quanta');
    assert.equal(translator.getStats().fullRootScans, initialScans);
    assert.equal(page.walks.filter(root => root === page.body).length, 1);
    assert.equal(translator.getStats().pending, 0);
    assert.equal(translator.getStats().active, false);
    assert.ok(buttons.every(button => button.childNodes[0].nodeValue === '打开设置'));
    translator.dispose();
  }
});

test('mounting twice disconnects the previous observer and cancels its scheduled work', () => {
  const page = browser();
  const first = mountDevinZh(page.win, {}, []);
  const firstScheduled = page.timers.keys().next().value;
  const second = mountDevinZh(page.win, {}, []);
  assert.equal(page.observers.length, 2);
  assert.equal(page.observers[0].connected, false);
  assert.equal(page.observers[0].disconnects, 1);
  assert.equal(page.observers[1].connected, true);
  assert.ok(page.cancelled.some(item => item.id === firstScheduled && item.kind === 'raf'));
  assert.equal(page.timers.size, 1);
  assert.equal(first.getStats().pending, 0);
  const instanceKey = Object.keys(page.win).find(key => page.win[key] === second);
  assert.ok(instanceKey, 'the current instance should be registered under a string window property');
  first.dispose();
  assert.equal(page.win[instanceKey], second);
  second.dispose();
  assert.equal(page.timers.size, 0);
  assert.equal(page.win[instanceKey], undefined);
});

test('mixed sidebar wrappers keep fixed navigation and UI actions without translating user subtrees', () => {
  for (const attributes of [
    {'data-slot': 'sidebar-content-wrapper'},
    {'data-slot': 'sidebar-content'},
    {'data-slot': 'sidebar-content-wrapper', role: 'tree', 'data-session-id': 'active-session'}
  ]) {
    const page = browser(), wrapper = page.element('div', attributes);
    const general = page.element('a', {href: '/org/example/settings/general'}), generalText = page.text('General');
    general.append(generalText);
    const action = page.element('button'), actionText = page.text('Open settings'); action.append(actionText);
    const external = page.element('a', {href: 'https://example.com/private-project'}), externalText = page.text('Project Alpha');
    external.append(externalText);
    const unnamedProject = page.element('button', {title: 'Open settings'}), unnamedProjectText = page.text('Review');
    unnamedProject.append(unnamedProjectText);
    const status = page.element('span'), statusText = page.text('Recognized 10'); status.append(statusText);
    const projectTree = page.element('div', {'data-testid': 'project-tree'}), projectButton = page.element('button');
    const projectText = page.text('Cloud settings'); projectButton.append(projectText); projectTree.append(projectButton);
    wrapper.append(general, action, external, unnamedProject, status, projectTree); page.body.append(wrapper);
    const counted = countingRules();
    const translator = mountDevinZh(page.win, {
      General: '常规', 'Open settings': '打开设置', 'Project Alpha': '不应翻译的项目', 'Cloud settings': '云端设置', Review: '代码审查'
    }, counted.rules);
    page.drain();
    assert.equal(generalText.nodeValue, '常规');
    assert.equal(actionText.nodeValue, '打开设置');
    assert.equal(externalText.nodeValue, 'Project Alpha');
    assert.equal(unnamedProjectText.nodeValue, 'Review');
    assert.equal(unnamedProject.getAttribute('title'), 'Open settings');
    assert.equal(statusText.nodeValue, 'Recognized 10');
    assert.equal(projectText.nodeValue, 'Cloud settings');
    assert.equal(counted.count(), 0, 'unknown sidebar status leaves should be excluded before regex matching');
    const dynamic = page.element('button'), dynamicText = page.text('Open settings'); dynamic.append(dynamicText); wrapper.append(dynamic);
    page.observers[0].emit([{type: 'childList', target: wrapper, addedNodes: [dynamic]}]); page.drain();
    assert.equal(dynamicText.nodeValue, '打开设置');
    translator.dispose();
  }
});

test('translation caching avoids repeated regex scans and evicts older input under sustained variety', () => {
  const page = browser(), counted = countingRules();
  const translator = mountDevinZh(page.win, {}, counted.rules);
  assert.equal(translator.translate('Recognized 12'), '已识别 12');
  assert.equal(translator.translate('  Recognized   12  '), '  已识别 12  ');
  assert.equal(counted.count(), 1);
  assert.equal(translator.translate('Unknown oldest'), 'Unknown oldest');
  const withOldest = counted.count();
  translator.translate('Unknown oldest');
  assert.equal(counted.count(), withOldest, 'negative matches should also be cached');
  for (let i = 0; i < 1100; i++) translator.translate('Unknown label ' + i);
  const beforeRecent = counted.count();
  translator.translate('Unknown label 1099');
  assert.equal(counted.count(), beforeRecent, 'recent input remains cached');
  translator.translate('Unknown oldest');
  assert.equal(counted.count(), beforeRecent + 1, 'bounded cache must evict old inputs');
  const beforeNonEnglish = counted.count();
  translator.translate('纯中文消息'); translator.translate('12345');
  assert.equal(counted.count(), beforeNonEnglish);
  translator.dispose();
});

test('own text and attribute writes are ignored, but an English rerender is translated again', () => {
  const page = browser(), button = page.element('button', {title: 'Open settings'}), text = page.text('Open settings');
  button.append(text); page.body.append(button);
  const translator = mountDevinZh(page.win, {'Open settings': '打开设置'}, []);
  page.drain();
  const before = translator.getStats();
  page.observers[0].emit([{type: 'characterData', target: text}, {type: 'attributes', target: button, attributeName: 'title'}]);
  assert.equal(translator.getStats().pending, 0);
  assert.equal(page.timers.size, 0);
  assert.equal(translator.getStats().ignoredMutations - before.ignoredMutations, 2);
  text.nodeValue = 'Open settings'; button.setAttribute('title', 'Open settings');
  page.observers[0].emit([{type: 'characterData', target: text}, {type: 'attributes', target: button, attributeName: 'title'}]);
  page.drain();
  assert.equal(text.nodeValue, '打开设置');
  assert.equal(button.getAttribute('title'), '打开设置');
  translator.dispose();
});

test('dispose cancels the fallback timer when requestAnimationFrame is unavailable', () => {
  const page = browser({raf: false});
  const translator = mountDevinZh(page.win, {}, []);
  const [scheduled, timer] = page.timers.entries().next().value;
  assert.equal(timer.kind, 'timeout');
  assert.equal(timer.delay, 16);
  translator.dispose();
  assert.deepEqual(page.cancelled, [{id: scheduled, kind: 'timeout'}]);
  assert.equal(page.observers[0].connected, false);
  assert.equal(page.timers.size, 0);
  assert.equal(translator.getStats().pending, 0);
  assert.equal(translator.getStats().active, false);
});
