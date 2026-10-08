// 规则翻译: 工具调用标签 ("Listing automations" / "Created a playbook" ...) 这类 "动词 + 宾语" 的固定句式,
// 用动词表 + 名词表直接生成, 比机翻稳定。解析不了的返回 undefined (交给词典/机翻)
const VERBS = {
  // [原形, 进行时, 过去式]: [原形译, 进行译, 完成译]
  List: ['Listing', 'Listed', '列出', '正在列出', '已列出'],
  Read: ['Reading', 'Read', '读取', '正在读取', '已读取'],
  Create: ['Creating', 'Created', '创建', '正在创建', '已创建'],
  Validate: ['Validating', 'Validated', '验证', '正在验证', '已验证'],
  Update: ['Updating', 'Updated', '更新', '正在更新', '已更新'],
  Delete: ['Deleting', 'Deleted', '删除', '正在删除', '已删除'],
  Run: ['Running', 'Ran', '运行', '正在运行', '已运行'],
  'Look up': ['Looking up', 'Looked up', '查找', '正在查找', '已查找'],
  Enable: ['Enabling', 'Enabled', '启用', '正在启用', '已启用'],
  Disable: ['Disabling', 'Disabled', '禁用', '正在禁用', '已禁用'],
  Get: ['Getting', 'Got', '获取', '正在获取', '已获取'],
  Search: ['Searching', 'Searched', '搜索', '正在搜索', '已搜索'],
  Send: ['Sending', 'Sent', '发送', '正在发送', '已发送'],
  Terminate: ['Terminating', 'Terminated', '终止', '正在终止', '已终止'],
  Archive: ['Archiving', 'Archived', '归档', '正在归档', '已归档'],
  Set: ['Setting', 'Set', '设置', '正在设置', '已设置'],
  Manage: ['Managing', 'Managed', '管理', '正在管理', '已管理'],
  Add: ['Adding', 'Added', '添加', '正在添加', '已添加'],
  Assign: ['Assigning', 'Assigned', '分配', '正在分配', '已分配'],
  Generate: ['Generating', 'Generated', '生成', '正在生成', '已生成'],
  Start: ['Starting', 'Started', '启动', '正在启动', '已启动'],
  Query: ['Querying', 'Queried', '查询', '正在查询', '已查询'],
  Check: ['Checking', 'Checked', '检查', '正在检查', '已检查'],
  Trigger: ['Triggering', 'Triggered', '触发', '正在触发', '已触发'],
  Test: ['Testing', 'Tested', '测试', '正在测试', '已测试'],
  Remediate: ['Remediating', 'Remediated', '修复', '正在修复', '已修复'],
  Interact: ['Interacting', 'Interacted', '交互', '正在交互', '已交互'],
  Wait: ['Waiting', 'Waited', '等待', '正在等待', '已等待'],
  Sleep: ['Sleeping', 'Slept', '休眠', '正在休眠', '已休眠'],
  Ask: ['Asking', 'Asked', '询问', '正在询问', '已询问'],
  Open: ['Opening', 'Opened', '打开', '正在打开', '已打开'],
  Find: ['Finding', 'Found', '查找', '正在查找', '已查找'],
  Edit: ['Editing', 'Edited', '编辑', '正在编辑', '已编辑'],
  Write: ['Writing', 'Wrote', '写入', '正在写入', '已写入'],
  Fetch: ['Fetching', 'Fetched', '获取', '正在获取', '已获取'],
  Install: ['Installing', 'Installed', '安装', '正在安装', '已安装'],
  Remove: ['Removing', 'Removed', '移除', '正在移除', '已移除'],
  Batch: ['Batch', 'Batch', '批量', '批量', '批量'],
  Spawn: ['Spawning', 'Spawned', '启动', '正在启动', '已启动'],
};
// 名词/短语 (长的优先匹配); 键用小写
const NOUNS = {
  'automation event schemas': '自动化事件架构', 'automation templates': '自动化模板', 'automation changes': '自动化更改', 'automations': '自动化', 'automation': '自动化',
  'knowledge notes': '知识笔记', 'knowledge note': '知识笔记', 'knowledge schemas': '知识库架构', 'knowledge templates': '知识库模板', 'knowledge note changes': '知识笔记更改',
  'playbooks': '剧本', 'playbook': '剧本', 'playbook schemas': '剧本架构', 'playbook templates': '剧本模板', 'playbook changes': '剧本更改',
  'schedules': '定时任务', 'schedule': '定时任务', 'schedule schemas': '定时任务架构', 'schedule templates': '定时任务模板', 'schedule changes': '定时任务更改',
  'mcp servers': 'MCP 服务器', 'mcp server': 'MCP 服务器', 'mcp server schemas': 'MCP 服务器架构', 'mcp server templates': 'MCP 服务器模板', 'mcp server changes': 'MCP 服务器更改',
  'marketplace mcp server': '市场中的 MCP 服务器',
  'session messages': '会话消息', 'session attachments': '会话附件', 'session details': '会话详情', 'session events': '会话事件', 'session tags': '会话标签',
  'code scan session': '代码扫描会话', 'a code scan session': '代码扫描会话', 'code scans': '代码扫描', 'code scan': '代码扫描', 'scan findings': '扫描发现', 'scan types': '扫描类型', 'scan profiles': '扫描配置', 'scan profile': '扫描配置',
  'finding': '发现', 'findings': '发现', 'sessions': '会话', 'session': '会话', 'a devin session': 'Devin 会话', 'devin session': 'Devin 会话',
  'message to session': '消息到会话', 'message': '消息', 'messages': '消息',
  'oncall incidents': 'Oncall 事件', 'oncall report runs': 'Oncall 报告运行记录', 'oncall report': 'Oncall 报告', 'responder issues': '响应者问题',
  'a devin setting': 'Devin 设置', 'devin setting': 'Devin 设置', 'devin docs': 'Devin 文档', 'integrations': '集成',
  'wiki structure': 'Wiki 结构', 'wiki contents': 'Wiki 内容', 'wiki': 'Wiki', 'about codebase': '关于代码库', 'available repos': '可用仓库',
  'sessions to settle': '会话完成', 'secrets': '密钥', 'a blueprint': '蓝图', 'blueprint': '蓝图',
  'org analytics': '组织分析数据', 'billing tags': '计费标签', 'billing tag': '计费标签', 'billing tag members': '计费标签成员', 'billing tag member': '计费标签成员',
  'session to a billing tag': '会话到计费标签', 'devin review': 'Devin Review', 'devin review status': 'Devin Review 状态', 'devin review findings': 'Devin Review 发现',
  'boards': '看板', 'board': '看板', 'templates': '模板', 'schemas': '架构',
};
const ART = /^(?:a|an|the)\s+/i;
const sortedNouns = Object.keys(NOUNS).sort((a, b) => b.length - a.length);

function nounPhrase(s) {
  s = s.trim().replace(ART, '').replace(/\.\.\.$/, '');
  const k = s.toLowerCase();
  if (NOUNS[k]) return NOUNS[k];
  // 退一步: "a/an X" 或带冠词的
  const k2 = k.replace(ART, '');
  if (NOUNS[k2]) return NOUNS[k2];
  return undefined;
}

function tr(en) {
  const m = /^(Look up|Looking up|Looked up|[A-Z][a-z]+)\s+(.+?)(\.\.\.)?$/.exec(en);
  if (!m) return undefined;
  const [, w, rest] = m;
  let idx = -1, key;
  for (const [base, v] of Object.entries(VERBS)) {
    if (w === base) { idx = 2; key = base; } else if (w === v[0]) { idx = 3; key = base; } else if (w === v[1]) { idx = 4; key = base; }
    if (idx >= 0) break;
  }
  if (idx < 0) return undefined;
  const noun = nounPhrase(rest);
  if (!noun) return undefined;
  const v = VERBS[key];
  const verbZh = v[idx]; // 'Read'/'Set' 的过去式与原形相同, 默认取"已…"风格由调用方的 idx 决定
  const sp = /^[A-Za-z]/.test(noun) ? ' ' : '';
  return verbZh + sp + noun + (m[3] ? '...' : '');
}

module.exports = { tr };
if (require.main === module) for (const s of process.argv.slice(2)) console.log(s, '=>', tr(s));
