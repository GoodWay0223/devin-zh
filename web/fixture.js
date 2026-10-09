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
</section><section id="session-sidebar-fixture"><h2>会话区域保护和流式性能</h2>
<aside data-slot="sidebar"><div data-slot="sidebar-header"><button id="fixed-new-session">New session</button><a id="fixed-review" href="/review">Review</a></div>
<div data-slot="sidebar-content-wrapper"><div data-slot="sidebar-content" id="user-session-content">
<button id="user-project-name" aria-label="Review" title="Create profile">Review</button><button id="user-folder-name">Create profile</button>
<a id="user-session-name" href="/org/example/sessions/session_uuid_1" aria-label="New session">New session</a>
<div id="user-session-time">7 days ago</div><div id="user-session-state">Working</div>
<div data-slot="sidebar-space"><button id="user-space-name">Cloud settings</button></div>
</div></div></aside>
<div role="tree" data-testid="file-tree"><button id="user-file-name" title="Read private.txt">Read private.txt</button></div>
<aside data-slot="sidebar-content"><a id="known-settings-sidebar" href="/org/example/settings/general">General</a></aside>
<aside data-slot="sidebar-content" id="late-settings-sidebar"></aside>
<div data-slot="sidebar-content-wrapper"><div data-slot="sidebar-content">
<a id="mixed-general" href="/org/example/settings/general">General</a><button id="mixed-open-settings">Open settings</button><a href="https://example.com/help">External help link</a>
<p id="mixed-description">Manage your Devin Desktop API keys and privacy settings.</p>
<button id="mixed-user-title">Review</button><div data-slot="sidebar-space"><button id="mixed-space-title">Cloud settings</button></div>
</div></div>
<section role="tree" data-session-id="layout-only"><button id="universal-tree-ui">Wiki</button><p id="universal-session-description">Manage your Devin Desktop API keys and privacy settings.</p></section>
</section><section id="capability-fixture"><h2>能力和模型说明</h2>
<div role="menu"><button role="menuitem" id="capability-normal">Normal</button><button role="menuitem" id="capability-fusion">Fusion</button><button role="menuitem" id="capability-ultra">Ultra</button><button role="menuitem" id="capability-lite">Lite</button><button role="menuitem" id="mode-agent">Agent</button><button role="menuitem" id="model-name">GPT-6.1 Sol</button></div>
<p id="fusion-description">Pairs frontier intelligence with cost-efficient execution to deliver frontier-level results at lower cost</p>
<div role="tooltip" id="normal-description">Balances cost and intelligence with models like Opus 5.5, GPT-6.1 Sol, Fable 5.1, and GPT-6 Astra</div>
<label id="capability-fast">Fast mode<input type="checkbox" id="capability-fast-toggle"></label><label id="capability-plan">Use your ChatGPT plan<input type="checkbox" id="capability-plan-toggle" checked></label>
<div data-testid="transcript-agent-message"><span id="model-description-message">Pairs frontier intelligence with cost-efficient execution to deliver frontier-level results at lower cost</span></div>
<p contenteditable="true" id="model-description-draft">Balances cost and intelligence with models like Opus 5.5, GPT-6.1 Sol, Fable 5.1, and GPT-6 Astra</p>
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
check('消息区域的按钮文字和描述也保持原文',el('message-action').getAttribute('aria-label')==='Message actions'&&el('message-action').textContent==='Message actions');
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
check('Normal 名称与选项内部值均保留',el('settings-agent').textContent==='Normal'&&el('settings-agent-value').value==='normal');
check('电脑操作标题与完整说明',el('settings-use').textContent==='智能体电脑操作'&&el('settings-use-description').textContent.includes('无论是否开启'));
check('权限文案翻译不改权限状态',el('settings-pr-access').textContent==='处理 PR 评论时要求会话访问权限'&&!el('settings-pr-toggle').checked);
check('排除规则说明保留优先级',el('settings-exclusion').textContent.includes('即使它同时匹配自动审查规则'));
check('语言显示与选项值分离',el('settings-language').textContent==='西班牙语'&&el('settings-language-value').value==='es'&&!el('settings-language-value').checked);
check('真实禁翻输入框的固定占位提示',el('real-placeholder').textContent==='让 Devin 开发功能、修复缺陷或处理你的代码'&&el('real-prompt').getAttribute('aria-label')==='提示词');
check('真实输入框草稿及代码保护',el('real-draft').textContent==='Review'&&el('real-code').textContent==='Save');
check('未知禁翻输入结构保留原文',el('unknown-placeholder').textContent==='Ask Devin to build features, fix bugs, or work on your code');
check('Normal/Fusion/Ultra/Lite 和 Agent 模式名称保持英文',['capability-normal','capability-fusion','capability-ultra','capability-lite','mode-agent'].map(id=>el(id).textContent).join('/')==='Normal/Fusion/Ultra/Lite/Agent');
check('模型名称保持英文',el('model-name').textContent==='GPT-6.1 Sol');
check('Fusion 小字说明汉化',el('fusion-description').textContent.includes('以更低成本'));
check('Normal 说明汉化且模型名和版本保留',el('normal-description').textContent.includes('兼顾成本与智能水平')&&['Opus 5.5','GPT-6.1 Sol','Fable 5.1','GPT-6 Astra'].every(name=>el('normal-description').textContent.includes(name)));
check('快速模式及 ChatGPT 套餐说明汉化不改开关',el('capability-fast').textContent==='快速模式'&&el('capability-plan').textContent==='使用你的 ChatGPT 套餐'&&!el('capability-fast-toggle').checked&&el('capability-plan-toggle').checked);
check('与模式说明同句的聊天正文和草稿保护',el('model-description-message').textContent.startsWith('Pairs frontier')&&el('model-description-draft').textContent.startsWith('Balances cost'));
check('会话区域之外固定导航继续汉化',el('fixed-new-session').textContent==='新建会话'&&el('fixed-review').textContent==='代码审查');
check('项目和文件夹名称即使匹配词典也不汉化',el('user-project-name').textContent==='Review'&&el('user-folder-name').textContent==='Create profile');
check('会话名称及描述属性保持原文',el('user-session-name').textContent==='New session'&&el('user-session-name').getAttribute('aria-label')==='New session'&&el('user-project-name').title==='Create profile'&&el('user-project-name').getAttribute('aria-label')==='Review');
check('会话状态时间和空间名称也不处理',el('user-session-time').textContent==='7 days ago'&&el('user-session-state').textContent==='Working'&&el('user-space-name').textContent==='Cloud settings');
check('用户文件树名称和属性不处理',el('user-file-name').textContent==='Read private.txt'&&el('user-file-name').title==='Read private.txt');
check('纯固定设置导航不被会话区域排除',el('known-settings-sidebar').textContent==='通用');
check('混合通用侧栏中的已知导航和普通设置按钮继续翻译',el('mixed-general').textContent==='通用'&&el('mixed-open-settings').textContent==='打开设置');
check('共享侧栏中的普通设置说明继续汉化',el('mixed-description').textContent==='管理 Devin 桌面版的 API 密钥和隐私设置。');
check('混合侧栏里的用户名称和空间内容仍受保护',el('mixed-user-title').textContent==='Review'&&el('mixed-space-title').textContent==='Cloud settings');
check('通用 tree/session-id 布局标记不会封掉固定界面',el('universal-tree-ui').textContent==='知识库'&&el('universal-session-description').textContent==='管理 Devin 桌面版的 API 密钥和隐私设置。');
el('dynamic-attr').setAttribute('title','Full width');el('dynamic-attr').setAttribute('aria-label','Session info');
el('wiki').firstChild.nodeValue='Customize';
el('normal-description').firstChild.nodeValue='Balances cost and intelligence with models like NextModel 7.2 and GPT-8 Sol';
el('settings-general').firstChild.nodeValue='Connections';
const lateLink=document.createElement('a');lateLink.href='/org/example/settings/general';lateLink.id='late-settings-link';lateLink.textContent='General';el('late-settings-sidebar').append(lateLink);
el('real-placeholder').firstChild.nodeValue='Ask Devin about your code';el('real-draft').firstChild.nodeValue='Save';
const added=document.createElement('button');added.id='added';added.textContent='Commands and skills';el('ui').append(added);
const detached=document.createElement('button');detached.textContent='Wiki';el('ui').append(detached);detached.remove();
await wait();
check('动态 title 汉化',el('dynamic-attr').title==='全宽显示');
check('动态 aria-label 汉化',el('dynamic-attr').getAttribute('aria-label')==='会话信息');
check('重复渲染文本汉化',el('wiki').textContent==='自定义');
check('动态模型说明复用句式且新模型名称原样保留',el('normal-description').textContent==='使用 NextModel 7.2 and GPT-8 Sol 等模型，兼顾成本与智能水平。');
check('动态设置侧栏重新翻译',el('settings-general').textContent==='连接');
check('异步加载的固定设置侧栏仍可汉化',el('late-settings-link').textContent==='通用');
check('输入框占位重新渲染不改草稿',el('real-placeholder').textContent==='向 Devin 提问你的代码'&&el('real-draft').textContent==='Save');
check('新菜单节点汉化',el('added').textContent==='命令与技能');
check('已移除节点保留',detached.textContent==='Wiki');
const many=document.createElement('div');many.id='many';el('ui').append(many);
for(let n=0;n<1200;n++){const b=document.createElement('button');b.textContent='Wiki';many.append(b)}
await wait(40);check('大量动态节点分批完整汉化',many.children.length===1200&&[...many.children].every(b=>b.textContent==='知识库'));many.remove();
await wait();const beforeStream=translator.getStats();
for(let n=0;n<10000;n++){el('agent').firstChild.nodeValue='A private streaming message '+n;el('user-session-state').firstChild.nodeValue='Working '+n;}
for(let n=0;n<500;n++){const b=document.createElement('button');b.textContent='Review';el('user-session-content').append(b);}
await wait();const afterStream=translator.getStats();
check('20000 条正文和会话更新不执行翻译规则',afterStream.ruleTests===beforeStream.ruleTests);
check('受保护流式更新不进入翻译队列和遍历',afterStream.visitedNodes===beforeStream.visitedNodes&&afterStream.pending===0&&!afterStream.active);
check('动态会话和项目按钮始终保持原文',[...el('user-session-content').querySelectorAll('button')].slice(-500).every(b=>b.textContent==='Review'));
check('动态突发不退回整页扫描',afterStream.fullRootScans===1);
translator.dispose();el('wiki').firstChild.nodeValue='Wiki';await wait();check('可停止并保持英文',el('wiki').textContent==='Wiki');
const failed=results.filter(r=>!r.pass);el('summary').textContent=failed.length?'失败 '+failed.length+' / '+results.length:'全部通过：'+results.length+' 项实际 DOM 检查';
el('summary').dataset.runtimeStats=JSON.stringify({beforeStream,afterStream});
el('summary').className=failed.length?'fail':'pass';el('summary').dataset.status=failed.length?'failed':'passed';el('summary').dataset.count=results.length;
document.title=(failed.length?'FAIL':'PASS')+' - Devin 汉化回归验证';
})().catch(error=>{el('summary').textContent='执行失败：'+error.message;el('summary').dataset.status='failed';});
</script>`;
}
module.exports = { buildFixture };
