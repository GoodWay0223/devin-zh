'use strict';

// Serialized into the userscript and exercised in a real DOM by web/fixture.js.
// Only display text/attributes are changed. No HTML replacement or app API calls.
function mountDevinZh(win, dictionary, rules) {
  const doc = win.document;
  const attrs = ['placeholder', 'title', 'aria-label', 'alt', 'data-placeholder'];
  const hardProtected = [
    'script', 'style', 'noscript', 'pre', 'code', 'kbd', 'svg', 'math',
    'canvas', 'iframe', 'object', 'embed', '.xterm', '.monaco-editor', '.cm-editor', '.cm-content', '.ace_editor',
    '[data-devin-zh-ignore]',
    '[class~="prose"]', '[class~="prose-main"]', '[class~="prose-ds"]',
    '[class~="markdown"]', '[class~="markdown-body"]',
    '[data-testid*="message-content"]', '[data-testid*="terminal-output"]',
    '[data-testid*="repository-name"]', '[data-testid*="session-title"]', '[data-user-content]'
  ].join(',');
  const chatProtected = '[data-testid="transcript-user-message"], [data-testid="transcript-agent-message"], [data-message-id]';
  const editable = '[contenteditable]:not([contenteditable="false"]), textarea, input, [role="textbox"]';
  const slateInput = '[data-devin-input-box="true"][data-slate-editor="true"][contenteditable="true"]';
  function fixedInputPlaceholder(element) {
    const placeholder = element.closest('[data-slate-placeholder][contenteditable="false"]');
    return placeholder && placeholder.closest(slateInput);
  }
  function pruneElement(element) {
    return element.matches(hardProtected) || (element.matches('[translate="no"]') && !element.matches(slateInput));
  }
  const own = (key) => Object.prototype.hasOwnProperty.call(dictionary, key);
  const knownUiHref = href => /^\/(?:settings(?:\/|$)|org\/[^/]+\/(?:settings(?:\/|$)|customize(?:[?#]|$)|security(?:[?#]|$)|automations(?:[?#]|$)|wiki(?:[?#]|$))|review(?:[?#]|$))/.test(href || '');
  function knownUiContainer(element) {
    const link = element.closest('a[href]');
    if (link && knownUiHref(link.getAttribute('href'))) return true;
    // Settings renders an overlay link and a sibling visual label in one row.
    // Require a single known UI destination; never infer that all aside text is UI.
    const row = element.closest('[data-slot="sidebar-menu-item"]');
    if (!row) return false;
    const links = row.querySelectorAll('a[href]');
    return links.length === 1 && knownUiHref(links[0].getAttribute('href'));
  }
  const resourceLink = element => {
    const link = element.closest('a[href]');
    return link && /\/(?:sessions\/[a-z\d-]+|review\/.+\/pull\/\d+|org\/[^/]+\/automations\/[a-z\d-]+)(?:[?#]|$)/i.test(link.getAttribute('href'));
  };

  function translate(value) {
    if (typeof value !== 'string' || value.length > 3000) return value;
    const trimmed = value.trim().replace(/\s+/g, ' ');
    if (!trimmed) return value;
    let next = own(trimmed) ? dictionary[trimmed] : undefined;
    if (next === undefined) {
      for (const rule of rules) {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(trimmed)) {
          rule.pattern.lastIndex = 0;
          next = trimmed.replace(rule.pattern, rule.replacement);
          break;
        }
      }
    }
    return typeof next === 'string' && next !== trimmed
      ? value.match(/^\s*/)[0] + next + value.match(/\s*$/)[0] : value;
  }

  function translateText(node) {
    const parent = node.parentElement;
    if (!parent || parent.closest(hardProtected)) return;
    // The real prompt editor opts out of translation. Its proven immutable UI
    // placeholder is the only text exception; draft leaves stay protected.
    const optOut = parent.closest('[translate="no"]');
    if (optOut && !(optOut.matches(slateInput) && fixedInputPlaceholder(parent))) return;
    // Slate's immutable placeholder is UI; the editable draft around it is data.
    const placeholder = parent.closest('[data-slate-placeholder][contenteditable="false"]');
    if (!placeholder && parent.closest(editable)) return;
    if (parent.closest(chatProtected) && !parent.closest('button, [role="button"], [role="toolbar"]')) return;
    // Session names and file-tab titles can equal an ordinary dictionary word.
    if (resourceLink(parent)) return;
    const fileTab = parent.closest('[data-flash-channel^="tab:"]');
    if (fileTab && !['tab:context', 'tab:computer', 'tab:changes', 'tab:code-changes'].includes(fileTab.getAttribute('data-flash-channel'))) return;
    const original = node.nodeValue;
    // Ordinary one-word values outside identified UI containers may be names.
    if (/^[A-Za-z][A-Za-z-]*$/.test(original.trim()) && !knownUiContainer(parent) && !parent.closest('button, nav, header, footer, h1, h2, h3, h4, h5, h6, label, th, [data-slot="sidebar-group-label"], [role="button"], [role="combobox"], [role="menu"], [role="menuitem"], [role="tab"], [role="tablist"], [role="option"], [role="tooltip"], [role="status"], [role="alert"]')) return;
    const next = translate(original);
    if (next !== original) node.nodeValue = next;
  }

  function translateAttributes(element) {
    if (element.closest(hardProtected)) return;
    const optOut = element.closest('[translate="no"]');
    if (optOut && !(optOut === element && element.matches(slateInput))) return;
    // Translate only descriptive UI attributes, never values, URLs, IDs or data.
    if (element.closest(chatProtected) && !element.matches('button, [role="button"]')) return;
    if (resourceLink(element)) {
      // Confirmed PR-card action trigger: its tooltip is UI, not the PR title.
      const label = element.getAttribute('aria-label');
      if (!element.matches('button') || !['More actions', dictionary['More actions']].includes(label)) return;
    }
    if (element.hasAttribute('data-flash-channel') && !['tab:context', 'tab:computer', 'tab:changes', 'tab:code-changes'].includes(element.getAttribute('data-flash-channel'))) return;
    for (const attr of attrs) {
      const before = element.getAttribute(attr);
      const next = translate(before);
      if (next !== before) element.setAttribute(attr, next);
    }
  }

  const pending = new Set();
  let active = null;
  let frame = null;
  let disposed = false;
  const scheduleFrame = () => {
    if (!disposed && frame === null) frame = win.requestAnimationFrame(flush);
  };
  function enqueue(node) {
    if (!node || !node.isConnected || disposed) return;
    // Prevent unbounded queues during long streaming sessions.
    if (pending.size >= 200) { pending.clear(); pending.add(doc.body || doc.documentElement); }
    else pending.add(node);
    scheduleFrame();
  }
  function processNode(node) {
    if (!node.isConnected) return;
    if (node.nodeType === 3) translateText(node);
    else if (node.nodeType === 1) translateAttributes(node);
  }
  function flush() {
    frame = null;
    const start = win.performance.now();
    let count = 0;
    while (count < 300 && win.performance.now() - start < 8) {
      if (!active) {
        const root = pending.values().next().value;
        if (!root) break;
        pending.delete(root);
        if (!root.isConnected) continue;
        if (root.nodeType === 3) { processNode(root); count++; continue; }
        if (root.nodeType !== 1 && root.nodeType !== 11) continue;
        if (root.nodeType === 1 && (root.closest(hardProtected) || pruneElement(root))) continue;
        // Remove overlapping queued descendants before traversing this subtree.
        for (const child of pending) if (root.contains(child)) pending.delete(child);
        active = doc.createTreeWalker(root, 1 | 4, {
          acceptNode(node) {
            return node.nodeType === 1 && pruneElement(node)
              ? win.NodeFilter.FILTER_REJECT : win.NodeFilter.FILTER_ACCEPT;
          }
        });
        processNode(root);
        count++;
      }
      const node = active.nextNode();
      if (node) { processNode(node); count++; } else active = null;
    }
    if (active || pending.size) scheduleFrame();
  }

  const observer = new win.MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) enqueue(node);
      } else if (mutation.type === 'characterData') {
        const value = mutation.target.nodeValue;
        // Ignore the observer's own text writes after translation has settled.
        if (translate(value) !== value) enqueue(mutation.target);
      } else if (mutation.type === 'attributes') {
        const value = mutation.target.getAttribute(mutation.attributeName);
        if (translate(value) !== value) enqueue(mutation.target);
      }
    }
  });
  observer.observe(doc.body || doc.documentElement, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: attrs
  });
  enqueue(doc.body || doc.documentElement);
  return {
    translate,
    dispose() {
      disposed = true;
      observer.disconnect();
      if (frame !== null) win.cancelAnimationFrame(frame);
      pending.clear(); active = null; frame = null;
    }
  };
}

module.exports = { mountDevinZh };
