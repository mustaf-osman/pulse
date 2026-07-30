import { API } from './api-client.js'

function $(id) { return document.getElementById(id) }

const UNSUPPORTED_FILE_RE = /\.(doc|pdf|xls|ppt|pptx)$/i
const SUPPORTED_OFFICE_FILE_RE = /\.(docx|xlsx)$/i

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

async function fetchJson(path, options = {}) {
  const res = await fetch(`${API}${path}`, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

function bytesToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function extractOfficeWithBackend(file, feedback) {
  if (feedback) feedback.textContent = '本地解析未完成，正在用后端解析…'
  const bytes = new Uint8Array(await file.arrayBuffer())
  const data = await fetchJson('/reading/documents/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceName: file.name,
      dataBase64: bytesToBase64(bytes),
    }),
  })
  return { content: data.content || '', sourceName: data.sourceName || file.name, sourceType: data.sourceType || 'file' }
}

function readUint16(view, offset) {
  return view.getUint16(offset, true)
}

function readUint32(view, offset) {
  return view.getUint32(offset, true)
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('当前运行环境暂不支持解压 Office 文件，请先另存为 TXT/CSV 或复制正文粘贴。')
  }
  for (const format of ['deflate-raw', 'deflate']) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    } catch {}
  }
  throw new Error('Office 文件解压失败，请先另存为 TXT/CSV 或复制正文粘贴。')
}

async function readZipEntries(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i -= 1) {
    if (readUint32(view, i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('无法识别 Office 文件结构。')
  const total = readUint16(view, eocd + 10)
  let offset = readUint32(view, eocd + 16)
  const decoder = new TextDecoder('utf-8')
  const entries = new Map()
  for (let i = 0; i < total; i += 1) {
    if (readUint32(view, offset) !== 0x02014b50) break
    const method = readUint16(view, offset + 10)
    const compressedSize = readUint32(view, offset + 20)
    const nameLength = readUint16(view, offset + 28)
    const extraLength = readUint16(view, offset + 30)
    const commentLength = readUint16(view, offset + 32)
    const localOffset = readUint32(view, offset + 42)
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength))
    const localNameLength = readUint16(view, localOffset + 26)
    const localExtraLength = readUint16(view, localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const compressed = bytes.slice(dataStart, dataStart + compressedSize)
    let data
    if (method === 0) data = compressed
    else if (method === 8) data = await inflateRaw(compressed)
    else data = new Uint8Array()
    entries.set(name.replace(/\\/g, '/'), data)
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function parseXml(text) {
  return new DOMParser().parseFromString(text, 'application/xml')
}

function nodesByLocalName(root, localName) {
  return Array.from(root.getElementsByTagName('*')).filter((node) => node.localName === localName)
}

function textFromNode(node) {
  return nodesByLocalName(node, 't').map((item) => item.textContent || '').join('')
}

async function extractDocxText(file) {
  const entries = await readZipEntries(file)
  const documentXml = entries.get('word/document.xml')
  if (!documentXml) throw new Error('未找到 Word 正文内容。')
  const xml = parseXml(new TextDecoder('utf-8').decode(documentXml))
  const paragraphs = nodesByLocalName(xml, 'p')
    .map((node) => textFromNode(node).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const text = paragraphs.join('\n')
  if (!text) throw new Error('没有从 Word 文档中提取到可读文本。')
  return text
}

function readSharedStrings(entries) {
  const shared = entries.get('xl/sharedStrings.xml')
  if (!shared) return []
  const xml = parseXml(new TextDecoder('utf-8').decode(shared))
  return nodesByLocalName(xml, 'si').map((node) => textFromNode(node))
}

function readSheetNames(entries) {
  const workbook = entries.get('xl/workbook.xml')
  if (!workbook) return []
  const xml = parseXml(new TextDecoder('utf-8').decode(workbook))
  return nodesByLocalName(xml, 'sheet').map((node) => node.getAttribute('name') || '').filter(Boolean)
}

async function extractXlsxText(file) {
  const entries = await readZipEntries(file)
  const sharedStrings = readSharedStrings(entries)
  const sheetNames = readSheetNames(entries)
  const decoder = new TextDecoder('utf-8')
  const sheets = Array.from(entries.keys()).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort()
  const sections = sheets.map((name, index) => {
    const xml = parseXml(decoder.decode(entries.get(name)))
    const lines = nodesByLocalName(xml, 'row').map((row) => {
      const cells = nodesByLocalName(row, 'c').map((cell) => {
        const type = cell.getAttribute('t') || ''
        const valueNode = nodesByLocalName(cell, 'v')[0]
        if (type === 's') return sharedStrings[Number(valueNode?.textContent || 0)] || ''
        if (type === 'inlineStr') return textFromNode(cell)
        return valueNode?.textContent || ''
      })
      return cells.join('\t').trim()
    }).filter(Boolean)
    const title = sheetNames[index] || `Sheet${index + 1}`
    return [`# ${title}`, ...lines].join('\n')
  }).filter((section) => section.trim())
  const text = sections.join('\n\n')
  if (!text) throw new Error('没有从 Excel 文档中提取到可读文本。')
  return text
}

async function readImportedFile(file, feedback) {
  const sourceName = file.name
  if (/\.docx$/i.test(sourceName)) {
    if (feedback) feedback.textContent = '正在解析 Word 文档…'
    try {
      return { content: await extractDocxText(file), sourceName, sourceType: 'docx' }
    } catch {
      return extractOfficeWithBackend(file, feedback)
    }
  }
  if (/\.xlsx$/i.test(sourceName)) {
    if (feedback) feedback.textContent = '正在解析 Excel 表格…'
    try {
      return { content: await extractXlsxText(file), sourceName, sourceType: 'xlsx' }
    } catch {
      return extractOfficeWithBackend(file, feedback)
    }
  }
  if (SUPPORTED_OFFICE_FILE_RE.test(sourceName)) {
    throw new Error('Office 文档解析失败，请先另存为 TXT/CSV 或复制正文粘贴。')
  }
  if (UNSUPPORTED_FILE_RE.test(sourceName)) {
    throw new Error('当前还不能直接解析 PDF/PPT/旧版 Office，请先另存为 TXT/CSV 或复制正文粘贴。')
  }
  return { content: await file.text(), sourceName, sourceType: 'file' }
}

function renderReadingDocuments(docs = []) {
  const list = $('reading-list')
  if (!list) return
  if (!docs.length) {
    list.innerHTML = '<div class="ar-empty ar-empty-inline">还没有导入文档。</div>'
    return
  }
  list.innerHTML = docs.map((doc) => `
    <article class="nimo-reading-item">
      <div class="nimo-reading-item-head">
        <strong>${escapeHtml(doc.title || '未命名文档')}</strong>
        <span>${Number(doc.charCount || 0)} 字</span>
      </div>
      <p>${escapeHtml(doc.summary || '暂无摘要')}</p>
      <div class="nimo-reading-item-foot">
        <div class="nimo-reading-item-meta">${escapeHtml(doc.sourceName || doc.sourceType || 'paste')} · ${escapeHtml(doc.updatedAt || doc.createdAt || '')}</div>
        <button type="button" class="nimo-reading-delete" data-reading-delete="${Number(doc.id || 0)}">删除</button>
      </div>
    </article>
  `).join('')
}

async function refreshReadingDocuments() {
  const data = await fetchJson('/reading/documents?limit=20')
  renderReadingDocuments(data.documents || [])
}

async function importReadingDocument() {
  const fileInput = $('reading-file')
  const titleInput = $('reading-title')
  const contentInput = $('reading-content')
  const feedback = $('reading-feedback')
  const button = $('reading-import')
  const file = fileInput?.files?.[0] || null
  let content = contentInput?.value || ''
  let sourceName = ''
  let sourceType = 'paste'
  if (file) {
    try {
      const parsed = await readImportedFile(file, feedback)
      sourceName = parsed.sourceName
      sourceType = parsed.sourceType
      content = parsed.content
    } catch (err) {
      if (feedback) feedback.textContent = err.message
      if (fileInput) fileInput.value = ''
      return
    }
  }
  content = String(content || '').trim()
  if (!content) {
    if (feedback) feedback.textContent = '请先选择文本文件或粘贴内容。'
    return
  }
  if (button) button.disabled = true
  if (feedback) feedback.textContent = '正在导入并总结…'
  try {
    const result = await fetchJson('/reading/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: titleInput?.value || sourceName || '',
        content,
        sourceName,
        sourceType,
        summarize: true,
      }),
    })
    if (contentInput) contentInput.value = ''
    if (fileInput) fileInput.value = ''
    if (titleInput) titleInput.value = ''
    if (feedback) feedback.textContent = `已导入：${result.document?.title || '文档'}`
    await refreshReadingDocuments()
  } catch (err) {
    if (feedback) feedback.textContent = `导入失败：${err.message}`
  } finally {
    if (button) button.disabled = false
  }
}

async function deleteReadingDocument(id) {
  const safeId = Number(id || 0)
  if (!safeId) return
  const feedback = $('reading-feedback')
  if (!confirm('确定删除这份导入文档吗？')) return
  try {
    await fetchJson(`/reading/documents/${safeId}`, { method: 'DELETE' })
    if (feedback) feedback.textContent = '文档已删除。'
    await refreshReadingDocuments()
  } catch (err) {
    if (feedback) feedback.textContent = `删除失败：${err.message}`
  }
}

export function initReadingDocumentsView() {
  $('reading-refresh')?.addEventListener('click', () => refreshReadingDocuments().catch((err) => alert(err.message)))
  $('reading-import')?.addEventListener('click', () => importReadingDocument().catch((err) => alert(err.message)))
  $('reading-list')?.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-reading-delete]')
    if (!button) return
    deleteReadingDocument(button.dataset.readingDelete)
  })
  window.addEventListener('nimo:reading-document-changed', () => refreshReadingDocuments().catch(() => {}))
  window.addEventListener('pulse:view-changed', (event) => {
    if (event.detail?.view === 'reading') refreshReadingDocuments().catch(() => {})
  })
  refreshReadingDocuments().catch(() => {})
}
