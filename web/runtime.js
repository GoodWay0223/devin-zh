'use strict';

// Serialized into the userscript and exercised in a real DOM by web/fixture.js.
// Only display text/attributes are changed. No HTML replacement or app API calls.
function mountDevinZh(win, dictionary, rules) {
  const doc = win.document;
  const instanceKey = '__devinZhDomTranslator';
  const previous = win[instanceKey];
  if (previous && typeof previous.dispose === 'function') previous.dispose();
  const attrs = ['placeholder', 'title', 'aria-label', 'alt', 'data-placeholder'];
  const hardProtected = [
    'script', 'style', 'noscript', 'pre', 'code', 'kbd', 'svg', 'math',
    'canvas', 'iframe', 'object', 'embed', '.xterm', '.monaco-editor', '.cm-editor', '.cm-content', '.ace_editor',
    '[data-devin-zh-ignore]',
    '[class~="prose"]', '[class~="prose-main"]', '[class~="prose-ds"]',
    '[class~="markdown"]', '[class~="markdown-body"]',
    '[data-testid*="message-content"]', '[data-testid*="terminal-output"]',
    '[data-testid*="repository-name"]', '[data-testid*="session-title"]', '[data-user-content]',
    '[data-testid="transcript-user-message"]', '[data-testid="transcript-agent-message"]', '[data-message-id]',
    '[data-slot="sidebar-space"]', '[data-testid="file-tree"]', '[data-testid="project-tree"]',
    '[data-testid="session-list"]', '[data-testid="sessions-list"]',
    '[data-testid*="project-name"]', '[data-testid*="folder-name"]'
  ].join(',');
  const sidebarContent = '[data-slot="sidebar-content"], [data-slot="sidebar-content-wrapper"]';
  const textWrites = new WeakMap(), attributeWrites = new WeakMap();
  const cache = new Map();
  const stats = { visitedNodes: 0, ruleTests: 0, ignoredMutations: 0, flushes: 0, longestFlushMs: 0, fullRootScans: 0, highWater: 0 };
  const editable = '[contenteditable]:not([contenteditable="false"]), textarea, input, [role="textbox"]';
  const slateInput = '[data-devin-input-box="true"][data-slate-editor="true"][contenteditable="true"]';
  function fixedInputPlaceholder(element) {
    const placeholder = element.closest('[data-slate-placeholder][contenteditable="false"]');
    return placeholder && placeholder.closest(slateInput);
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
    return link && /\/(?:sessions\/[^/?#]+|review\/.+\/pull\/\d+|org\/[^/]+\/automations\/[^/?#]+)(?:[/?#]|$)/i.test(link.getAttribute('href'));
  };

  const fixedSidebarActions = new Set(['New session', 'New Session', 'Search', 'Search sessions', 'Search your sessions',
    'Open settings', 'Settings', 'Customize', 'Show sidebar', 'Hide sidebar', 'Toggle sidebar',
    'Expand sidebar', 'Collapse sidebar', 'Add space', 'Add folder', 'New folder', 'New project',
    'Filter', 'Filters', 'Properties', 'Help', 'Save', 'Cancel', 'Done', 'Apply']);
  const fixedSidebarGroups = new Set(['Sessions', 'Recent', 'Personal', 'Organization']);
  const fixedActionLabels = new Set(Array.from(fixedSidebarActions).flatMap(en => [en, dictionary[en]]).filter(Boolean));
  const fixedGroupLabels = new Set(Array.from(fixedSidebarGroups).flatMap(en => [en, dictionary[en]]).filter(Boolean));
  function userSidebarLeaf(element) {
    const content = element.closest(sidebarContent);
    if (!content) return false;
    // These are shared layout containers, not proof that their entire subtree
    // is user content. Keep walking them; classify only individual rows/leaves.
    if (element.matches(sidebarContent) || knownUiContainer(element)) return false;
    // Unknown sidebar links can be user projects; leave the individual link
    // unchanged without rejecting its surrounding layout or fixed navigation.
    if (element.closest('a[href]')) return true;
    const row = element.closest('[data-slot="sidebar-menu-item"], [data-slot="sidebar-menu-button"], [data-slot="sidebar-label-row"]');
    if (row && Array.from(row.querySelectorAll('a[href]')).some(link =>
      /\/sessions\/[^/?#]+(?:[/?#]|$)/i.test(link.getAttribute('href')))) return true;
    const button = element.closest('button, [role="button"]');
    if (button) {
      const label = (button.getAttribute('aria-label') || button.textContent || '').trim();
      const groupLabel = button.querySelector('[data-slot="sidebar-group-label"]');
      if (groupLabel && fixedGroupLabels.has((groupLabel.textContent || '').trim())) return false;
      return !fixedActionLabels.has(label);
    }
    if (!element.children.length) {
      const label = (element.textContent || '').trim();
      if (!label || fixedActionLabels.has(label) || fixedGroupLabels.has(label)) return false;
      // A shared settings pane can contain ordinary descriptions as well.
      // Exclude a specific unknown user row or session metadata, not every leaf.
      if (row || /^(?:Working(?:\s+.*)?|\d+\s+(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago|\d+[smhd]\s+ago)$/i.test(label)) return true;
      return !element.matches('p, h1, h2, h3, h4, h5, h6, label');
    }
    return false;
  }
  function blockedElement(element) {
    if (!element || element.closest(hardProtected) || userSidebarLeaf(element)) return true;
    const optOut = element.closest('[translate="no"]');
    if (optOut && !(optOut.matches(slateInput) && (optOut === element || fixedInputPlaceholder(element)))) return true;
    const sessionLink = element.closest('a[href]');
    if (sessionLink && /\/(?:sessions\/[^/?#]+|org\/[^/]+\/automations\/[^/?#]+)(?:[/?#]|$)/i.test(sessionLink.getAttribute('href'))) return true;
    const fileTab = element.closest('[data-flash-channel^="tab:"]');
    return !!fileTab && !['tab:context', 'tab:computer', 'tab:changes', 'tab:code-changes'].includes(fileTab.getAttribute('data-flash-channel'));
  }
  function eligible(node) {
    const element = node.nodeType === 1 ? node : node.parentElement;
    if (node.nodeType === 3 && element?.closest(editable) && !element.closest('[data-slate-placeholder][contenteditable="false"]')) return false;
    return !!element && !blockedElement(element);
  }
  function pruneElement(element) {
    if (element.matches(hardProtected) || userSidebarLeaf(element)) return true;
    if (element.matches('[translate="no"]') && !element.matches(slateInput)) return true;
    // Keep the real Slate placeholder exception; never enter ordinary editors.
    if (element.matches('[contenteditable]:not([contenteditable="false"]), [role="textbox"]') &&
      !element.matches('input, textarea') && !element.matches(slateInput) &&
      !element.querySelector('[data-slate-placeholder][contenteditable="false"]')) return true;
    const link = element.matches('a[href]') && element.getAttribute('href');
    return !!link && /\/(?:sessions\/[^/?#]+|org\/[^/]+\/automations\/[^/?#]+)(?:[/?#]|$)/i.test(link);
  }

  function translate(value) {
    if (typeof value !== 'string' || value.length > 3000) return value;
    const trimmed = value.trim().replace(/\s+/g, ' ');
    if (!trimmed) return value;
    if (cache.has(trimmed)) {
      const next = cache.get(trimmed);
      return next === trimmed ? value : value.match(/^\s*/)[0] + next + value.match(/\s*$/)[0];
    }
    let next = own(trimmed) ? dictionary[trimmed] : undefined;
    if (next === undefined) {
      // Chinese translations and non-language values need no English regex scan.
      if (!/[A-Za-z]/.test(trimmed)) return value;
      for (const rule of rules) {
        stats.ruleTests++;
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(trimmed)) {
          rule.pattern.lastIndex = 0;
          next = trimmed.replace(rule.pattern, rule.replacement);
          break;
        }
      }
    }
    if (cache.size >= 1024) cache.delete(cache.keys().next().value);
    cache.set(trimmed, typeof next === 'string' ? next : trimmed);
    return typeof next === 'string' && next !== trimmed
      ? value.match(/^\s*/)[0] + next + value.match(/\s*$/)[0] : value;
  }

  function translateText(node) {
    const parent = node.parentElement;
    if (!parent || blockedElement(parent)) return;
    // The real prompt editor opts out of translation. Its proven immutable UI
    // placeholder is the only text exception; draft leaves stay protected.
    const optOut = parent.closest('[translate="no"]');
    if (optOut && !(optOut.matches(slateInput) && fixedInputPlaceholder(parent))) return;
    // Slate's immutable placeholder is UI; the editable draft around it is data.
    const placeholder = parent.closest('[data-slate-placeholder][contenteditable="false"]');
    if (!placeholder && parent.closest(editable)) return;
    // Session names and file-tab titles can equal an ordinary dictionary word.
    if (resourceLink(parent)) return;
    const fileTab = parent.closest('[data-flash-channel^="tab:"]');
    if (fileTab && !['tab:context', 'tab:computer', 'tab:changes', 'tab:code-changes'].includes(fileTab.getAttribute('data-flash-channel'))) return;
    const original = node.nodeValue;
    // Ordinary one-word values outside identified UI containers may be names.
    if (/^[A-Za-z][A-Za-z-]*$/.test(original.trim()) && !knownUiContainer(parent) && !parent.closest('button, nav, header, footer, h1, h2, h3, h4, h5, h6, label, th, [data-slot="sidebar-group-label"], [role="button"], [role="combobox"], [role="menu"], [role="menuitem"], [role="tab"], [role="tablist"], [role="option"], [role="tooltip"], [role="status"], [role="alert"]')) return;
    const next = translate(original);
    if (next !== original) { textWrites.set(node, next); node.nodeValue = next; }
  }

  function translateAttributes(element) {
    if (blockedElement(element)) return;
    const optOut = element.closest('[translate="no"]');
    if (optOut && !(optOut === element && element.matches(slateInput))) return;
    // Translate only descriptive UI attributes, never values, URLs, IDs or data.
    if (resourceLink(element)) {
      // Confirmed PR-card action trigger: its tooltip is UI, not the PR title.
      const label = element.getAttribute('aria-label');
      if (!element.matches('button') || !['More actions', dictionary['More actions']].includes(label)) return;
    }
    if (element.hasAttribute('data-flash-channel') && !['tab:context', 'tab:computer', 'tab:changes', 'tab:code-changes'].includes(element.getAttribute('data-flash-channel'))) return;
    for (const attr of attrs) {
      if (!element.hasAttribute(attr)) continue;
      const before = element.getAttribute(attr);
      const next = translate(before);
      if (next !== before) {
        let written = attributeWrites.get(element);
        if (!written) attributeWrites.set(element, written = new Map());
        written.set(attr, next); element.setAttribute(attr, next);
      }
    }
  }

  const pending = new Set(), pendingAttributes = new Set();
  let active = null;
  let scheduled = null;
  let animationScheduled = false;
  let disposed = false;
  const scheduleFrame = () => {
    if (disposed || scheduled !== null) return;
    animationScheduled = typeof win.requestAnimationFrame === 'function';
    scheduled = animationScheduled ? win.requestAnimationFrame(flush) : win.setTimeout(flush, 16);
  };
  function enqueue(node) {
    if (!node || !node.isConnected || disposed || !eligible(node)) return;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) if (pending.has(parent)) return;
    // An ancestor can arrive after its children in one MutationObserver batch.
    // Keep only one traversal for that subtree regardless of arrival order.
    if (node.nodeType === 1) for (const child of pending) if (node.contains(child)) pending.delete(child);
    if (pending.size >= 200 && node.parentElement && node.parentElement !== doc.body && node.parentElement !== doc.documentElement && eligible(node.parentElement)) {
      // Merge a burst in one UI subtree. Never escalate it to the whole page.
      const parent = node.parentElement;
      for (const child of pending) if (parent.contains(child)) pending.delete(child);
      pending.add(parent);
    } else pending.add(node);
    stats.highWater = Math.max(stats.highWater, pending.size);
    scheduleFrame();
  }
  function enqueueAttributes(element) {
    if (!element?.isConnected || disposed || !eligible(element)) return;
    pendingAttributes.add(element);
    stats.highWater = Math.max(stats.highWater, pending.size + pendingAttributes.size);
    scheduleFrame();
  }
  function processNode(node) {
    if (!node.isConnected) return;
    stats.visitedNodes++;
    if (node.nodeType === 3) translateText(node);
    else if (node.nodeType === 1) translateAttributes(node);
  }
  function flush() {
    scheduled = null;
    if (disposed) return;
    const start = win.performance.now();
    stats.flushes++;
    let count = 0;
    while (count < 128 && win.performance.now() - start < 3) {
      if (pendingAttributes.size && (count % 2 === 1 || (!active && !pending.size))) {
        const element = pendingAttributes.values().next().value;
        pendingAttributes.delete(element);
        if (element.isConnected) { stats.visitedNodes++; translateAttributes(element); }
        count++;
        continue;
      }
      if (!active) {
        const root = pending.values().next().value;
        if (!root) break;
        pending.delete(root);
        if (!root.isConnected) continue;
        if (root.nodeType === 3) { processNode(root); count++; continue; }
        if (root.nodeType !== 1 && root.nodeType !== 11) continue;
        if (root.nodeType === 1 && (!eligible(root) || pruneElement(root))) continue;
        if (root === doc.body || root === doc.documentElement) stats.fullRootScans++;
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
    stats.longestFlushMs = Math.max(stats.longestFlushMs, win.performance.now() - start);
    if (active || pending.size || pendingAttributes.size) scheduleFrame();
  }

  const observer = new win.MutationObserver(mutations => {
    // A virtualized list can insert and detach many rows before the next frame.
    // Do not retain their work until a background tab gets animation frames again.
    if (mutations.some(mutation => mutation.type === 'childList' && mutation.removedNodes?.length)) {
      for (const node of pending) if (!node.isConnected) pending.delete(node);
      for (const element of pendingAttributes) if (!element.isConnected) pendingAttributes.delete(element);
    }
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        if (!eligible(mutation.target)) { stats.ignoredMutations++; continue; }
        for (const node of mutation.addedNodes) enqueue(node);
      } else if (mutation.type === 'characterData') {
        if (mutation.target.nodeValue === textWrites.get(mutation.target) || !eligible(mutation.target)) { stats.ignoredMutations++; continue; }
        enqueue(mutation.target);
      } else if (mutation.type === 'attributes') {
        const value = mutation.target.getAttribute(mutation.attributeName);
        if (value === attributeWrites.get(mutation.target)?.get(mutation.attributeName) || !eligible(mutation.target)) { stats.ignoredMutations++; continue; }
        enqueueAttributes(mutation.target);
      }
    }
  });
  observer.observe(doc.body || doc.documentElement, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: attrs
  });
  enqueue(doc.body || doc.documentElement);
  const instance = {
    translate,
    getStats() { return {...stats, pending: pending.size + pendingAttributes.size, pendingAttributes: pendingAttributes.size, active: !!active}; },
    dispose() {
      disposed = true;
      observer.disconnect();
      if (scheduled !== null) {
        if (animationScheduled) win.cancelAnimationFrame(scheduled); else win.clearTimeout(scheduled);
      }
      pending.clear(); pendingAttributes.clear(); cache.clear(); active = null; scheduled = null;
      if (win[instanceKey] === instance) delete win[instanceKey];
    }
  };
  win[instanceKey] = instance;
  return instance;
}

module.exports = { mountDevinZh };
