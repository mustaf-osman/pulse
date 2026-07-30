// NewPulse · 软件分类目录
// ─────────────────────────────────────────────────────────────
// 每个条目：进程名（小写、不含 .exe）→ {
//   name: 中文友好名,
//   category: 大类（决定颜色/统计口径）,
//   workRelated: 默认是否计入有效工作时长,
//   risk: 默认风险等级（AI 没跑时用作兜底）,
//   note?: 额外说明
// }
// ─────────────────────────────────────────────────────────────

export const CATEGORY_META = {
  communication: { label: '沟通协作', color: '#22c55e', workRelated: true, risk: 'low' },
  meeting: { label: '会议',         color: '#06b6d4', workRelated: true, risk: 'low' },
  document: { label: '文档表格',    color: '#2563eb', workRelated: true, risk: 'low' },
  dev: { label: '研发 / IDE',       color: '#8b5cf6', workRelated: true, risk: 'low' },
  design: { label: '设计创作',      color: '#ec4899', workRelated: true, risk: 'low' },
  'ai-tool': { label: 'AI 工具',    color: '#0ea5e9', workRelated: true, risk: 'low' },
  ecommerce: { label: '电商运营',   color: '#f97316', workRelated: true, risk: 'low' },
  knowledge: { label: '知识管理',   color: '#14b8a6', workRelated: true, risk: 'low' },
  browser: { label: '浏览器',       color: '#0284c7', workRelated: true, risk: 'medium', note: '具体看访问的网站，AI 检测可识别' },
  system: { label: '系统 / 终端',   color: '#64748b', workRelated: true, risk: 'low' },
  pulse: { label: 'Nimo 提醒助手',  color: '#94a3b8', workRelated: true, risk: 'low' },
  music: { label: '音乐 / 播客',    color: '#a855f7', workRelated: true, risk: 'low', note: '默认算工作背景音' },
  reading: { label: '阅读 / 文学',  color: '#0d9488', workRelated: true, risk: 'low' },
  social: { label: '社交媒体',      color: '#f59e0b', workRelated: false, risk: 'medium' },
  video: { label: '视频网站',       color: '#f43f5e', workRelated: false, risk: 'high' },
  entertainment: { label: '娱乐短视频', color: '#ef4444', workRelated: false, risk: 'high' },
  game: { label: '游戏',            color: '#dc2626', workRelated: false, risk: 'high' },
  shopping: { label: '购物',        color: '#fb923c', workRelated: false, risk: 'medium' },
  download: { label: '下载',        color: '#737373', workRelated: false, risk: 'medium' },
  unknown: { label: '未分类',       color: '#9ca3af', workRelated: null, risk: 'medium' },
}

export const APP_CATALOG = {
  // ── 沟通 ─────────────────────────────────────────────────────
  weixin: { name: '微信', category: 'communication' },
  wechat: { name: '微信', category: 'communication' },
  wechatappex: { name: '微信小程序', category: 'communication' },
  wechatutility: { name: '微信工具进程', category: 'communication' },
  qq: { name: '腾讯 QQ', category: 'communication' },
  tim: { name: '腾讯 TIM', category: 'communication' },
  wework: { name: '企业微信', category: 'communication' },
  wxwork: { name: '企业微信', category: 'communication' },
  dingtalk: { name: '钉钉', category: 'communication' },
  lark: { name: '飞书', category: 'communication' },
  feishu: { name: '飞书', category: 'communication' },
  feishuapp: { name: '飞书', category: 'communication' },
  slack: { name: 'Slack', category: 'communication' },
  discord: { name: 'Discord', category: 'communication' },
  telegram: { name: 'Telegram', category: 'communication' },
  whatsapp: { name: 'WhatsApp', category: 'communication' },
  line: { name: 'LINE', category: 'communication' },
  skype: { name: 'Skype', category: 'communication' },
  alimm: { name: '阿里旺旺', category: 'communication' },
  qianniu: { name: '千牛', category: 'ecommerce' },
  aliwangwang: { name: '阿里旺旺', category: 'communication' },

  // ── 会议 ─────────────────────────────────────────────────────
  zoom: { name: 'Zoom', category: 'meeting' },
  tencentmeeting: { name: '腾讯会议', category: 'meeting' },
  wemeetapp: { name: '腾讯会议', category: 'meeting' },
  voov: { name: '腾讯会议', category: 'meeting' },
  teams: { name: 'Microsoft Teams', category: 'meeting' },
  webex: { name: 'Webex', category: 'meeting' },
  larkmeeting: { name: '飞书会议', category: 'meeting' },

  // ── 文档表格 ────────────────────────────────────────────────
  winword: { name: 'Word', category: 'document' },
  excel: { name: 'Excel', category: 'document' },
  powerpnt: { name: 'PowerPoint', category: 'document' },
  outlook: { name: 'Outlook', category: 'communication' },
  onenote: { name: 'OneNote', category: 'knowledge' },
  visio: { name: 'Visio', category: 'document' },
  msaccess: { name: 'Access', category: 'document' },
  publisher: { name: 'Publisher', category: 'document' },
  wpsoffice: { name: 'WPS Office', category: 'document' },
  wps: { name: 'WPS Office', category: 'document' },
  wpp: { name: 'WPS 演示', category: 'document' },
  et: { name: 'WPS 表格', category: 'document' },
  notepad: { name: '记事本', category: 'document' },
  'notepad++': { name: 'Notepad++', category: 'document' },
  notepadplusplus: { name: 'Notepad++', category: 'document' },
  acrord32: { name: 'Adobe Reader', category: 'document' },
  acrobat: { name: 'Adobe Acrobat', category: 'document' },
  foxitreader: { name: 'Foxit Reader', category: 'document' },
  sumatrapdf: { name: 'Sumatra PDF', category: 'document' },
  pdfxedit: { name: 'PDF-XChange Editor', category: 'document' },

  // ── 知识管理 ────────────────────────────────────────────────
  notion: { name: 'Notion', category: 'knowledge' },
  obsidian: { name: 'Obsidian', category: 'knowledge' },
  logseq: { name: 'Logseq', category: 'knowledge' },
  typora: { name: 'Typora', category: 'knowledge' },
  marktext: { name: 'Mark Text', category: 'knowledge' },
  evernote: { name: '印象笔记', category: 'knowledge' },
  yinxiangbiji: { name: '印象笔记', category: 'knowledge' },
  yuque: { name: '语雀', category: 'knowledge' },
  flomoapp: { name: 'flomo 浮墨', category: 'knowledge' },
  'roam-research': { name: 'Roam Research', category: 'knowledge' },
  joplin: { name: 'Joplin', category: 'knowledge' },
  xmind: { name: 'XMind', category: 'knowledge' },
  mindmanager: { name: 'MindManager', category: 'knowledge' },
  zotero: { name: 'Zotero', category: 'knowledge' },

  // ── 研发 / IDE / 终端 ──────────────────────────────────────
  code: { name: 'VS Code', category: 'dev' },
  cursor: { name: 'Cursor', category: 'dev' },
  windsurf: { name: 'Windsurf', category: 'dev' },
  trae: { name: 'Trae', category: 'dev' },
  idea64: { name: 'IntelliJ IDEA', category: 'dev' },
  pycharm64: { name: 'PyCharm', category: 'dev' },
  webstorm64: { name: 'WebStorm', category: 'dev' },
  phpstorm64: { name: 'PhpStorm', category: 'dev' },
  goland64: { name: 'GoLand', category: 'dev' },
  clion64: { name: 'CLion', category: 'dev' },
  rider64: { name: 'Rider', category: 'dev' },
  rubymine64: { name: 'RubyMine', category: 'dev' },
  android_studio: { name: 'Android Studio', category: 'dev' },
  studio64: { name: 'Android Studio', category: 'dev' },
  devenv: { name: 'Visual Studio', category: 'dev' },
  sublime_text: { name: 'Sublime Text', category: 'dev' },
  atom: { name: 'Atom', category: 'dev' },
  hbuilderx: { name: 'HBuilderX', category: 'dev' },
  navicat: { name: 'Navicat', category: 'dev' },
  dbeaver: { name: 'DBeaver', category: 'dev' },
  mysqlworkbench: { name: 'MySQL Workbench', category: 'dev' },
  postman: { name: 'Postman', category: 'dev' },
  insomnia: { name: 'Insomnia', category: 'dev' },
  apifox: { name: 'Apifox', category: 'dev' },
  apipost: { name: 'Apipost', category: 'dev' },
  charles: { name: 'Charles', category: 'dev' },
  fiddler: { name: 'Fiddler', category: 'dev' },
  wireshark: { name: 'Wireshark', category: 'dev' },
  sourcetree: { name: 'Sourcetree', category: 'dev' },
  github: { name: 'GitHub Desktop', category: 'dev' },
  fork: { name: 'Fork', category: 'dev' },
  termius: { name: 'Termius', category: 'dev' },
  finalshell: { name: 'FinalShell', category: 'dev' },
  xshell: { name: 'Xshell', category: 'dev' },
  mobaxterm: { name: 'MobaXterm', category: 'dev' },
  putty: { name: 'PuTTY', category: 'dev' },
  windowsterminal: { name: 'Windows Terminal', category: 'system' },
  wt: { name: 'Windows Terminal', category: 'system' },
  powershell: { name: 'PowerShell', category: 'system' },
  pwsh: { name: 'PowerShell 7', category: 'system' },
  cmd: { name: '命令提示符', category: 'system' },
  conhost: { name: '控制台宿主', category: 'system' },

  // ── 浏览器 ─────────────────────────────────────────────────
  chrome: { name: 'Google Chrome', category: 'browser' },
  msedge: { name: 'Microsoft Edge', category: 'browser' },
  firefox: { name: 'Firefox', category: 'browser' },
  iexplore: { name: 'Internet Explorer', category: 'browser' },
  '360se': { name: '360 安全浏览器', category: 'browser' },
  '360chrome': { name: '360 极速浏览器', category: 'browser' },
  qqbrowser: { name: 'QQ 浏览器', category: 'browser' },
  sogouexplorer: { name: '搜狗浏览器', category: 'browser' },
  liebao: { name: '猎豹浏览器', category: 'browser' },
  ucbrowser: { name: 'UC 浏览器', category: 'browser' },
  maxthon: { name: '傲游浏览器', category: 'browser' },
  brave: { name: 'Brave', category: 'browser' },
  opera: { name: 'Opera', category: 'browser' },
  vivaldi: { name: 'Vivaldi', category: 'browser' },
  arc: { name: 'Arc Browser', category: 'browser' },
  safari: { name: 'Safari', category: 'browser' },

  // ── 设计 / 创作 ────────────────────────────────────────────
  photoshop: { name: 'Photoshop', category: 'design' },
  illustrator: { name: 'Illustrator', category: 'design' },
  premiere: { name: 'Premiere Pro', category: 'design' },
  premiereproc: { name: 'Premiere Pro', category: 'design' },
  afterfx: { name: 'After Effects', category: 'design' },
  audition: { name: 'Audition', category: 'design' },
  lightroom: { name: 'Lightroom', category: 'design' },
  indesign: { name: 'InDesign', category: 'design' },
  animate: { name: 'Animate', category: 'design' },
  figma: { name: 'Figma', category: 'design' },
  figma_agent: { name: 'Figma Agent', category: 'design' },
  sketch: { name: 'Sketch', category: 'design' },
  axurerp: { name: 'Axure RP', category: 'design' },
  masterpieceofdesign: { name: 'Master Go', category: 'design' },
  pixso: { name: 'Pixso', category: 'design' },
  affinity: { name: 'Affinity', category: 'design' },
  blender: { name: 'Blender', category: 'design' },
  c4d: { name: 'Cinema 4D', category: 'design' },
  '3dsmax': { name: '3ds Max', category: 'design' },
  maya: { name: 'Maya', category: 'design' },
  capcut: { name: '剪映 CapCut', category: 'design' },
  jianyingpro: { name: '剪映专业版', category: 'design' },
  davinci_resolve: { name: 'DaVinci Resolve', category: 'design' },
  obs64: { name: 'OBS Studio', category: 'design' },
  obs32: { name: 'OBS Studio', category: 'design' },
  obs: { name: 'OBS Studio', category: 'design' },
  canva: { name: 'Canva', category: 'design' },

  // ── AI 工具 ────────────────────────────────────────────────
  doubao: { name: '豆包', category: 'ai-tool' },
  doubaopc: { name: '豆包 PC', category: 'ai-tool' },
  bytechat: { name: '豆包', category: 'ai-tool' },
  kimi: { name: 'Kimi', category: 'ai-tool' },
  kimichat: { name: 'Kimi', category: 'ai-tool' },
  chatgpt: { name: 'ChatGPT', category: 'ai-tool' },
  claude: { name: 'Claude', category: 'ai-tool' },
  copilot: { name: 'Copilot', category: 'ai-tool' },
  poe: { name: 'Poe', category: 'ai-tool' },
  perplexity: { name: 'Perplexity', category: 'ai-tool' },
  wenxin: { name: '文心一言', category: 'ai-tool' },
  yiyan: { name: '文心一言', category: 'ai-tool' },
  tongyi: { name: '通义千问', category: 'ai-tool' },
  sparkdesk: { name: '讯飞星火', category: 'ai-tool' },
  zhipuqingyan: { name: '智谱清言', category: 'ai-tool' },
  yuanbao: { name: '腾讯元宝', category: 'ai-tool' },
  hunyuan: { name: '混元 AI', category: 'ai-tool' },
  midjourney: { name: 'Midjourney', category: 'ai-tool' },
  stablediffusion: { name: 'Stable Diffusion', category: 'ai-tool' },
  comfyui: { name: 'ComfyUI', category: 'ai-tool' },
  ollama: { name: 'Ollama', category: 'ai-tool' },
  lmstudio: { name: 'LM Studio', category: 'ai-tool' },

  // ── 电商 / 业务后台 ───────────────────────────────────────
  shengyiCanmou: { name: '生意参谋', category: 'ecommerce' },
  shengyicanmou: { name: '生意参谋', category: 'ecommerce' },
  jdpop: { name: '京东商家工作台', category: 'ecommerce' },
  jdpopchat: { name: '京麦', category: 'ecommerce' },
  pddmerchant: { name: '拼多多商家版', category: 'ecommerce' },
  douyinim: { name: '抖店聊天', category: 'ecommerce' },
  doudian: { name: '抖店', category: 'ecommerce' },
  xhsmerchant: { name: '小红书千帆', category: 'ecommerce' },
  bookkeeping: { name: '记账软件', category: 'ecommerce' },
  jinshanjinrong: { name: '金山金融', category: 'ecommerce' },

  // ── 系统 / 工具 ────────────────────────────────────────────
  explorer: { name: 'Windows 资源管理器', category: 'system' },
  taskmgr: { name: '任务管理器', category: 'system' },
  control: { name: '控制面板', category: 'system' },
  systemsettings: { name: '系统设置', category: 'system' },
  searchapp: { name: '系统搜索', category: 'system' },
  searchhost: { name: '系统搜索', category: 'system' },
  startmenuexperiencehost: { name: '开始菜单', category: 'system' },
  shellexperiencehost: { name: 'Windows Shell', category: 'system' },
  lockapp: { name: '锁屏', category: 'system' },
  snippingtool: { name: '截图工具', category: 'system' },
  screenclippinghost: { name: 'Win+Shift+S 截图', category: 'system' },
  calculator: { name: '计算器', category: 'system' },
  mspaint: { name: '画图', category: 'system' },
  charmap: { name: '字符映射表', category: 'system' },
  '7zfm': { name: '7-Zip', category: 'system' },
  winrar: { name: 'WinRAR', category: 'system' },
  bandizip: { name: 'Bandizip', category: 'system' },
  totalcmd: { name: 'Total Commander', category: 'system' },
  everything: { name: 'Everything 搜索', category: 'system' },
  utools: { name: 'uTools', category: 'system' },
  rocket: { name: 'Rocket 启动器', category: 'system' },
  wox: { name: 'Wox', category: 'system' },
  listary: { name: 'Listary', category: 'system' },

  // ── 下载 ────────────────────────────────────────────────────
  thunder: { name: '迅雷', category: 'download' },
  utorrent: { name: 'µTorrent', category: 'download' },
  qbittorrent: { name: 'qBittorrent', category: 'download' },
  idman: { name: 'IDM 下载器', category: 'download' },
  motrix: { name: 'Motrix', category: 'download' },

  // ── 网盘 ────────────────────────────────────────────────────
  baidunetdisk: { name: '百度网盘', category: 'document' },
  aliyunpan: { name: '阿里云盘', category: 'document' },
  qpan: { name: '腾讯微云', category: 'document' },
  weiyun: { name: '腾讯微云', category: 'document' },
  dropbox: { name: 'Dropbox', category: 'document' },
  onedrive: { name: 'OneDrive', category: 'document' },
  googledrivefs: { name: 'Google Drive', category: 'document' },

  // ── 输入法 / 字典（不计入"工作"也不算"娱乐"，归 system） ──
  sogouinput: { name: '搜狗输入法', category: 'system' },
  qqpinyin: { name: 'QQ 拼音', category: 'system' },
  wubipinyin: { name: '微软五笔', category: 'system' },
  rime: { name: 'Rime', category: 'system' },
  youdaodict: { name: '有道词典', category: 'reading' },
  youdao: { name: '有道', category: 'reading' },
  jinshanciba: { name: '金山词霸', category: 'reading' },

  // ── 阅读 ────────────────────────────────────────────────────
  weread: { name: '微信读书', category: 'reading' },
  qqreader: { name: 'QQ 阅读', category: 'reading' },
  kindle: { name: 'Kindle', category: 'reading' },
  calibre: { name: 'Calibre', category: 'reading' },
  duokan: { name: '多看阅读', category: 'reading' },

  // ── 音乐 / 播客 ────────────────────────────────────────────
  cloudmusic: { name: '网易云音乐', category: 'music' },
  qqmusic: { name: 'QQ 音乐', category: 'music' },
  kugou: { name: '酷狗音乐', category: 'music' },
  kuwo: { name: '酷我音乐', category: 'music' },
  spotify: { name: 'Spotify', category: 'music' },
  appleMusic: { name: 'Apple Music', category: 'music' },
  applemusic: { name: 'Apple Music', category: 'music' },
  ximalaya: { name: '喜马拉雅', category: 'music' },
  qishuiapp: { name: '汽水音乐', category: 'music' },
  lizhi: { name: '荔枝 FM', category: 'music' },
  podcast: { name: '播客', category: 'music' },

  // ── 社交媒体 ──────────────────────────────────────────────
  weibo: { name: '微博', category: 'social' },
  xhs: { name: '小红书', category: 'social' },
  xiaohongshu: { name: '小红书', category: 'social' },
  zhihu: { name: '知乎', category: 'social' },
  jike: { name: '即刻', category: 'social' },
  douban: { name: '豆瓣', category: 'social' },
  twitter: { name: 'Twitter / X', category: 'social' },
  x: { name: 'X (Twitter)', category: 'social' },
  facebook: { name: 'Facebook', category: 'social' },
  instagram: { name: 'Instagram', category: 'social' },
  threads: { name: 'Threads', category: 'social' },

  // ── 视频网站客户端 ────────────────────────────────────────
  bilibili: { name: '哔哩哔哩', category: 'video' },
  iqiyi: { name: '爱奇艺', category: 'video' },
  tencentvideo: { name: '腾讯视频', category: 'video' },
  qqlive: { name: '腾讯视频', category: 'video' },
  youku: { name: '优酷', category: 'video' },
  mgtv: { name: '芒果 TV', category: 'video' },
  sohunews: { name: '搜狐视频', category: 'video' },
  youtube: { name: 'YouTube', category: 'video' },
  netflix: { name: 'Netflix', category: 'video' },

  // ── 短视频 / 娱乐 ─────────────────────────────────────────
  douyin: { name: '抖音', category: 'entertainment' },
  douyinpc: { name: '抖音 PC', category: 'entertainment' },
  tiktok: { name: 'TikTok', category: 'entertainment' },
  kuaishou: { name: '快手', category: 'entertainment' },
  redbook: { name: '小红书', category: 'social' },

  // ── 视频播放器（本地播放） ────────────────────────────────
  vlc: { name: 'VLC', category: 'video' },
  potplayermini64: { name: 'PotPlayer', category: 'video' },
  potplayer: { name: 'PotPlayer', category: 'video' },
  kmplayer: { name: 'KMPlayer', category: 'video' },
  qqplayer: { name: 'QQ 影音', category: 'video' },
  iina: { name: 'IINA', category: 'video' },

  // ── 游戏平台 / 单机游戏 ───────────────────────────────────
  steam: { name: 'Steam', category: 'game' },
  steamwebhelper: { name: 'Steam', category: 'game' },
  epicgameslauncher: { name: 'Epic Games', category: 'game' },
  battlenet: { name: '战网', category: 'game' },
  origin: { name: 'Origin', category: 'game' },
  uplay: { name: 'Ubisoft Connect', category: 'game' },
  wegame: { name: 'WeGame', category: 'game' },
  '4399': { name: '4399 游戏盒', category: 'game' },
  yysls: { name: '逆水寒', category: 'game' },
  yuanshen: { name: '原神', category: 'game' },
  genshinimpact: { name: '原神', category: 'game' },
  starrail: { name: '崩坏：星穹铁道', category: 'game' },
  zenlessZoneZero: { name: '绝区零', category: 'game' },
  honkai: { name: '崩坏', category: 'game' },
  bh3: { name: '崩坏 3', category: 'game' },
  pubg: { name: 'PUBG 绝地求生', category: 'game' },
  csgo: { name: 'CS:GO', category: 'game' },
  cs2: { name: 'Counter-Strike 2', category: 'game' },
  dota2: { name: 'Dota 2', category: 'game' },
  league: { name: '英雄联盟', category: 'game' },
  'league of legends': { name: '英雄联盟', category: 'game' },
  client: { name: '游戏客户端', category: 'game' },
  wegamemainhelper: { name: 'WeGame', category: 'game' },
  tslgame: { name: '和平精英 PC', category: 'game' },
  valorant: { name: 'Valorant', category: 'game' },
  minecraft: { name: 'Minecraft', category: 'game' },
  hearthstone: { name: '炉石传说', category: 'game' },

  // ── 购物 ────────────────────────────────────────────────────
  taobao: { name: '淘宝', category: 'shopping' },
  jd: { name: '京东', category: 'shopping' },
  pinduoduo: { name: '拼多多', category: 'shopping' },
  meituan: { name: '美团', category: 'shopping' },
  elemepc: { name: '饿了么', category: 'shopping' },

  // ── Nimo 自身 ────────────────────────────────────────────
  electron: { name: 'Nimo 提醒助手 (开发模式)', category: 'pulse' },
  newpulse: { name: 'Nimo 提醒助手', category: 'pulse' },
  pulse: { name: 'Nimo 提醒助手', category: 'pulse' },
  nimo: { name: 'Nimo 提醒助手', category: 'pulse' },
}

export function lookupAppEntry(processName) {
  const key = String(processName || '').toLowerCase().replace(/\.exe$/, '').trim()
  if (!key) return null
  return APP_CATALOG[key] || null
}

export function classifyProcess(processName, fallbackDesc) {
  const entry = lookupAppEntry(processName)
  if (entry) {
    const meta = CATEGORY_META[entry.category] || CATEGORY_META.unknown
    return {
      name: entry.name,
      category: entry.category,
      categoryLabel: meta.label,
      categoryColor: meta.color,
      workRelated: 'workRelated' in entry ? entry.workRelated : meta.workRelated,
      risk: entry.risk || meta.risk,
      matched: true,
    }
  }
  // 未命中：用 exe 描述/进程名作为名字，分类为 unknown
  const desc = String(fallbackDesc || '').trim()
  const fallback = desc || (processName || '').replace(/\.exe$/i, '')
  return {
    name: fallback || '未知软件',
    category: 'unknown',
    categoryLabel: CATEGORY_META.unknown.label,
    categoryColor: CATEGORY_META.unknown.color,
    workRelated: null,
    risk: 'medium',
    matched: false,
  }
}

export function listCatalogByCategory() {
  const groups = {}
  for (const [key, entry] of Object.entries(APP_CATALOG)) {
    const cat = entry.category
    if (!groups[cat]) groups[cat] = []
    groups[cat].push({ processName: key, name: entry.name })
  }
  for (const cat of Object.keys(groups)) {
    groups[cat].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }
  const order = [
    'communication', 'meeting', 'document', 'knowledge', 'dev',
    'design', 'ai-tool', 'ecommerce', 'browser', 'reading', 'music',
    'system', 'pulse', 'social', 'shopping', 'video',
    'entertainment', 'game', 'download', 'unknown',
  ]
  return order
    .filter((cat) => groups[cat])
    .map((cat) => ({
      id: cat,
      label: CATEGORY_META[cat]?.label || cat,
      color: CATEGORY_META[cat]?.color || '#9ca3af',
      workRelated: CATEGORY_META[cat]?.workRelated ?? null,
      risk: CATEGORY_META[cat]?.risk || 'medium',
      note: CATEGORY_META[cat]?.note || '',
      apps: groups[cat],
    }))
}
