// 能力扩展路线表（NewPulse 2026-05+）
// 用于后台 /capabilities/roadmap 暴露当前已落地与计划接入的本地能力扩展模块。
// 这些是“产品能力”，不是 LLM 工具调用；逐步接入时只需把 status 改为 "ready" 即可。

import { getActivityTrackerStatus } from '../activity/tracker.js'
import { getVoiceStatus } from '../voice/manager.js'

function activityCapability() {
  const status = getActivityTrackerStatus()
  return {
    id: 'activity_watch',
    name: 'ActivityWatch 思路 · 工作活动记录',
    summary: '本地采集前台软件、窗口标题、空闲状态，形成员工/个人工作时间轴，作为老板报表与主动提醒的依据。',
    status: status?.running ? 'ready' : 'planned',
    runtime: {
      enabled: Boolean(status?.config?.trackingEnabled),
      running: Boolean(status?.running),
      sampleIntervalMs: status?.config?.sampleIntervalMs || 0,
    },
    privacy: '本地优先；不记录键盘输入；不读取聊天正文；员工可见。',
  }
}

function voiceCapability() {
  const voice = getVoiceStatus()
  return {
    id: 'voice_local_whisper',
    name: '本地 Whisper 语音引擎',
    summary: '离线语音输入，避免云端 ASR 上传敏感语音。配合现有云端 ASR 双链路。',
    status: voice?.status === 'running' ? 'ready' : (voice?.status === 'starting' ? 'starting' : 'planned'),
    runtime: {
      port: voice?.port,
      status: voice?.status,
      message: voice?.message,
    },
    privacy: '完全本地；模型缓存在用户机器；不上传音频。',
  }
}

function planned(id, name, summary, extra = {}) {
  return {
    id,
    name,
    summary,
    status: 'planned',
    runtime: null,
    privacy: extra.privacy || '本地优先；用户可控。',
    notes: extra.notes || '',
  }
}

export function getCapabilityRoadmap() {
  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    capabilities: [
      activityCapability(),
      voiceCapability(),
      planned(
        'document_ingestion',
        '文档解析 · markitdown/docling/pdf.js',
        '让 NewPulse 能吃 PDF / Word / Excel / Markdown，沉淀客户合同、报价、行业知识。',
        { notes: '准备适配层 src/knowledge/document-loader.js，先支持 .md/.txt，再接 PDF。' },
      ),
      planned(
        'memory_vector',
        '语义记忆 · sqlite-vec',
        '基于现有 SQLite 增加向量列，做语义记忆/客户/行业知识检索，不引入新数据库。',
        { notes: '入口在 src/memory/injector.js，可逐条 mem_id 增加 embedding。' },
      ),
      planned(
        'screen_ocr',
        '屏幕 OCR · PaddleOCR/RapidOCR',
        '配合活动追踪输出可解释的工作内容，员工可见，不长期保存原图。',
        { privacy: '只保存结构化结论；员工可见；不读取聊天正文。' },
      ),
      planned(
        'workflow_rules',
        '轻量主动规则引擎',
        '把“客户 7 天没跟进就提醒我”“12 点没吃饭就关心一下”做成可配置规则，配合主动助手。',
        { notes: '基于现有 proactive-assistant.js + personal-data-profile.js 扩展。' },
      ),
    ],
  }
}
