#!/usr/bin/env node

const DEFAULT_API = 'http://127.0.0.1:3721'
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const apiArg = args.find((arg) => arg !== '--dry-run')
const apiBase = String(process.env.PULSE_API_URL || apiArg || DEFAULT_API).replace(/\/$/, '')

const industries = [
  {
    id: 'ecommerce',
    name: '电商',
    icon: '🛒',
    customers: [
      {
        id: 'demo_ecom_luna_shop',
        displayName: '鹿鸣美妆旗舰店',
        fields: {
          shop_name: '鹿鸣美妆旗舰店',
          contact_person: '林女士',
          contact_phone: '13800010001',
          platforms: ['抖音', '小红书'],
          stage: '重点跟进',
          pain_points: ['投流 ROI 下降', '复购低'],
          next_follow_at: nextDate(2),
        },
      },
      {
        id: 'demo_ecom_senmu_food',
        displayName: '森木零食铺',
        fields: {
          shop_name: '森木零食铺',
          contact_person: '周老板',
          contact_phone: '13800010002',
          platforms: ['淘宝', '拼多多'],
          stage: '方案沟通',
          pain_points: ['库存周转慢', '客单价低'],
          next_follow_at: nextDate(5),
        },
      },
    ],
    memories: [
      {
        mem_id: 'demo_memory_ecommerce_roi',
        title: '电商客户关注投流 ROI',
        content: '电商客户在咨询增长方案时，通常会优先追问投流 ROI、转化率、客单价和退货率，建议回答时先给诊断顺序，再给可执行动作。',
        detail: '用于演示电商行业记忆隔离。',
      },
      {
        mem_id: 'demo_memory_ecommerce_after_sales',
        title: '电商售后先安抚再处理',
        content: '电商售后场景中，如果客户反馈物流慢、质量问题或差评风险，应先安抚情绪，再收集证据并给出补发、换货或退款方案。',
        detail: '用于演示电商行业客服记忆。',
      },
    ],
  },
  {
    id: 'tech',
    name: '科技',
    icon: '💻',
    customers: [
      {
        id: 'demo_tech_cloudnova',
        displayName: 'CloudNova 智能云',
        fields: {
          company_name: 'CloudNova 智能云',
          contact_person: '陈 CTO',
          contact_phone: '13900020001',
          decision_role: 'CTO',
          stage: 'POC',
          decision_cycle: '1 月内',
          requirements: '希望验证私有化部署、权限集成和稳定性。',
          next_follow_at: nextDate(3),
        },
      },
      {
        id: 'demo_tech_orbit_crm',
        displayName: 'OrbitCRM 增长团队',
        fields: {
          company_name: 'OrbitCRM 增长团队',
          contact_person: '王总',
          contact_phone: '13900020002',
          decision_role: 'CEO',
          stage: 'Demo',
          decision_cycle: '1 季度',
          requirements: '关注销售线索转化、Demo 后跟进和团队协同。',
          next_follow_at: nextDate(6),
        },
      },
    ],
    memories: [
      {
        mem_id: 'demo_memory_tech_poc',
        title: '科技客户 POC 要先定义验收标准',
        content: '科技 B2B 客户进入 POC 前，需要明确数据样本、性能指标、验收负责人、成功标准和下一步商务动作，避免只验证功能不推进签约。',
        detail: '用于演示科技行业方案记忆。',
      },
      {
        mem_id: 'demo_memory_tech_roles',
        title: '科技销售按角色表达价值',
        content: '面向 CEO 讲 ROI 和风险，面向 CTO 讲架构、安全和集成成本，面向使用部门讲效率提升和操作路径。',
        detail: '用于演示科技行业销售记忆。',
      },
    ],
  },
]

const globalMemories = [
  {
    mem_id: 'demo_memory_global_followup_rule',
    title: '通用跟进原则',
    content: '无论哪个行业，客户跟进都应记录当前阶段、关键异议、下一步动作、负责人和明确日期。',
    detail: '用于演示全局记忆在各行业都可见。',
    tags: ['demo', 'global'],
  },
]

function nextDate(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

async function postJson(path, body) {
  if (dryRun) {
    console.log(`[dry-run] POST ${path}`, JSON.stringify(body))
    return { ok: true, dryRun: true }
  }
  const res = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) throw new Error(`${path} -> ${res.status}: ${data.error || res.statusText}`)
  return data
}

async function seedCustomers(industry) {
  for (const customer of industry.customers) {
    const body = {
      ...customer,
      industryId: industry.id,
      industryName: industry.name,
      industryIcon: industry.icon,
      setCurrent: false,
      fieldLabels: {
        shop_name: '店铺名称',
        company_name: '公司名称',
        contact_person: '联系人',
        contact_phone: '联系电话',
        platforms: '平台',
        stage: '阶段',
        pain_points: '痛点',
        decision_role: '决策角色',
        decision_cycle: '决策周期',
        requirements: '需求',
        next_follow_at: '下次跟进日期',
      },
    }
    await postJson('/customers', body)
    console.log(`✓ customer ${customer.id}`)
  }
}

async function seedMemories(industry) {
  for (const memory of industry.memories) {
    await postJson('/memories', {
      ...memory,
      event_type: 'knowledge',
      tags: ['demo', `industry:${industry.id}`],
    })
    console.log(`✓ memory ${memory.mem_id}`)
  }
}

async function seedGlobalMemories() {
  for (const memory of globalMemories) {
    await postJson('/memories', {
      ...memory,
      event_type: 'knowledge',
    })
    console.log(`✓ global memory ${memory.mem_id}`)
  }
}

async function main() {
  console.log(`Seed industry demo data: ${apiBase}${dryRun ? ' (dry-run)' : ''}`)
  await postJson('/industry/enabled', { ids: industries.map((item) => item.id) })
  for (const industry of industries) {
    await seedCustomers(industry)
    await seedMemories(industry)
  }
  await seedGlobalMemories()
  await postJson('/industry/active', { id: industries[0].id })
  console.log('\nIndustry demo data seeded. Run `npm run verify:industry` after this to verify isolation.')
}

main().catch((error) => {
  console.error(`Seed industry demo data failed: ${error.message}`)
  console.error('Make sure the local backend is running, or pass an API URL:')
  console.error('  node scripts/seed-industry-demo.mjs http://127.0.0.1:3721')
  process.exitCode = 1
})
