import { WeChatClient } from 'wechat-ilink-client'
import { getClawbotCredentials, setClawbotCredentials, clearClawbotCredentials, getClawbotSeenMessageIds, setClawbotSeenMessageIds } from '../config.js'

let client = null
let currentQrUrl = null   // set during login, cleared after scan
let clawbotStatus = 'idle' // idle | qr_pending | connected | error
let clawbotError = ''
let qrReadyTimer = null
const contextTokens = new Map()
const seenMessageIds = new Set()
const recentMessageKeys = new Map()
const SEEN_MESSAGE_LIMIT = 1000
const RECENT_DUP_WINDOW_MS = 8000
const STARTUP_GRACE_MS = 3000
let connectorStartedAt = 0

function rememberMessage(id) {
  if (!id) return false
  if (seenMessageIds.has(id)) return false
  seenMessageIds.add(id)
  if (seenMessageIds.size > SEEN_MESSAGE_LIMIT) {
    const first = seenMessageIds.values().next().value
    if (first) seenMessageIds.delete(first)
  }
  setClawbotSeenMessageIds([...seenMessageIds])
  return true
}

function hydrateSeenMessageIds() {
  seenMessageIds.clear()
  for (const id of getClawbotSeenMessageIds()) {
    if (id) seenMessageIds.add(String(id))
  }
}

function rememberRecentMessage(userId, text) {
  const key = `${userId || ''}:${String(text || '').trim()}`
  if (!key.trim()) return false
  const now = Date.now()
  const last = recentMessageKeys.get(key) || 0
  recentMessageKeys.set(key, now)
  for (const [k, ts] of recentMessageKeys) {
    if (now - ts > RECENT_DUP_WINDOW_MS) recentMessageKeys.delete(k)
  }
  return now - last > RECENT_DUP_WINDOW_MS
}

function clearQrReadyTimer() {
  if (qrReadyTimer) {
    clearTimeout(qrReadyTimer)
    qrReadyTimer = null
  }
}

// Called by dispatch.js to send replies back to WeChat
export async function sendClawbotMessage(userId, content) {
  if (!client || clawbotStatus !== 'connected') {
    return { ok: false, reason: 'wechat-clawbot not connected' }
  }
  try {
    const contextToken = contextTokens.get(userId)
    await client.sendText(userId, content, contextToken)
    return { ok: true, platform: 'wechat-clawbot' }
  } catch (err) {
    console.error(`[ClawBot] sendText 失败: ${err.message}`)
    return { ok: false, error: err.message }
  }
}

// Called by api.js for GET /social/wechat-clawbot/qr
export function getClawbotQR() {
  return { status: clawbotStatus, qr_url: currentQrUrl, error: clawbotError }
}

// Called by api.js for POST /social/wechat-clawbot/logout
export function logoutClawbot() {
  clearClawbotCredentials()
  clearQrReadyTimer()
  clawbotStatus = 'idle'
  clawbotError = ''
  currentQrUrl = null
  try { client?.stop?.() } catch {}
  client = null
}

export function startClawbotConnector({ pushMessage, emitEvent } = {}) {
  const saved = getClawbotCredentials()
  clawbotError = ''
  connectorStartedAt = Date.now()
  hydrateSeenMessageIds()

  try {
    client = new WeChatClient(saved ? {
      accountId: saved.accountId,
      token: saved.botToken,
      baseUrl: saved.baseUrl,
    } : {})
  } catch (err) {
    clawbotStatus = 'error'
    clawbotError = err?.message || '微信连接器初始化失败'
    emitEvent?.('social_status', { platform: 'wechat-clawbot', status: 'error', error: clawbotError })
    throw err
  }

  client.on('message', (msg) => {
    if (msg.message_type && msg.message_type !== 1) return
    if (msg.message_state && msg.message_state !== 2) return
    const msgTime = Number(msg.create_time_ms || msg.update_time_ms || 0)
    if (msgTime && msgTime < connectorStartedAt - STARTUP_GRACE_MS) return
    const dedupeId = String(msg.message_id || msg.msg_id || msg.seq || `${msg.from_user_id || ''}:${msg.create_time_ms || ''}:${msg.update_time_ms || ''}`).trim()
    if (!rememberMessage(dedupeId)) return
    const text = WeChatClient.extractText?.(msg) ?? extractText(msg)
    if (!text) return
    if (!rememberRecentMessage(msg.from_user_id, text)) return
    if (msg.from_user_id && msg.context_token) {
      contextTokens.set(msg.from_user_id, msg.context_token)
    }
    const fromId = `wechat:clawbot:${msg.from_user_id}`
    pushMessage(fromId, text, 'WECHAT_CLAWBOT', {
      social: { platform: 'wechat-clawbot', user_id: msg.from_user_id },
    })
    emitEvent?.('message_in', {
      from_id: fromId,
      content: text,
      channel: 'WECHAT_CLAWBOT',
      timestamp: new Date().toISOString(),
    })
  })

  client.on('error', (err) => {
    console.error(`[ClawBot] 错误: ${err.message}`)
    clawbotStatus = 'error'
    clawbotError = err?.message || '微信连接器错误'
    emitEvent?.('social_status', { platform: 'wechat-clawbot', status: 'error', error: clawbotError })
  })

  client.on('sessionExpired', () => {
    console.warn('[ClawBot] 会话已过期，请重新扫码登录')
    clearClawbotCredentials()
    clawbotStatus = 'idle'
    clawbotError = '会话已过期，请重新扫码登录'
    emitEvent?.('social_status', { platform: 'wechat-clawbot', status: 'session_expired' })
  })

  if (!saved) {
    // 首次登录：发起扫码流程
    clawbotStatus = 'qr_pending'
    console.log('[ClawBot] 未找到已保存凭证，开始扫码登录...')
    emitEvent?.('social_status', { platform: 'wechat-clawbot', status: 'qr_pending' })
    clearQrReadyTimer()
    qrReadyTimer = setTimeout(() => {
      if (clawbotStatus === 'qr_pending' && !currentQrUrl) {
        clawbotStatus = 'error'
        clawbotError = '二维码生成超时：无法连接微信 iLink 登录服务，请检查网络或稍后重试'
        emitEvent?.('social_status', { platform: 'wechat-clawbot', status: 'error', error: clawbotError })
      }
    }, 20000)

    client.login({
      onQRCode(url) {
        clearQrReadyTimer()
        currentQrUrl = url
        clawbotStatus = 'qr_ready'
        console.log(`[ClawBot] 二维码已就绪，请在设置面板扫码`)
        emitEvent?.('social_status', { platform: 'wechat-clawbot', status: 'qr_ready', qr_url: url })
      },
    }).then(result => {
      clearQrReadyTimer()
      currentQrUrl = null
      clawbotStatus = 'connected'
      setClawbotCredentials({
        accountId: result.accountId,
        botToken: result.botToken,
        baseUrl: result.baseUrl,
      })
      console.log(`[ClawBot] 扫码登录成功，已保存凭证`)
      emitEvent?.('social_status', { platform: 'wechat-clawbot', status: 'connected', accountId: result.accountId })
      client.start().catch(err => console.error(`[ClawBot] start 失败: ${err.message}`))
    }).catch(err => {
      clearQrReadyTimer()
      clawbotStatus = 'error'
      clawbotError = err?.message || '扫码登录失败'
      console.error(`[ClawBot] 扫码登录失败: ${clawbotError}`)
      emitEvent?.('social_status', { platform: 'wechat-clawbot', status: 'error', error: clawbotError })
    })
  } else {
    // 凭证已存，直接启动
    clawbotStatus = 'connected'
    console.log(`[ClawBot] 使用已保存凭证启动（accountId: ${saved.accountId}）`)
    emitEvent?.('social_status', { platform: 'wechat-clawbot', status: 'connected', accountId: saved.accountId })
    client.start().catch(err => {
      console.error(`[ClawBot] start 失败: ${err.message}`)
      clawbotStatus = 'error'
      clawbotError = err?.message || '微信连接启动失败'
      emitEvent?.('social_status', { platform: 'wechat-clawbot', status: 'error', error: clawbotError })
    })
  }

  return {
    platform: 'wechat-clawbot',
    stop() {
      clearQrReadyTimer()
      clawbotStatus = 'idle'
      clawbotError = ''
      try { client?.stop?.() } catch {}
    },
  }
}

// 从消息结构中提取文本（兼容 extractText 未导出的情况）
function extractText(msg) {
  if (!msg) return ''
  const items = msg.item_list || msg.itemList || []
  for (const item of items) {
    if (item.type === 1 || item.type === 'text') {
      return item.text_item?.text || item.textItem?.text || ''
    }
  }
  return ''
}
