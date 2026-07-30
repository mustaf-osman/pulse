#!/usr/bin/env node

const DEFAULT_API = 'http://127.0.0.1:3721'
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const apiArg = args.find((arg) => arg !== '--dry-run')
const apiBase = String(process.env.PULSE_API_URL || apiArg || DEFAULT_API).replace(/\/$/, '')

const customerIds = [
  'demo_ecom_luna_shop',
  'demo_ecom_senmu_food',
  'demo_tech_cloudnova',
  'demo_tech_orbit_crm',
]

const memoryIds = new Set([
  'demo_memory_ecommerce_roi',
  'demo_memory_ecommerce_after_sales',
  'demo_memory_tech_poc',
  'demo_memory_tech_roles',
  'demo_memory_global_followup_rule',
])

async function requestJson(path, options = {}) {
  if (dryRun && options.method === 'DELETE') {
    console.log(`[dry-run] DELETE ${path}`)
    return { ok: true, dryRun: true }
  }
  const res = await fetch(`${apiBase}${path}`, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) throw new Error(`${path} -> ${res.status}: ${data.error || res.statusText}`)
  return data
}

async function deleteCustomers() {
  for (const id of customerIds) {
    await requestJson(`/customers/${encodeURIComponent(id)}`, { method: 'DELETE' })
    console.log(`${dryRun ? '-' : '✓'} ${dryRun ? 'would delete' : 'deleted'} customer ${id}`)
  }
}

async function deleteMemories() {
  if (dryRun) {
    for (const id of memoryIds) console.log(`[dry-run] DELETE memory with mem_id ${id}`)
    return
  }
  const data = await requestJson('/memories?scope=all&search=%E6%BC%94%E7%A4%BA&limit=100')
  const rows = Array.isArray(data.memories) ? data.memories : Array.isArray(data) ? data : []
  const targets = rows.filter((memory) => memoryIds.has(memory.mem_id))
  const missing = [...memoryIds].filter((id) => !targets.some((memory) => memory.mem_id === id))
  for (const memory of targets) {
    await requestJson(`/memories/${encodeURIComponent(memory.id)}`, { method: 'DELETE' })
    console.log(`✓ deleted memory ${memory.mem_id}`)
  }
  for (const id of missing) {
    console.log(`- memory not found ${id}`)
  }
}

async function main() {
  console.log(`Clear industry demo data: ${apiBase}${dryRun ? ' (dry-run)' : ''}`)
  await deleteCustomers()
  await deleteMemories()
  console.log(dryRun ? '\nIndustry demo clear dry-run completed.' : '\nIndustry demo data cleared.')
}

main().catch((error) => {
  console.error(`Clear industry demo data failed: ${error.message}`)
  console.error('Make sure the local backend is running, or pass an API URL:')
  console.error('  node scripts/clear-industry-demo.mjs http://127.0.0.1:3721')
  process.exitCode = 1
})
