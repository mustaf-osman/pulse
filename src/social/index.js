import { startDiscordConnector } from './discord.js'
import { startClawbotConnector } from './wechat-clawbot.js'

const running = new Map() // platform → connector

function areSocialConnectorsEnabled() {
  const raw = String(globalThis.process?.env?.PULSE_ENABLE_SOCIAL_CONNECTORS || '').trim()
  if (/^(0|false|no|off)$/i.test(raw)) return false
  return true
}

export async function startSocialConnectors({ pushMessage, emitEvent } = {}) {
  if (!areSocialConnectorsEnabled()) {
    emitEvent?.('social_status', { status: 'disabled', reason: 'social connectors are disabled in product-safe mode' })
    return []
  }

  const starters = [
    { platform: 'discord', start: () => startDiscordConnector({ pushMessage, emitEvent }) },
    { platform: 'wechat-clawbot', start: () => startClawbotConnector({ pushMessage, emitEvent }) },
  ]

  for (const { platform, start } of starters) {
    try {
      const connector = await start()
      if (connector) {
        running.set(platform, connector)
        emitEvent?.('social_status', { platform, status: 'started' })
      }
    } catch (error) {
      console.error(`[social] ${platform} connector failed to start: ${error.message}`)
      emitEvent?.('social_status', { status: 'start_error', platform, error: error.message })
    }
  }

  return [...running.values()]
}

// 热重启单个平台连接器（用于设置界面保存 token 后立即生效）
export async function restartConnector(platform, { pushMessage, emitEvent } = {}) {
  if (!areSocialConnectorsEnabled()) {
    emitEvent?.('social_status', { status: 'disabled', platform, reason: 'social connectors are disabled in product-safe mode' })
    return { ok: false, status: 'disabled', error: 'social connectors are disabled in product-safe mode' }
  }

  const existing = running.get(platform)
  if (existing) {
    try { existing.stop() } catch {}
    running.delete(platform)
  }

  const starters = {
    discord: () => startDiscordConnector({ pushMessage, emitEvent }),
    'wechat-clawbot': () => startClawbotConnector({ pushMessage, emitEvent }),
  }

  const start = starters[platform]
  if (!start) return { ok: false, status: 'unknown_platform', error: `unknown social platform: ${platform}` }

  try {
    const connector = await start()
    if (connector) {
      running.set(platform, connector)
      emitEvent?.('social_status', { platform, status: 'restarted' })
    }
    return { ok: true, status: 'restarted', platform }
  } catch (error) {
    console.error(`[social] ${platform} restart failed: ${error.message}`)
    emitEvent?.('social_status', { status: 'start_error', platform, error: error.message })
    return { ok: false, status: 'start_error', platform, error: error.message }
  }
}
