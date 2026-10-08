'use strict';
const { mountDevinZh } = require('./runtime');
const { loadWebData, serializeRules } = require('./build');

function buildFixture() {
  const {dictionary, rules} = loadWebData();
  const runtime = mountDevinZh.toString();
  return `<!doctype html><meta charset="utf-8"><title>Devin 汉化回归验证</title>
<style>body{font:16px system-ui;max-width:1100px;margin:30px auto;color:#222}h1{font-size:25px}button,input{font:inherit;margin:4px;padding:6px}#summary{padding:15px;background:#eee;border-radius:8px}#results{columns:2;font-size:14px;line-height:1.8}section{border:1px solid #ddd;border-radius:8px;padding:15px;margin-top:18px}.pass{color:#156a34}.fail{color:#b02020}.prose-main{background:#fafafa}code{white-space:pre-wrap}</style>
<h1>Devin 网页汉化：实际 DOM 回归验证</h1><p>本页模拟固定界面、动态菜单和编辑器。它不是已安装到 Devin 的效果截图。</p>
<div id="summary">正在验证…</div><ul id="results"></ul>
<section id="ui"><h2>Local Settings</h2><p id="description">Manage your Devin Desktop API keys and privacy settings.</p>
<button id="wiki">Wiki</button><button id="customize">Customize</button><button id="dynamic-attr" title="Close tab" aria-label="Close tab">×</button>
<button id="nav">  Cloud settings  </button><p id="normalize">Model provider\n API keys</p><p id="money">$20/month</p>
<button id="prototype">constructor</button><p id="unknown">A completely unknown product label</p><p id="generic-name">Review</p><p id="short-time">8m ago</p>
<input id="input" placeholder="Search sessions..." value="Review"><textarea id="textarea" placeholder="Type a message...">Save</textarea>
<div contenteditable="true" id="draft">Read private.txt</div>
<div contenteditable="true" id="slate"><span data-slate-placeholder="true" contenteditable="false">Send to the queue, or press <kbd>Ctrl</kbd> to send immediately</span><span id="slate-draft">Plan</span></div>
<div class="prose-main"><p id="prose">Read private.txt</p><button id="prose-button">Review</button></div>
<div data-testid="transcript-user-message"><div id="user">Save</div><button id="message-action" aria-label="Message actions">Message actions</button></div>
<div data-testid="transcript-agent-message"><div id="agent">Read private.txt</div></div>
<pre id="code">Read private.txt</pre><div class="xterm" id="terminal">Save</div><p translate="no" id="no">Wiki</p>
<a id="session" href="/sessions/abcd1234" aria-label="Review">Review</a>
<a id="automation-title" href="/org/example/automations/abcd1234" aria-label="No metadata yet">No metadata yet</a>
<a id="pr" href="/review/team/project/pull/12" aria-label="Review">Review</a>
<a href="/review/team/project/pull/13"><span id="pr-card-title">Review</span><button id="pr-card-action" aria-label="More actions">×</button><button id="pr-card-user" aria-label="Review">×</button></a>
<a id="plugin-link" href="/org/example/customize">Plugins</a><a id="scan-link" href="/org/example/security">Scans</a>
<button id="file" data-flash-channel="tab:file-1">Context</button><button id="context" data-flash-channel="tab:context">Context</button>
<input id="toggle" type="checkbox" checked><button id="action" data-action="send">Send</button>
</section><section id="settings-fixture"><h2>Devin 设置页结构回归</h2>
<div data-slot="sidebar-group-label" id="settings-personal">Personal</div><div data-slot="sidebar-group-label" id="settings-org">Organization</div>
<ul><li data-slot="sidebar-menu-item"><a href="/org/example/settings/general" aria-label="General"></a><div><span id="settings-general">General</span></div></li>
<li data-slot="sidebar-menu-item"><a href="/settings/preferences"></a><span id="settings-preferences">Preferences</span></li>
<li data-slot="sidebar-menu-item"><a href="/sessions/abcd1234"></a><span id="settings-session-name">Review</span></li>
<li data-slot="sidebar-menu-item"><a href="/org/example/settings/general"></a><a href="/sessions/abcd1234"></a><span id="settings-ambiguous">Review</span></li></ul>
<div role="combobox" id="settings-agent">Normal</div><input id="settings-agent-value" type="hidden" value="normal">
<h4 id="settings-use">Agent computer use</h4><p id="settings-use-description">Let Devin use mouse, keyboard, and screen tools. When disabled, Devin uses browser tools instead. The Desktop tab remains available either way.</p>
<h4 id="settings-pr-access">Require session access for PR comments</h4><input id="settings-pr-toggle" type="checkbox">
<p id="settings-exclusion">PRs that match an exclusion are never reviewed automatically, even if a rule enrolls them.</p>
<label id="settings-language">Spanish<input id="settings-language-value" type="checkbox" value="es"></label>
<div translate="no" data-devin-input-box="true" data-slate-editor="true" contenteditable="true" role="textbox" aria-label="Prompt" id="real-prompt"><div><span data-slate-placeholder="true" contenteditable="false" id="real-placeholder">Ask Devin to build features, fix bugs, or work on your code</span><span id="real-draft">Review</span><code id="real-code">Save</code></div></div>
<div translate="no" contenteditable="true"><span data-slate-placeholder="true" contenteditable="false" id="unknown-placeholder">Ask Devin to build features, fix bugs, or work on your code</span></div>
</section><script>
${runtime}
const dictionary=${JSON.stringify(dictionary).replaceAll('<','\\u003c')};const rules=${serializeRules(rules)};
const translator=mountDevinZh(window,dictionary,rules);
const results=[];const el=id=>document.getElementById(id);
const wait=(frames=8)=>new Promise(resolve=>{let n=0;function next(){if(++n===frames)resolve();else requestAnimationFrame(next)}requestAnimationFrame(next)});
function check(name,condition){results.push({name,pass:!!condition});const item=document.createElement('li');item.textContent=(condition?'✓ ':'✕ ')+name;item.className=condition?'pass':'fail';el('results').append(item)}
(async()=>{
let clicks=0;const originalButton=el('action');originalButton.addEventListener('click',()=>clicks++);
await wait();
check('云端设置标题',document.querySelector('h2').textContent==='本地设置');
check('设置说明',el('description').textContent==='管理 Devin 桌面版的 API 密钥和隐私设置。');
check('Wiki / 自定义导航',el('wiki').textContent==='知识库'&&el('customize').textContent==='自定义');
check('保留首尾空格',el('nav').textContent==='  云端设置  ');
check('换行文案精确匹配',el('normalize').textContent==='模型服务商 API 密钥');
check('正则价格保留美元',el('money').textContent==='$20/月');
check('原型名称保持原文',el('prototype').textContent==='constructor');
check('未知文案保持原文',el('unknown').textContent==='A completely unknown product label');
check('未知普通单词值保持原文',el('generic-name').textContent==='Review');
check('简写相对时间',el('short-time').textContent==='8 分钟前');
check('输入框值不变',el('input').value==='Review');
check('多行输入值不变',el('textarea').value==='Save'&&el('textarea').textContent==='Save');
check('占位属性汉化',el('input').placeholder==='搜索会话...'&&el('textarea').placeholder==='输入消息...');
check('编辑草稿不变',el('draft').textContent==='Read private.txt'&&el('slate-draft').textContent==='Plan');
check('Slate 拆分占位提示',el('slate').querySelector('[data-slate-placeholder]').textContent==='发送到队列，或按 Ctrl 立即发送');
check('快捷键不变',el('slate').querySelector('kbd').textContent==='Ctrl');
check('正文及正文内按钮不变',el('prose').textContent==='Read private.txt'&&el('prose-button').textContent==='Review');
check('用户与 Agent 消息不变',el('user').textContent==='Save'&&el('agent').textContent==='Read private.txt');
check('消息操作按钮汉化',el('message-action').getAttribute('aria-label')==='消息操作');
check('代码与终端不变',el('code').textContent==='Read private.txt'&&el('terminal').textContent==='Save');
check('显式不翻译区域',el('no').textContent==='Wiki');
check('会话标题和链接不变',el('session').textContent==='Review'&&el('session').getAttribute('href')==='/sessions/abcd1234'&&el('session').getAttribute('aria-label')==='Review');
check('自动化自定义名称不被固定词条覆盖',el('automation-title').textContent==='No metadata yet'&&el('automation-title').getAttribute('aria-label')==='No metadata yet');
check('PR 标题和链接不变',el('pr').textContent==='Review'&&el('pr').getAttribute('href')==='/review/team/project/pull/12'&&el('pr').getAttribute('aria-label')==='Review');
check('PR 卡片操作提示翻译且标题不变',el('pr-card-title').textContent==='Review'&&el('pr-card-action').getAttribute('aria-label')==='更多操作'&&el('pr-card-user').getAttribute('aria-label')==='Review');
check('自定义与扫描子导航汉化',el('plugin-link').textContent==='插件'&&el('scan-link').textContent==='扫描');
check('文件标签名不变',el('file').textContent==='Context');
check('固定上下文标签汉化',el('context').textContent==='上下文');
originalButton.click();check('按钮身份 / 原始事件不变',el('action')===originalButton&&clicks===1&&originalButton.dataset.action==='send');
check('开关状态不变',el('toggle').checked);
check('设置侧栏分组标题汉化',el('settings-personal').textContent==='个人'&&el('settings-org').textContent==='组织');
check('设置侧栏相邻覆盖链接汉化',el('settings-general').textContent==='通用'&&el('settings-preferences').textContent==='偏好设置');
check('相邻会话标题及未知多链接行不变',el('settings-session-name').textContent==='Review'&&el('settings-ambiguous').textContent==='Review');
check('选项显示与内部值分离',el('settings-agent').textContent==='常规'&&el('settings-agent-value').value==='normal');
check('电脑操作标题与完整说明',el('settings-use').textContent==='智能体电脑操作'&&el('settings-use-description').textContent.includes('无论是否开启'));
check('权限文案翻译不改权限状态',el('settings-pr-access').textContent==='处理 PR 评论时要求会话访问权限'&&!el('settings-pr-toggle').checked);
check('排除规则说明保留优先级',el('settings-exclusion').textContent.includes('即使它同时匹配自动审查规则'));
check('语言显示与选项值分离',el('settings-language').textContent==='西班牙语'&&el('settings-language-value').value==='es'&&!el('settings-language-value').checked);
check('真实禁翻输入框的固定占位提示',el('real-placeholder').textContent==='让 Devin 开发功能、修复缺陷或处理你的代码'&&el('real-prompt').getAttribute('aria-label')==='提示词');
check('真实输入框草稿及代码保护',el('real-draft').textContent==='Review'&&el('real-code').textContent==='Save');
check('未知禁翻输入结构保留原文',el('unknown-placeholder').textContent==='Ask Devin to build features, fix bugs, or work on your code');
el('dynamic-attr').setAttribute('title','Full width');el('dynamic-attr').setAttribute('aria-label','Session info');
el('wiki').firstChild.nodeValue='Customize';
el('settings-general').firstChild.nodeValue='Connections';
el('real-placeholder').firstChild.nodeValue='Ask Devin about your code';el('real-draft').firstChild.nodeValue='Save';
const added=document.createElement('button');added.id='added';added.textContent='Commands and skills';el('ui').append(added);
const detached=document.createElement('button');detached.textContent='Wiki';el('ui').append(detached);detached.remove();
await wait();
check('动态 title 汉化',el('dynamic-attr').title==='全宽显示');
check('动态 aria-label 汉化',el('dynamic-attr').getAttribute('aria-label')==='会话信息');
check('重复渲染文本汉化',el('wiki').textContent==='自定义');
check('动态设置侧栏重新翻译',el('settings-general').textContent==='连接');
check('输入框占位重新渲染不改草稿',el('real-placeholder').textContent==='向 Devin 提问你的代码'&&el('real-draft').textContent==='Save');
check('新菜单节点汉化',el('added').textContent==='命令与技能');
check('已移除节点保留',detached.textContent==='Wiki');
const many=document.createElement('div');many.id='many';el('ui').append(many);
for(let n=0;n<1200;n++){const b=document.createElement('button');b.textContent='Wiki';many.append(b)}
await wait(40);check('大量动态节点分批完整汉化',many.children.length===1200&&[...many.children].every(b=>b.textContent==='知识库'));many.remove();
translator.dispose();el('wiki').firstChild.nodeValue='Wiki';await wait();check('可停止并保持英文',el('wiki').textContent==='Wiki');
const failed=results.filter(r=>!r.pass);el('summary').textContent=failed.length?'失败 '+failed.length+' / '+results.length:'全部通过：'+results.length+' 项实际 DOM 检查';
el('summary').className=failed.length?'fail':'pass';el('summary').dataset.status=failed.length?'failed':'passed';el('summary').dataset.count=results.length;
document.title=(failed.length?'FAIL':'PASS')+' - Devin 汉化回归验证';
})().catch(error=>{el('summary').textContent='执行失败：'+error.message;el('summary').dataset.status='failed';});
</script>`;
}
module.exports = { buildFixture };
