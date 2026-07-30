// 公司与员工资料存储（轻量本地 JSON）
import fs from 'fs'
import path from 'path'
import { paths } from './paths.js'
import { getActiveIndustry, getPack } from './industry/loader.js'

const COMPANY_FILE = path.join(paths.dataDir, 'company-profile.json')
const EMPLOYEE_FILE = path.join(paths.dataDir, 'employees.json')

function normalizeIndustryId(industryId = getActiveIndustry()) {
  return String(industryId || '').trim()
}

function industryMeta(industryId = getActiveIndustry()) {
  const id = normalizeIndustryId(industryId)
  const pack = id ? getPack(id) : null
  return {
    id,
    name: pack?.name || '',
    icon: pack?.icon || '',
  }
}

function legacyBelongsToIndustry(row, industryId) {
  if (!row || !industryId) return false
  if (row.industryId) return row.industryId === industryId
  return Array.isArray(row.moduleIds) && row.moduleIds.includes(industryId)
}

function readJsonSafe(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (e) {
    console.warn('[org-profile] 读取失败:', file, e.message)
    return fallback
  }
}

function writeJsonSafe(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.warn('[org-profile] 写入失败:', file, e.message)
  }
}

export function getCompanyProfile({ industryId = getActiveIndustry() } = {}) {
  const raw = readJsonSafe(COMPANY_FILE, {})
  const industry = industryMeta(industryId)
  const scoped = industry.id && raw?.byIndustry && typeof raw.byIndustry === 'object'
    ? raw.byIndustry[industry.id] || {}
    : (legacyBelongsToIndustry(raw, industry.id) ? raw : {})
  return {
    industryId: industry.id,
    industryName: scoped.industryName || industry.name,
    industryIcon: scoped.industryIcon || industry.icon,
    name: scoped.name || '',
    shortName: scoped.shortName || '',
    ownerName: scoped.ownerName || '',
    phone: scoped.phone || '',
    website: scoped.website || '',
    address: scoped.address || '',
    notes: scoped.notes || '',
    moduleIds: Array.isArray(scoped.moduleIds) ? scoped.moduleIds : [],
    createdAt: scoped.createdAt || '',
    updatedAt: scoped.updatedAt || '',
  }
}

export function saveCompanyProfile(payload = {}, { industryId = payload.industryId || getActiveIndustry() } = {}) {
  const industry = industryMeta(industryId)
  if (!industry.id) throw new Error('请先选择行业模块')
  const raw = readJsonSafe(COMPANY_FILE, {})
  const byIndustry = raw?.byIndustry && typeof raw.byIndustry === 'object' ? raw.byIndustry : {}
  const prev = getCompanyProfile({ industryId: industry.id })
  const now = new Date().toISOString()
  const next = {
    ...prev,
    industryId: industry.id,
    industryName: industry.name,
    industryIcon: industry.icon,
    name: String(payload.name || '').trim(),
    shortName: String(payload.shortName || '').trim(),
    ownerName: String(payload.ownerName || '').trim(),
    phone: String(payload.phone || '').trim(),
    website: String(payload.website || '').trim(),
    address: String(payload.address || '').trim(),
    notes: String(payload.notes || '').trim(),
    moduleIds: Array.isArray(payload.moduleIds) ? payload.moduleIds.filter(Boolean) : prev.moduleIds,
    createdAt: prev.createdAt || now,
    updatedAt: now,
  }
  writeJsonSafe(COMPANY_FILE, { byIndustry: { ...byIndustry, [industry.id]: next } })
  return next
}

export function listEmployees({ industryId = getActiveIndustry() } = {}) {
  const rows = readJsonSafe(EMPLOYEE_FILE, [])
  if (!Array.isArray(rows)) return []
  const industry = industryMeta(industryId)
  if (!industry.id) return []
  return rows
    .filter((r) => legacyBelongsToIndustry(r, industry.id))
    .map((r) => ({
      id: r.id || '',
      industryId: r.industryId || industry.id,
      industryName: r.industryName || industry.name,
      industryIcon: r.industryIcon || industry.icon,
      name: r.name || '',
      role: r.role || '',
      phone: r.phone || '',
      email: r.email || '',
      moduleIds: Array.isArray(r.moduleIds) ? r.moduleIds : [],
      notes: r.notes || '',
      createdAt: r.createdAt || '',
      updatedAt: r.updatedAt || '',
    }))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
}

export function saveEmployee(payload = {}, { industryId = payload.industryId || getActiveIndustry() } = {}) {
  const all = readJsonSafe(EMPLOYEE_FILE, [])
  const rows = Array.isArray(all) ? all : []
  const industry = industryMeta(industryId)
  if (!industry.id) throw new Error('请先选择行业模块')
  const now = new Date().toISOString()
  let saved = null
  const clean = {
    industryId: industry.id,
    industryName: industry.name,
    industryIcon: industry.icon,
    name: String(payload.name || '').trim(),
    role: String(payload.role || '').trim(),
    phone: String(payload.phone || '').trim(),
    email: String(payload.email || '').trim(),
    moduleIds: Array.isArray(payload.moduleIds) ? payload.moduleIds.filter(Boolean) : [],
    notes: String(payload.notes || '').trim(),
  }
  if (!clean.name) throw new Error('员工姓名不能为空')

  if (payload.id) {
    const idx = rows.findIndex((r) => r.id === payload.id && legacyBelongsToIndustry(r, industry.id))
    if (idx >= 0) {
      saved = { ...rows[idx], ...clean, updatedAt: now }
      rows[idx] = saved
    } else {
      saved = {
        id: String(payload.id),
        ...clean,
        createdAt: now,
        updatedAt: now,
      }
      rows.unshift(saved)
    }
  } else {
    saved = {
      id: `emp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...clean,
      createdAt: now,
      updatedAt: now,
    }
    rows.unshift(saved)
  }

  writeJsonSafe(EMPLOYEE_FILE, rows.slice(0, 500))
  return saved
}

export function deleteEmployee(id, { industryId = getActiveIndustry() } = {}) {
  const industry = normalizeIndustryId(industryId)
  const rows = readJsonSafe(EMPLOYEE_FILE, [])
  const all = (Array.isArray(rows) ? rows : []).filter((r) => !(r.id === id && legacyBelongsToIndustry(r, industry)))
  writeJsonSafe(EMPLOYEE_FILE, all)
}

export function buildCompanyWorkspaceContext({ industryId = getActiveIndustry() } = {}) {
  const company = getCompanyProfile({ industryId })
  const employees = listEmployees({ industryId })
  const hasCompany = company.name || company.shortName
  const hasEmployees = employees.length > 0
  if (!hasCompany && !hasEmployees) return ''

  const lines = []
  if (hasCompany) {
    lines.push('## 用户公司资料')
    if (company.name) lines.push(`- 公司全称: ${company.name}`)
    if (company.shortName) lines.push(`- 公司简称: ${company.shortName}`)
    if (company.ownerName) lines.push(`- 负责人: ${company.ownerName}`)
    if (company.phone) lines.push(`- 联系电话: ${company.phone}`)
    if (company.website) lines.push(`- 官网: ${company.website}`)
    if (company.address) lines.push(`- 地址: ${company.address}`)
    if (company.moduleIds.length) lines.push(`- 业务模块: ${company.moduleIds.join(' / ')}`)
    if (company.notes) lines.push(`- 备注: ${company.notes}`)
  }
  if (hasEmployees) {
    lines.push('\n## 团队成员')
    employees.slice(0, 8).forEach((e) => {
      const role = e.role ? `（${e.role}）` : ''
      const mods = e.moduleIds?.length ? ` · 模块: ${e.moduleIds.join('/')}` : ''
      lines.push(`- ${e.name}${role}${mods}`)
    })
  }
  return lines.join('\n')
}

