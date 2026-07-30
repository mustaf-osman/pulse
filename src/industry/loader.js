// 行业包加载器 - 启动时扫描 src/industry-packs/*.json，加载到内存
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getConfig, setConfig } from '../db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKS_DIR = path.join(__dirname, '..', 'industry-packs')
const KNOWLEDGE_DIR = path.join(PACKS_DIR, 'knowledge')

const CFG_ENABLED = 'industry.enabled'      // JSON 数组，启用的行业 id 列表
const CFG_ACTIVE  = 'industry.active'        // 当前选中的行业 id
const CFG_ONBOARDED = 'industry.onboarded'   // '1' 表示已完成首次引导

let _packs = null  // { tech: {...}, ecommerce: {...} }

function loadPackKnowledge(packId) {
  const dir = path.join(KNOWLEDGE_DIR, packId)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(file => /\.(md|txt)$/i.test(file) && !file.startsWith('_'))
    .sort()
    .map(file => {
      try {
        const fullPath = path.join(dir, file)
        const content = fs.readFileSync(fullPath, 'utf-8').trim()
        if (!content) return null
        const id = path.basename(file, path.extname(file))
        return {
          id,
          title: content.match(/^#\s+(.+)$/m)?.[1]?.trim() || id,
          file,
          content,
        }
      } catch (e) {
        console.warn('[industry] 知识文件读取失败:', packId, file, e.message)
        return null
      }
    })
    .filter(Boolean)
}

function loadPacks() {
  if (_packs) return _packs
  _packs = {}
  if (!fs.existsSync(PACKS_DIR)) {
    console.warn('[industry] 行业包目录不存在:', PACKS_DIR)
    return _packs
  }
  const files = fs.readdirSync(PACKS_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'))
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(PACKS_DIR, file), 'utf-8')
      const pack = JSON.parse(raw)
      if (!pack.id) { console.warn('[industry] 跳过无 id 的包:', file); continue }
      pack.knowledge = loadPackKnowledge(pack.id)
      _packs[pack.id] = pack
    } catch (e) {
      console.warn('[industry] 解析失败:', file, e.message)
    }
  }
  console.log('[industry] 已加载行业包:', Object.keys(_packs).join(', '))
  return _packs
}

export function listPacks() {
  return Object.values(loadPacks()).sort((a, b) => {
    const ao = Number.isFinite(a.order) ? a.order : 999
    const bo = Number.isFinite(b.order) ? b.order : 999
    if (ao !== bo) return ao - bo
    return String(a.name || a.id).localeCompare(String(b.name || b.id), 'zh-Hans-CN')
  })
}

export function getPack(id) {
  return loadPacks()[id] || null
}

export function getEnabledIndustries() {
  const raw = getConfig(CFG_ENABLED)
  if (!raw) return []
  try { return JSON.parse(raw) || [] } catch { return [] }
}

export function setEnabledIndustries(ids) {
  if (!Array.isArray(ids)) ids = []
  setConfig(CFG_ENABLED, JSON.stringify(ids))
  // 若当前 active 不在 enabled 列表中，切换为第一个
  const active = getActiveIndustry()
  if (active && !ids.includes(active)) {
    setActiveIndustry(ids[0] || null)
  }
}

export function getActiveIndustry() {
  return getConfig(CFG_ACTIVE) || null
}

export function setActiveIndustry(id) {
  if (id === null || id === undefined) {
    setConfig(CFG_ACTIVE, '')
    return
  }
  if (!getPack(id)) {
    console.warn('[industry] 试图切换到未知行业:', id)
    return
  }
  setConfig(CFG_ACTIVE, String(id))
}

export function getActivePack() {
  const id = getActiveIndustry()
  return id ? getPack(id) : null
}

export function isOnboarded() {
  return getConfig(CFG_ONBOARDED) === '1'
}

export function markOnboarded() {
  setConfig(CFG_ONBOARDED, '1')
}

export function setOnboarded(value) {
  setConfig(CFG_ONBOARDED, value ? '1' : '0')
}

// 给前端用：返回当前状态全貌
export function getIndustryState() {
  return {
    onboarded: isOnboarded(),
    enabled: getEnabledIndustries(),
    active: getActiveIndustry(),
    activePack: getActivePack(),
    allPacks: listPacks().map(p => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      tagline: p.tagline,
      category: p.category || 'sales_growth',
      categoryLabel: p.categoryLabel || '',
      order: Number.isFinite(p.order) ? p.order : 999,
      knowledgeCount: Array.isArray(p.knowledge) ? p.knowledge.length : 0
    }))
  }
}
