// 客户档案存储 — 持久化到 data/customers.json
import fs from 'fs'
import path from 'path'
import { paths } from './paths.js'
import { getActiveIndustry, getActivePack, listPacks } from './industry/loader.js'

const STORE_FILE = path.join(paths.dataDir, 'customers.json')
const CURRENT_FILE = path.join(paths.dataDir, 'current-customer.json')

function readJsonSafe(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback
    const raw = fs.readFileSync(file, 'utf-8')
    return JSON.parse(raw)
  } catch (e) {
    console.warn('[customers] 读取失败:', file, e.message)
    return fallback
  }
}

function writeJsonSafe(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.warn('[customers] 写入失败:', file, e.message)
  }
}

function normalizeIndustryId(industryId) {
  const value = String(industryId || '').trim()
  return value || null
}

function getIndustryMeta(industryId = null) {
  const id = normalizeIndustryId(industryId) || getActiveIndustry()
  const pack = id ? getActivePack() : null
  return {
    id: id || '',
    name: pack?.id === id ? (pack.name || '') : '',
    icon: pack?.id === id ? (pack.icon || '') : '',
  }
}

function inferIndustryId(customer) {
  if (customer?.industryId) return customer.industryId
  const name = String(customer?.industryName || '').trim()
  if (!name) return ''
  const pack = listPacks().find(p => p.name === name || p.id === name)
  return pack?.id || ''
}

function readCustomersWithMigration() {
  const all = readJsonSafe(STORE_FILE, [])
  let changed = false
  const migrated = all.map(customer => {
    if (customer?.industryId) return customer
    const industryId = inferIndustryId(customer)
    if (!industryId) return customer
    changed = true
    return { ...customer, industryId }
  })
  if (changed) writeJsonSafe(STORE_FILE, migrated)
  return migrated
}

export function listCustomers({ industryId = getActiveIndustry(), includeGlobal = false } = {}) {
  const all = readCustomersWithMigration()
  const id = normalizeIndustryId(industryId)
  if (!id) return all
  return all.filter(c => c.industryId === id || (includeGlobal && !c.industryId))
}

export function getCustomer(id, { industryId = getActiveIndustry(), includeGlobal = false } = {}) {
  return listCustomers({ industryId, includeGlobal }).find(c => c.id === id) || null
}

export function saveCustomer(customer, options = {}) {
  const all = readCustomersWithMigration()
  const now = new Date().toISOString()
  let saved
  const industry = getIndustryMeta(customer.industryId || options.industryId)
  const normalizedCustomer = {
    ...customer,
    industryId: customer.industryId || industry.id,
    industryName: customer.industryName || industry.name,
    industryIcon: customer.industryIcon || industry.icon,
  }

  if (normalizedCustomer.id) {
    // 更新
    const idx = all.findIndex(c => c.id === normalizedCustomer.id)
    if (idx >= 0) {
      saved = { ...all[idx], ...normalizedCustomer, updatedAt: now }
      all[idx] = saved
    } else {
      saved = { ...normalizedCustomer, createdAt: now, updatedAt: now }
      all.unshift(saved)
    }
  } else {
    saved = {
      ...normalizedCustomer,
      id: 'cust_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      createdAt: now,
      updatedAt: now,
    }
    all.unshift(saved)
  }

  // 最多保存 500 条
  const trimmed = all.slice(0, 500)
  writeJsonSafe(STORE_FILE, trimmed)

  // 默认自动设为当前客户；可通过 options.setCurrent = false 关闭
  if (options.setCurrent !== false) {
    setCurrentCustomerId(saved.id)
  }
  return saved
}

export function deleteCustomer(id, { industryId = getActiveIndustry(), includeGlobal = false } = {}) {
  const scopedIndustryId = normalizeIndustryId(industryId)
  const all = readCustomersWithMigration().filter(c => {
    if (c.id !== id) return true
    if (!scopedIndustryId) return false
    return !(c.industryId === scopedIndustryId || (includeGlobal && !c.industryId))
  })
  writeJsonSafe(STORE_FILE, all)
  if (getCurrentCustomerId() === id) setCurrentCustomerId(null)
}

export function getCurrentCustomerId() {
  const data = readJsonSafe(CURRENT_FILE, { id: null })
  return data.id || null
}

export function setCurrentCustomerId(id) {
  writeJsonSafe(CURRENT_FILE, { id: id || null, updatedAt: new Date().toISOString() })
}

export function getCurrentCustomer() {
  const id = getCurrentCustomerId()
  return id ? getCustomer(id) : null
}

// ── 给 AI 上下文用：把当前客户格式化成可读文本 ───────────────
export function buildCurrentCustomerContext() {
  const current = getCurrentCustomer()
  if (!current || !current.fields) return ''

  const fields = current.fields
  const lines = []
  for (const [key, value] of Object.entries(fields)) {
    if (value === '' || value === null || value === undefined) continue
    if (Array.isArray(value) && value.length === 0) continue
    const displayValue = Array.isArray(value) ? value.join(' / ') : String(value)
    // key 是机器名（如 company_name），用 label 更友好
    const label = current.fieldLabels?.[key] || key
    lines.push(`- ${label}: ${displayValue}`)
  }

  if (lines.length === 0) return ''

  const industryTag = current.industryIcon && current.industryName
    ? `${current.industryIcon} ${current.industryName}`
    : (current.industryName || '')

  return `## 当前正在跟进的客户${industryTag ? '（' + industryTag + '）' : ''}

用户当前打开了一份客户档案，以下是已知信息：
${lines.join('\n')}

聊天中如涉及此客户，请：
1. 默认你已经知道这些信息，不要重复问已知字段
2. 如果有重要字段仍空缺，可以在合适时机自然地补问
3. 给出的建议（跟进策略、话术）要结合上述客户特征`
}
