# 行业包规范（Industry Pack Spec）

每个行业包是一个 JSON 文件，放在 `src/industry-packs/` 目录下，文件名即行业 ID（如 `tech.json`、`ecommerce.json`）。

## 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | ✓ | 行业唯一 ID，与文件名一致（如 `tech`） |
| `name` | string | ✓ | 行业显示名（如 `科技`） |
| `icon` | string | ✓ | emoji 图标（如 `💻`） |
| `tagline` | string | ✓ | 一句话描述（引导页展示） |
| `category` | string |  | 行业分组：`sales_growth` / `store_ops` / `professional_services` |
| `order` | number |  | 展示排序，越小越靠前 |
| `aiPersona` | string | ✓ | 注入到 system prompt 的人设片段 |
| `hotspotSources` | string[] | ✓ | 热点源 key 列表 |
| `customerFields` | Field[] | ✓ | 客户档案字段定义 |
| `prompts` | Prompt[] | ✓ | 话术模板列表 |
| `dashboard` | object | ✓ | 数据看板配置 |
| `quickActions` | QuickAction[] |  | 首页快捷动作配置 |
| `radar` | object |  | 行业雷达兜底数据 |

## Field 结构

```json
{
  "key": "company_size",
  "label": "团队规模",
  "type": "select",  // text | number | select | tags | date
  "options": ["1-10", "11-50"],  // type=select/tags 时必填
  "required": false
}
```

## Prompt 结构

```json
{
  "id": "demo_invite",
  "title": "Demo 邀约首发文案",
  "category": "邀约",
  "template": "您好 {{name}}，我们注意到贵司正在...",
  "vars": ["name", "product"]
}
```


## QuickAction 结构

```json
{
  "title": "写英文开发信",
  "description": "生成海外客户破冰邮件",
  "action": "go-chat",
  "prompt": "请根据当前跨境客户资料，生成一封英文开发信。"
}
```
## Dashboard 结构

```json
{
  "widgets": [
    { "type": "funnel", "title": "本月漏斗", "stages": [...] },
    { "type": "ranking", "title": "本月动销榜", "metric": "gmv" }
  ]
}
```

## 加载机制

启动时 `src/industry/loader.js` 扫描该目录所有 `.json`，加载到内存供前后端访问。

## 行业知识文件

每个行业可以在独立目录维护 Markdown 或文本知识：

```text
src/industry-packs/knowledge/ecommerce/operations.md
src/industry-packs/knowledge/tech/b2b-sales.md
```

加载器会读取当前行业目录下的 `.md` / `.txt` 文件，挂载到行业包的 `knowledge` 字段。AI 上下文注入时会根据当前消息、任务、提示和最近对话做轻量关键词匹配，只注入最相关的少量行业知识片段。

## 隔离验证

启动本地后端后，可以运行：

```bash
npm run verify:industry
```

脚本会只读请求 `/industry/diagnostics`、`/customers` 和 `/memories`，检查客户是否混入其他行业、行业记忆过滤是否正确、全局记忆是否未带行业标签。

## 演示数据

启动本地后端后，可以运行：

```bash
npm run seed:industry-demo
```

脚本会通过 HTTP API 写入少量电商/科技演示客户、行业记忆和一条全局记忆，便于演示行业切换后的数据隔离效果。脚本使用固定客户 `id` 和记忆 `mem_id`，可重复执行；如只想预览请求内容，可运行：

```bash
node scripts/seed-industry-demo.mjs --dry-run
```

如需清理这些演示数据：

```bash
npm run clear:industry-demo
```


