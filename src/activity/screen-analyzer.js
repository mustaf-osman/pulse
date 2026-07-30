import { execFile } from 'child_process'
import { promisify } from 'util'
import { config } from '../config.js'
import { classifyProcess, CATEGORY_META } from './app-catalog.js'

const execFileAsync = promisify(execFile)

const COMMUNICATION_KEYWORDS = /(微信|wechat|企业微信|wecom|飞书|lark|钉钉|dingtalk|qq|slack|discord|teams|telegram)/i
const SENSITIVE_KEYWORDS = /(密码|password|登录|login|身份证|银行卡|实名|手机号|验证码|otp|银行)/i

function foregroundText(foreground = {}) {
  return [foreground.appName, foreground.processName, foreground.windowTitle].filter(Boolean).join(' ')
}

export function heuristicScreenAnalysis(foreground = {}) {
  const classification = classifyProcess(foreground.processName, foreground.appName)
  const meta = CATEGORY_META[classification.category] || CATEGORY_META.unknown

  const activityType = classification.categoryLabel || meta.label || '未分类'
  const workRelated = classification.workRelated ?? null
  const riskLevel = classification.risk || meta.risk || 'medium'
  const matched = Boolean(classification.matched)

  let confidence = matched ? 0.78 : 0.42
  if (matched && (classification.category === 'browser' || classification.category === 'unknown')) {
    confidence = 0.55
  }

  const text = foregroundText(foreground)
  const sensitiveDetected = COMMUNICATION_KEYWORDS.test(text) || SENSITIVE_KEYWORDS.test(text)

  let summary
  if (workRelated === false) {
    summary = `进程"${classification.name}"被归为${activityType}，默认不计入有效工作时长`
  } else if (workRelated === true) {
    summary = `进程"${classification.name}"被归为${activityType}，计入有效工作时长`
  } else {
    summary = `进程"${classification.name}"未被分类，等待 AI 视觉判断或手工标注`
  }

  return {
    provider: 'heuristic',
    model: 'app-catalog',
    workRelated,
    activityType,
    category: classification.category,
    confidence,
    riskLevel,
    summary,
    sensitiveDetected,
    raw: {
      foreground: {
        appName: foreground.appName || '',
        processName: foreground.processName || '',
        windowTitle: foreground.windowTitle || '',
      },
      catalog: { matched, category: classification.category },
    },
  }
}

async function captureScreenBase64(maxWidth = 900) {
  if (process.platform !== 'win32') return null

  const width = Math.max(320, Math.min(1400, Number(maxWidth || 900)))
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bounds.Size)
$target = $bitmap
if ($bitmap.Width -gt ${width}) {
  $ratio = ${width} / $bitmap.Width
  $height = [int]($bitmap.Height * $ratio)
  $target = New-Object System.Drawing.Bitmap ${width}, $height
  $tg = [System.Drawing.Graphics]::FromImage($target)
  $tg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $tg.DrawImage($bitmap, 0, 0, ${width}, $height)
  $tg.Dispose()
}
$ms = New-Object System.IO.MemoryStream
$target.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
[Convert]::ToBase64String($ms.ToArray())
$ms.Dispose()
if ($target -ne $bitmap) { $target.Dispose() }
$graphics.Dispose()
$bitmap.Dispose()
`

  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 8000,
    maxBuffer: 12 * 1024 * 1024,
  })
  const b64 = String(stdout || '').trim()
  return b64 || null
}

function extractJsonObject(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  try { return JSON.parse(raw) } catch {}
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[0]) } catch {}
  return null
}

function normalizeAiResult(parsed, foreground, model, rawText) {
  const fallback = heuristicScreenAnalysis(foreground)
  return {
    provider: 'openai-compatible',
    model,
    workRelated: typeof parsed?.workRelated === 'boolean' ? parsed.workRelated : fallback.workRelated,
    activityType: String(parsed?.activityType || fallback.activityType).slice(0, 80),
    confidence: Math.max(0, Math.min(1, Number(parsed?.confidence ?? fallback.confidence))),
    riskLevel: ['low', 'medium', 'high'].includes(String(parsed?.riskLevel || '').toLowerCase())
      ? String(parsed.riskLevel).toLowerCase()
      : fallback.riskLevel,
    summary: String(parsed?.summary || fallback.summary).slice(0, 240),
    sensitiveDetected: Boolean(parsed?.sensitiveDetected ?? fallback.sensitiveDetected),
    raw: parsed || { text: rawText },
  }
}

function resolveVisionConfig(options = {}) {
  const provider = String(options.provider || config.provider || '').toLowerCase()
  const envKey = process.env.OPENAI_API_KEY || process.env.PULSE_ACTIVITY_AI_API_KEY || ''
  const apiKey = String(options.apiKey || envKey || (provider === 'openai' || provider === 'custom' ? config.apiKey : '') || '').trim()
  const baseURL = String(options.baseURL || process.env.PULSE_ACTIVITY_AI_BASE_URL || (provider === 'custom' ? config.baseURL : '') || '').trim()
  const model = String(options.model || process.env.PULSE_ACTIVITY_AI_MODEL || 'gpt-4o-mini').trim()
  return { apiKey, baseURL, model }
}

export async function analyzeCurrentScreen({ foreground = {}, options = {} } = {}) {
  const vision = resolveVisionConfig(options)
  if (!vision.apiKey) return heuristicScreenAnalysis(foreground)

  let imageBase64 = null
  try {
    imageBase64 = await captureScreenBase64(options.maxWidth || 900)
  } catch (err) {
    return {
      ...heuristicScreenAnalysis(foreground),
      provider: 'heuristic-after-capture-error',
      raw: { error: err?.message || String(err) },
    }
  }
  if (!imageBase64) return heuristicScreenAnalysis(foreground)

  try {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({
      apiKey: vision.apiKey,
      baseURL: vision.baseURL || undefined,
      timeout: 30000,
    })
    const completion = await client.chat.completions.create({
      model: vision.model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: '你是企业授权场景下的屏幕工作状态分类器。不要复述或提取聊天正文、密码、个人隐私，只输出工作类型、风险等级和简短判断。必须返回 JSON。',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `请结合截图和前台窗口元数据判断当前是否工作相关。只返回 JSON：{"workRelated":boolean,"activityType":"客户沟通/文档处理/数据分析/研发/设计/会议/娱乐/非工作/其他","confidence":0-1,"riskLevel":"low|medium|high","summary":"不超过60字","sensitiveDetected":boolean}。前台信息：${JSON.stringify(foreground)}`,
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${imageBase64}` },
            },
          ],
        },
      ],
    })
    const text = completion?.choices?.[0]?.message?.content || ''
    const parsed = extractJsonObject(text)
    return normalizeAiResult(parsed, foreground, vision.model, text)
  } catch (err) {
    const message = String(err?.message || err || '')
    const networkLike = /network|fetch failed|timeout|ETIMEDOUT|ECONN|ENOTFOUND|EAI_AGAIN|socket|TLS|certificate/i.test(message)
    return {
      ...heuristicScreenAnalysis(foreground),
      provider: networkLike ? 'heuristic-after-network-error' : 'heuristic-after-ai-error',
      riskLevel: networkLike ? 'medium' : heuristicScreenAnalysis(foreground).riskLevel,
      summary: networkLike
        ? 'AI 屏幕分类联网失败，本次使用本地软件目录兜底判断'
        : heuristicScreenAnalysis(foreground).summary,
      raw: { error: message, reason: networkLike ? 'network_offline' : 'ai_error' },
    }
  }
}
