import { buildSystemPrompt } from './prompt.js'
import { runInjector, formatMemoriesForPrompt, formatTaskKnowledge } from './memory/injector.js'
import { gatherContext, formatExtraContext } from './context/gatherer.js'
import { getConfig, getKnownEntities, getOrInitBirthTime } from './db.js'
import { formatTick, describeExistence } from './time.js'
import { getActivePack } from './industry/loader.js'

function cloneStateSnapshot(stateSnapshot = {}) {
  return {
    action: stateSnapshot.action || null,
    task: stateSnapshot.task || null,
    prev_recall: stateSnapshot.prev_recall || null,
    lastToolResult: stateSnapshot.lastToolResult || null,
    sessionCounter: stateSnapshot.sessionCounter || 0,
    recentActions: Array.isArray(stateSnapshot.recentActions) ? [...stateSnapshot.recentActions] : [],
    thoughtStack: Array.isArray(stateSnapshot.thoughtStack) ? [...stateSnapshot.thoughtStack] : [],
  }
}

function itemLabel(item) {
  if (typeof item === 'string') return item
  if (!item || typeof item !== 'object') return ''
  const name = item.name || item.title || item.id || ''
  const focus = item.focus || item.description || item.trigger || ''
  const outputs = Array.isArray(item.outputs) && item.outputs.length ? `；输出：${item.outputs.join('、')}` : ''
  return `${name}${focus ? `：${focus}` : ''}${outputs}`.trim()
}

function formatNamedItems(title, items = [], limit = 8) {
  if (!Array.isArray(items) || !items.length) return ''
  const lines = items
    .slice(0, limit)
    .map(itemLabel)
    .filter(Boolean)
    .map(line => `- ${line}`)
    .join('\n')
  return lines ? `### ${title}\n${lines}` : ''
}

function formatWorkflows(workflows = [], limit = 6) {
  if (!Array.isArray(workflows) || !workflows.length) return ''
  const lines = workflows
    .slice(0, limit)
    .map(workflow => {
      if (typeof workflow === 'string') return `- ${workflow}`
      const name = workflow?.name || workflow?.title || workflow?.id || ''
      const steps = Array.isArray(workflow?.steps) ? workflow.steps.join(' → ') : ''
      const output = workflow?.output ? `；输出：${workflow.output}` : ''
      return `- ${name}${steps ? `：${steps}` : ''}${output}`
    })
    .filter(Boolean)
    .join('\n')
  return lines ? `### 行业工作流\n${lines}` : ''
}

function formatIndustryCapabilityContext(pack) {
  if (!pack) return ''
  const parts = [
    formatNamedItems('行业对象', pack.domainObjects, 10),
    formatNamedItems('专家角色', pack.experts, 10),
    formatNamedItems('可用 Skill', pack.skills, 12),
    formatWorkflows(pack.workflows, 8),
    formatNamedItems('安全边界', pack.safety, 10),
  ].filter(Boolean)
  if (!parts.length) return ''
  return `## 行业能力包（${pack.name}）\n${parts.join('\n\n')}\n\n使用原则：优先判断用户当前问题属于哪个行业对象和 Skill，再给出该行业真实可执行的专业流程；不要把所有行业都套成客户跟进或销售 CRM。`
}

function industryObjectSubject(pack) {
  const map = {
    ecommerce: '店铺、商品、订单、私域客户或售后问题',
    tech: '客户公司、线索、Demo、POC 或解决方案项目',
    education: '学生、班级、课程、知识点、题目或错题',
    fitness: '训练者、会员、训练目标、动作、饮食或体测记录',
    pharma: '适应症、靶点、药物类型、研发项目、文献或临床方案',
    food: '食品产品、配方、批次、渠道、客诉或动销问题',
    tourism: '目的地、行程、预算、同行人、签证材料或出行风险',
    usedcar: '车辆、车型、车况、试驾、置换或金融方案',
    pet: '宠物、主人、护理周期、疫苗驱虫、寄养或用品复购',
    legal: '当事人、案情、合同、证据、期限或法律文书',
    agriculture: '农户、基地、作物、地块、农资、农时或病虫害风险',
  }
  return map[pack?.id] || '行业对象、客户、项目、产品或服务事项'
}

export async function buildHeartbeatSystemPromptPreview({
  stateSnapshot = {},
  message = formatTick(),
} = {}) {
  const workingState = cloneStateSnapshot(stateSnapshot)
  const injection = await runInjector({ message, state: workingState })
  const directions = [...(injection.directions || [])]
  const memoriesText = formatMemoriesForPrompt(injection.memories, injection.recallMemories)
  const directionsText = directions.join('\n')
  const taskKnowledgeText = formatTaskKnowledge(injection.taskKnowledge)

  let extraContextText = ''
  if (workingState.task) {
    const extraContext = await gatherContext({
      task: workingState.task,
      taskKnowledge: taskKnowledgeText,
      memories: memoriesText,
      message,
    })
    extraContextText = formatExtraContext(extraContext)
  }

  let persona = getConfig('persona') || ''
  const industryPack = getActivePack()
  const isCasualMode = !industryPack
  if (industryPack?.aiPersona) {
    persona = persona
      ? `${persona}\n\n## 行业角色\n${industryPack.aiPersona}`
      : `## 行业角色\n${industryPack.aiPersona}`
  }
  const industryCapabilityContext = formatIndustryCapabilityContext(industryPack)
  if (industryCapabilityContext) {
    persona = persona
      ? `${persona}\n\n${industryCapabilityContext}`
      : industryCapabilityContext
  }
  if (isCasualMode) {
    const casualRole = `## 闲聊模式

你当前处于闲聊模式，是通用陪聊和个人助手，不属于任何行业工作台。
不要自称电商、二手车、销售、客户跟进或任何行业助手。
不要主动套用客户档案、销售跟进、商机提醒、行业热点、行业雷达等工作台逻辑。
如果历史对话里出现过行业助手身份、客户跟进或销售场景，那是旧模式残留，当前必须忽略并纠正为闲聊模式。
当用户问“你是谁/你干嘛的/你是什么模式”时，回答你是 Pulse 的闲聊模式，可以轻松聊天、陪用户梳理想法、做日常问答和个人陪伴。
只有当用户明确要求切换到行业/客户工作场景时，才讨论客户、行业或跟进。`
    persona = persona
      ? `${persona}\n\n${casualRole}`
      : casualRole
  }
  if (industryPack?.customerFields?.length) {
    const subjectLabel = industryObjectSubject(industryPack)
    const fieldLines = industryPack.customerFields
      .map(f => {
        const opts = Array.isArray(f.options) && f.options.length
          ? `（可选项：${f.options.join(' / ')}）`
          : ''
        const req = f.required ? '【必填】' : ''
        return `- ${f.label}${req}${opts}`
      })
      .join('\n')
    const customerRule = `## 行业对象档案规则（${industryPack.name}行业）

当用户提到具体${subjectLabel}时，如果你还不清楚以下关键信息，请主动用自然口吻一次性问 2-3 个最关键的（不要一口气全问，那样烦人）：

${fieldLines}

询问原则：
1. 不要每次都问，只在用户首次提到这个对象/项目/客户、或信息明显缺失时问。
2. 用当前行业自然会说的话问，不要用表单口吻。比如教育问年级/学科/知识点，制药问适应症/靶点/研发阶段，健身问目标/基础/限制；不要把所有行业都问成销售客户字段。
3. 用户回答后，简短确认一句"记下了"即可，不要重复全部信息。
4. 如果用户没回答某些字段，不要追问 - 尊重用户节奏。`
    persona = persona
      ? `${persona}\n\n${customerRule}`
      : customerRule
  }
  const agentName = isCasualMode ? 'Pulse' : (getConfig('agent_name') || 'Pulse')
  const industryName = industryPack?.name || ''
  const entities = getKnownEntities()
  const birthTime = getOrInitBirthTime()

  const systemPrompt = buildSystemPrompt({
    agentName,
    industryName,
    persona,
    memories: memoriesText,
    directions: directionsText,
    constraints: injection.constraints || [],
    conversationWindow: injection.conversationWindow || [],
    personMemory: injection.personMemory || null,
    thoughtStack: workingState.thoughtStack || [],
    entities,
    recentActions: workingState.recentActions || [],
    actionLog: injection.actionLog || [],
    hasActiveTask: !!workingState.task,
    task: workingState.task || null,
    taskKnowledge: taskKnowledgeText,
    extraContext: extraContextText,
    lastToolResult: injection.lastToolResult || null,
    existenceDesc: describeExistence(birthTime),
  })

  return {
    message,
    systemPrompt,
    injection: {
      directions,
      tools: injection.tools || [],
      constraints: injection.constraints || [],
      conversationWindow: injection.conversationWindow || [],
      personMemory: injection.personMemory || null,
      actionLog: injection.actionLog || [],
      lastToolResult: injection.lastToolResult || null,
      memories: injection.memories || [],
      recallMemories: injection.recallMemories || [],
      taskKnowledge: injection.taskKnowledge || [],
    },
    stateSnapshot: workingState,
    derived: {
      memoriesText,
      directionsText,
      taskKnowledgeText,
      extraContextText,
    },
  }
}
