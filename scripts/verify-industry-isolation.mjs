#!/usr/bin/env node

const DEFAULT_API = 'http://127.0.0.1:3721'
const apiBase = String(process.env.PULSE_API_URL || process.argv[2] || DEFAULT_API).replace(/\/$/, '')

const failures = []

function pass(message) {
  console.log(`✓ ${message}`)
}

function fail(message) {
  failures.push(message)
  console.error(`✗ ${message}`)
}

function warn(message) {
  console.warn(`! ${message}`)
}

async function getJson(path) {
  const res = await fetch(`${apiBase}${path}`)
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`)
  return res.json()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function tagsOf(memory) {
  try {
    const parsed = JSON.parse(memory.tags || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function industryTag(memory) {
  return tagsOf(memory).find((tag) => typeof tag === 'string' && tag.startsWith('industry:')) || ''
}

async function verifyIndustryCustomers(industry) {
  const data = await getJson(`/customers?industry=${encodeURIComponent(industry.id)}`)
  const rows = asArray(data.customers || data)
  const wrong = rows.filter((customer) => customer.industryId && customer.industryId !== industry.id)
  if (wrong.length) {
    fail(`${industry.name || industry.id}: /customers 返回了其他行业客户 ${wrong.map((c) => c.id).join(', ')}`)
  } else {
    pass(`${industry.name || industry.id}: 客户列表未混入其他行业客户 (${rows.length})`)
  }
}

async function verifyIndustryMemories(industry) {
  const data = await getJson(`/memories?scope=industry&industry=${encodeURIComponent(industry.id)}`)
  const rows = asArray(data.memories || data)
  const wrong = rows.filter((memory) => industryTag(memory) !== `industry:${industry.id}`)
  if (wrong.length) {
    fail(`${industry.name || industry.id}: scope=industry 返回了非本行业记忆 ${wrong.map((m) => m.id).join(', ')}`)
  } else {
    pass(`${industry.name || industry.id}: 仅行业记忆过滤正确 (${rows.length})`)
  }
}

async function verifyCurrentScope(industry) {
  const data = await getJson(`/memories?scope=current&industry=${encodeURIComponent(industry.id)}`)
  const rows = asArray(data.memories || data)
  const wrong = rows.filter((memory) => {
    const tag = industryTag(memory)
    return tag && tag !== `industry:${industry.id}`
  })
  if (wrong.length) {
    fail(`${industry.name || industry.id}: scope=current 混入了其他行业记忆 ${wrong.map((m) => m.id).join(', ')}`)
  } else {
    pass(`${industry.name || industry.id}: 当前行业+全局记忆过滤正确 (${rows.length})`)
  }
}

async function verifyGlobalMemories() {
  const data = await getJson('/memories?scope=global')
  const rows = asArray(data.memories || data)
  const wrong = rows.filter((memory) => !!industryTag(memory))
  if (wrong.length) {
    fail(`scope=global 返回了行业记忆 ${wrong.map((m) => m.id).join(', ')}`)
  } else {
    pass(`全局记忆过滤正确 (${rows.length})`)
  }
}

async function main() {
  console.log(`Industry isolation verification: ${apiBase}`)
  const diag = await getJson('/industry/diagnostics')
  const industries = asArray(diag.industries)
  if (!industries.length) {
    fail('/industry/diagnostics 没有返回 industries')
  } else {
    pass(`/industry/diagnostics 返回 ${industries.length} 个行业`)
  }

  if (!diag.active) warn('当前没有 active industry')
  if (diag.global && Number.isFinite(diag.global.memoryCount)) {
    pass(`全局记忆统计可用 (${diag.global.memoryCount})`)
  } else {
    fail('/industry/diagnostics 缺少 global.memoryCount')
  }

  for (const industry of industries) {
    await verifyIndustryCustomers(industry)
    await verifyIndustryMemories(industry)
    await verifyCurrentScope(industry)
    if (!Number.isFinite(industry.customerCount)) fail(`${industry.id}: diagnostics.customerCount 不是数字`)
    if (!Number.isFinite(industry.memoryCount)) fail(`${industry.id}: diagnostics.memoryCount 不是数字`)
    if (!Number.isFinite(industry.knowledgeCount)) fail(`${industry.id}: diagnostics.knowledgeCount 不是数字`)
  }

  await verifyGlobalMemories()

  if (failures.length) {
    console.error(`\nFailed ${failures.length} check(s):`)
    for (const item of failures) console.error(`- ${item}`)
    process.exitCode = 1
    return
  }
  console.log('\nAll industry isolation checks passed.')
}

main().catch((error) => {
  console.error(`Industry isolation verification failed: ${error.message}`)
  console.error('Make sure the local backend is running, or pass an API URL:')
  console.error('  node scripts/verify-industry-isolation.mjs http://127.0.0.1:3721')
  process.exitCode = 1
})
