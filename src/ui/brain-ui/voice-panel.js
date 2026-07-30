// 声波点云球 + 云端 ASR 语音输入面板
// 云端 ASR（阿里云/腾讯云/讯飞），通过后端 WebSocket 代理
//
// 点云算法移植自 ACUI (Remix)/Voice Component.html

// ─── 球面采样（Fibonacci） ───
function fibSphere(n, radius) {
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    pts.push({ x: Math.cos(theta) * r * radius, y: y * radius, z: Math.sin(theta) * r * radius });
  }
  return pts;
}

const BASE_PTS  = fibSphere(3200, 1.0);
const BASE_PTS2 = fibSphere(1200, 0.88);

// ─── 正弦噪声 ───
function sn(x, y, z, t) {
  return (
    Math.sin(x * 2.3 + t * 1.1) * Math.cos(y * 1.9 + t * 0.8) * 0.38 +
    Math.sin(y * 3.1 + t * 1.4) * Math.cos(z * 2.7 + t * 0.6) * 0.30 +
    Math.sin(z * 1.7 + t * 0.9) * Math.cos(x * 3.3 + t * 1.2) * 0.30 +
    Math.sin(x * 5.1 + y * 4.3 + t * 2.1) * 0.14
  );
}

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpArr(a, b, t) { return a.map((v, i) => lerp(v, b[i], t)); }

// ─── 状态配置 ───
// idle = 麦克风关闭（灰色）  listening = 麦克风开启待命（白色）
// recognizing = 正在识别（蓝色）  done = 识别完成（绿色，2s 后回 listening）
// speaking = AI 正在说话（紫色，可打断）
const STATE_CFG = {
  idle:        { amp: 0.003, spd: 0.10, r: [50,68,80],    g: [50,68,80],    b: [55,73,85]   },
  listening:   { amp: 0.055, spd: 0.75, r: [185,215,245], g: [185,215,245], b: [195,225,255] },
  recognizing: { amp: 0.55,  spd: 4.50, r: [25,75,165],   g: [95,155,230],  b: [195,230,255] },
  done:        { amp: 0.10,  spd: 1.20, r: [30,105,65],   g: [145,200,135], b: [45,90,60]   },
  processing:  { amp: 0.15,  spd: 1.10, r: [100,60,200],  g: [80,60,180],   b: [220,190,255] },
  error:       { amp: 0.10,  spd: 0.70, r: [200,240,255], g: [20,30,40],    b: [20,30,40]   },
  event:       { amp: 0.60,  spd: 4.00, r: [255,200,50],  g: [200,160,30],  b: [50,80,150]   },
  speaking:    { amp: 0.09,  spd: 1.00, r: [130,95,185],  g: [105,80,170],  b: [225,200,255] },
};

// ─── 打断检测参数 ───
const BARGEIN_WARMUP_MS  = 600  // TTS 开始后前 600ms 不检测（等 AEC 适应）
const BARGEIN_FRAMES     = 8    // 需要连续 8 帧高振幅（约 130ms）才触发
const BARGEIN_THRESHOLD  = 0.09 // 振幅阈值（高于环境噪声和 AEC 残留）
// 4096 samples @ 16kHz = 256ms/块；保留 1500ms ≈ 6 块
const BARGEIN_PRE_BUFFER_MS   = 1500
const BARGEIN_MAX_CHUNKS      = Math.ceil(BARGEIN_PRE_BUFFER_MS * 16000 / 1000 / 4096)

// ─── 声音事件图标映射 ───
const SOUND_EVENT_ICONS = {
  clapping:        '👏',
  finger_snapping: '🤌',
  keyboard_typing: '⌨️',
  typing:          '⌨️',
  writing:         '✍️',
  footsteps:       '👟',
  walking:         '🚶',
  running:         '🏃',
  knock:           '🚪',
  knock_door:      '🚪',
};

const CLOUD_WS_URL  = 'ws://127.0.0.1:52557/voice/cloud';
const LOCAL_WS_URL  = 'ws://127.0.0.1:3723';
const VOICE_THRESHOLD_KEY = 'pulse-voice-threshold';
const VOICE_PROVIDER_KEY = 'pulse-voice-provider';
const VOICE_ENGINE_KEY = 'pulse-voice-engine';

// 从 localStorage 读取灵敏度阈值，支持运行时动态修改
function getVoiceThreshold() {
  return parseFloat(localStorage.getItem(VOICE_THRESHOLD_KEY) || '0.008');
}

// 派生阈值（ambient = near/2.67，和原始比例保持一致）
function getAmbientThreshold() { return getVoiceThreshold() * 0.375; }

function getVoiceEngine() {
  return localStorage.getItem(VOICE_ENGINE_KEY) || 'cloud';
}

function getVoiceWsUrl() {
  return getVoiceEngine() === 'local' ? LOCAL_WS_URL : CLOUD_WS_URL;
}

function isGarbledVoiceText(text) {
  if (!text) return false;
  if (/[�]/.test(text)) return true;
  const markers = text.match(/Ã|å|æ|ç|姝|濠|鍚|涓|绌|璇|鏄|妹|凛|錫|锡|濛/g) || [];
  return markers.length >= 2;
}

export function initVoicePanel({
  btnId, panelId, canvasId, statusId, transcriptId,
  getChatInput, getSendBtn, getSendMessage, getLang, getAutoSend,
}) {
  const btn        = document.getElementById(btnId);
  const panel      = document.getElementById(panelId);
  const canvas     = document.getElementById(canvasId);
  const transcript = document.getElementById(transcriptId);

  if (!panel || !canvas) return;

  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, cx = 0, cy = 0, scale = 0;

  function resizeCanvasToDisplay() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    const nextW = Math.max(1, Math.round(rect.width * dpr));
    const nextH = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
    W = nextW; H = nextH; cx = W / 2; cy = H / 2;
    scale = Math.min(W, H) * 0.34;
  }

  // ─── 渲染状态 ───
  let sk = 'idle';
  let animState = {
    amp: STATE_CFG.idle.amp, spd: STATE_CFG.idle.spd,
    col: [STATE_CFG.idle.r, STATE_CFG.idle.g, STATE_CFG.idle.b],
    t: 0, rotY: 0, rotX: 0.25,
  };
  let rafId = null;
  let eventFlashCount = 0;
  let doneTimer = null;

  function setStatus(newSk) { sk = newSk; }

  function triggerDone() {
    setStatus('done');
    if (doneTimer) clearTimeout(doneTimer);
    doneTimer = setTimeout(() => {
      doneTimer = null;
      if (sk === 'done') setStatus(micActive ? 'listening' : 'idle');
    }, 2000);
  }

  function drawFrame() {
    resizeCanvasToDisplay();
    const cfg = STATE_CFG[sk];
    const s = animState;
    const ls = 0.025;

    s.amp = lerp(s.amp, cfg.amp, ls * 8);
    s.spd = lerp(s.spd, cfg.spd, ls * 6);
    s.col = [
      lerpArr(s.col[0], cfg.r, ls * 1.5),
      lerpArr(s.col[1], cfg.g, ls * 1.5),
      lerpArr(s.col[2], cfg.b, ls * 1.5),
    ];

    if (micData) {
      micData.analyser.getByteFrequencyData(micData.dataArray);
      const sum = micData.dataArray.reduce((a, b) => a + b, 0);
      const vol = (sum / micData.dataArray.length) / 255;

      // 打断检测：TTS 播放中持续检测用户声音
      if (suspendedByMedia) {
        const aecReady = Date.now() - ttsStartTime > BARGEIN_WARMUP_MS;
        if (aecReady && vol > BARGEIN_THRESHOLD) {
          if (++bargeinFrames >= BARGEIN_FRAMES) {
            bargeinFrames = 0;
            window.stopTTS?.();
            resumeVoiceInputFromMedia();
          }
        } else {
          bargeinFrames = 0;
        }
      }

      if (vol > 0.02) {
        s.amp = lerp(s.amp, 0.08 + vol * 1.2, 0.4);
        s.spd = lerp(s.spd, 1.0 + vol * 5.0, 0.2);
        // speaking 状态下用户开口 → 视觉反馈但不覆盖状态（等 barge-in 触发后自然切换）
        if (sk !== 'recognizing' && sk !== 'event' && sk !== 'speaking')
          setStatus(vol > 0.15 ? 'recognizing' : 'listening');
        else if (sk === 'speaking' && vol > BARGEIN_THRESHOLD)
          setStatus('recognizing');
      } else if (sk !== 'idle' && sk !== 'event' && sk !== 'processing' && sk !== 'done' && sk !== 'speaking') {
        setStatus('idle');
      }
    }

    // 声音事件闪烁效果自动恢复
    if (sk === 'event') {
      eventFlashCount--;
      if (eventFlashCount <= 0) setStatus(micActive ? 'listening' : 'idle');
    }

    s.t += 0.016 * s.spd;

    ctx.clearRect(0, 0, W, H);

    // ─── Siri 流光丝带渲染 ───
    // 3 条彩色丝带（青蓝 / 蓝紫 / 粉），每条画两层：外发光 + 实线
    // 颜色取自 iOS Siri 经典配色：#5AC8FA · #7D5BEA · #FF4B91
    const RIBBONS = [
      { hue: '90, 200, 250',   freq: 2.1, phaseOff: 0.0, widthBase: 1.4 },
      { hue: '125, 91, 234',   freq: 2.7, phaseOff: 1.7, widthBase: 1.6 },
      { hue: '255, 75, 145',   freq: 1.9, phaseOff: 3.4, widthBase: 1.2 },
    ];
    const maxAmp = H * 0.32;
    const stepPx = Math.max(1, Math.round(W / 220));

    // 公共缓存：每条丝带的折线点
    const ribbonPoints = RIBBONS.map((r) => {
      const phase = s.t * (1.0 + r.freq * 0.18) + r.phaseOff;
      const ribbonAmp = maxAmp * Math.max(0.10, s.amp * 1.8);
      const pts = [];
      for (let x = 0; x <= W; x += stepPx) {
        const nx = x / W;
        const env = Math.sin(nx * Math.PI);
        let freqMod = 0;
        if (micData) {
          const bin = Math.min(micData.dataArray.length - 1, Math.floor(nx * micData.dataArray.length));
          freqMod = (micData.dataArray[bin] / 255) * 0.5;
        }
        const wave = Math.sin(nx * Math.PI * r.freq + phase) * 0.85
                   + Math.sin(nx * Math.PI * r.freq * 0.45 + phase * 0.7) * 0.35;
        pts.push({ x, y: cy + wave * ribbonAmp * env * (1 + freqMod) });
      }
      return pts;
    });

    // 第一遍：外发光（柔光、半透明）
    for (let i = 0; i < RIBBONS.length; i++) {
      const r = RIBBONS[i];
      const pts = ribbonPoints[i];
      const widthPx = r.widthBase * (W / 320) * (1 + s.amp * 0.6);
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${r.hue}, 0.18)`;
      ctx.lineWidth = widthPx * 3.0;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let j = 0; j < pts.length; j++) {
        if (j === 0) ctx.moveTo(pts[j].x, pts[j].y);
        else ctx.lineTo(pts[j].x, pts[j].y);
      }
      ctx.stroke();
    }
    // 第二遍：实线（细、高饱和）
    for (let i = 0; i < RIBBONS.length; i++) {
      const r = RIBBONS[i];
      const pts = ribbonPoints[i];
      const widthPx = r.widthBase * (W / 320) * (1 + s.amp * 0.6);
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${r.hue}, 0.95)`;
      ctx.lineWidth = widthPx;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let j = 0; j < pts.length; j++) {
        if (j === 0) ctx.moveTo(pts[j].x, pts[j].y);
        else ctx.lineTo(pts[j].x, pts[j].y);
      }
      ctx.stroke();
    }

    rafId = requestAnimationFrame(drawFrame);
  }

  // ─── 麦克风捕获（共用于两种模式） ───
  let micData = null;
  let micActive = false;
  let userWantedMic = false;
  let suspendedByMedia = false;
  let ttsStartTime = 0;
  let bargeinFrames = 0;
  let nearFieldGate = {
    noiseFloor: getAmbientThreshold(),
    nearChunks: 0,
    tailChunks: 0,
    ambientChunks: 0,
  };
  // Cloud 专用
  let cloudAudioCtx = null;
  let cloudProcessor = null;
  let cloudWs = null;
  // 打断预缓冲：TTS 期间把 PCM 写入环形缓冲，打断后一并发给 ASR
  let bargeinBuffer = []  // Int16Array 块的环形队列
  let bargeinBuffering = false // true = 正在 TTS，写缓冲而非发 WS
  // 自动发送防抖
  let lastTranscriptText = '';
  let autoSendTimer = null;

  async function startMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1,
        },
      });
      const actx = new (window.AudioContext || window.webkitAudioContext)();
      const src = actx.createMediaStreamSource(stream);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      src.connect(analyser);
      micData = { analyser, dataArray, stream, actx, src };
      nearFieldGate = { noiseFloor: getAmbientThreshold(), nearChunks: 0, tailChunks: 0, ambientChunks: 0 };
      return stream;
    } catch (e) {
      // 权限拒绝时球体变红，不在 transcript 显示文字
      setStatus('error');
      return null;
    }
  }

  function stopMic() {
    micData?.stream.getTracks().forEach(t => t.stop());
    micData = null;
  }

  function clearVoiceResidue({ clearInput = false } = {}) {
    const previousTranscript = lastTranscriptText;
    lastTranscriptText = '';
    if (transcript) transcript.textContent = '';
    document.querySelectorAll('.voice-transcript').forEach((el) => { el.textContent = ''; });
    if (!clearInput) return;
    const inputs = [
      getChatInput?.(),
      ...document.querySelectorAll('#chat-input, textarea, input[type="text"], [contenteditable="true"], .chat-input, .composer-input'),
    ].filter(Boolean);
    const garbledPattern = /�|Ã|å|æ|ç|姝|濠|鍚|涓|绌|璇|鏄|妹|凛|锡/;
    for (const input of inputs) {
      const isEditableText = input.isContentEditable;
      const value = isEditableText ? (input.textContent || '') : (input.value || '');
      const shouldClear = !value.trim()
        || value === previousTranscript
        || garbledPattern.test(value);
      if (shouldClear) {
        if (isEditableText) input.textContent = '';
        else input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  function clearTranscriptLayer() {
    if (transcript) transcript.textContent = '';
    document.querySelectorAll('.voice-transcript').forEach((el) => { el.textContent = ''; });
  }

  // ─── 语音识别结果发送 ───
  function sendRecognizedVoiceText() {
    if (!lastTranscriptText) return;
    const input = getChatInput?.();
    if (input) input.value = lastTranscriptText;
    getSendMessage?.({ channel: '语音识别', label: 'You · 语音识别' });
  }

  // 防抖自动发送：收到任意转录文字就重置 2s 计时器，停说 2s 后自动发
  function scheduleAutoSend() {
    if (autoSendTimer) clearTimeout(autoSendTimer);
    autoSendTimer = setTimeout(() => {
      autoSendTimer = null;
      setStatus('processing');
      sendRecognizedVoiceText();
    }, 2000);
  }

  function sendVoiceConfig(ws) {
    const lang = getLang?.()?.split('-')[0] || 'zh';
    if (getVoiceEngine() === 'local') {
      try { ws.send(JSON.stringify({ type: 'config', lang })); } catch {}
      return;
    }
    const provider = localStorage.getItem(VOICE_PROVIDER_KEY) || 'aliyun';
    try { ws.send(JSON.stringify({ type: 'config', provider, lang })); } catch {}
  }

  function handleVoiceMessage(ev) {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'transcript') {
        const text = (msg.text || '').trim();
        if (!text) return;
        if (isGarbledVoiceText(text)) {
          clearVoiceResidue({ clearInput: true });
          return;
        }
        lastTranscriptText = text;
        clearTranscriptLayer();
        if (msg.is_final) {
          const input = getChatInput?.();
          if (input) input.value = text;
          triggerDone();
        }
        scheduleAutoSend();
      } else if (msg.type === 'sound_event') {
        const icon = SOUND_EVENT_ICONS[msg.event] || '🔊';
        setStatus('event');
        eventFlashCount = 28;
        if (transcript) transcript.textContent = `${icon} ${msg.label_cn || msg.event || '声音事件'}`;
      } else if (msg.type === 'error') {
        setStatus('error');
        if (transcript) transcript.textContent = msg.message || '语音识别错误';
      }
    } catch {}
  }

  // ─── Cloud ASR 模式（后端代理） ───
  function startCloudStream(stream) {
    const targetSR = 16000;
    if (micData?.actx?.sampleRate !== targetSR) {
      cloudAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: targetSR });
      const src = cloudAudioCtx.createMediaStreamSource(stream);
      setupCloudProcessor(src, cloudAudioCtx);
    } else {
      setupCloudProcessor(micData.src, micData.actx);
    }

    cloudWs = new WebSocket(getVoiceWsUrl());
    cloudWs.binaryType = 'arraybuffer';

    cloudWs.onopen = () => {
      sendVoiceConfig(cloudWs);
      setStatus('listening');
      if (transcript) transcript.textContent = '';
    };

    cloudWs.onmessage = handleVoiceMessage;

    cloudWs.onerror = () => { setStatus('error'); };
    cloudWs.onclose = () => { if (micActive) setStatus('idle'); };
  }

  function setupCloudProcessor(srcNode, audioCtx) {
    const bufferSize = 4096;
    cloudProcessor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
    srcNode.connect(cloudProcessor);
    cloudProcessor.connect(audioCtx.destination);

    cloudProcessor.onaudioprocess = (e) => {
      const f32 = e.inputBuffer.getChannelData(0);
      const i16 = new Int16Array(f32.length);
      for (let i = 0; i < f32.length; i++) {
        i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768));
      }
      if (bargeinBuffering) {
        // TTS 播放中：写入环形缓冲而非发送，供打断时回放
        bargeinBuffer.push(i16);
        if (bargeinBuffer.length > BARGEIN_MAX_CHUNKS) bargeinBuffer.shift();
        return;
      }
      if (!cloudWs || cloudWs.readyState !== WebSocket.OPEN) return;
      cloudWs.send(i16.buffer);
    };
  }

  function stopCloudStream({ preserveProcessor = false } = {}) {
    try {
      if (cloudWs && cloudWs.readyState === WebSocket.OPEN) {
        cloudWs.send(JSON.stringify({ type: 'flush' }));
        setTimeout(() => { try { cloudWs?.close(); } catch {} }, 200);
      } else {
        cloudWs?.close();
      }
    } catch {}
    cloudWs = null;

    if (!preserveProcessor) {
      try { cloudProcessor?.disconnect(); } catch {}
      cloudProcessor = null;
      try { if (cloudAudioCtx) { cloudAudioCtx.close(); cloudAudioCtx = null; } } catch {}
    }
  }

  // ─── 统一开关 ───
  async function toggleVoice() {
    // 场景 A：TTS 正在朗读（mic 已被 suspend 给 TTS 用）
    //         用户按麦克风 = "闭嘴并开始听我说"，立即停 TTS + 恢复 ASR
    if (suspendedByMedia) {
      try { window.stopTTS?.(); } catch (_) {}
      btn?.classList.add('active');
      await resumeVoiceInputFromMedia();
      return;
    }
    // 场景 B：未开麦克风 → 开
    if (!micActive) {
      // 即便没在 TTS 状态，也保险地打断一次：用户可能在 TTS 刚开始/刚结束之间点了麦克风
      try { window.stopTTS?.(); } catch (_) {}
      micActive = true;
      userWantedMic = true;
      suspendedByMedia = false;
      clearVoiceResidue({ clearInput: true });
      setTimeout(() => clearVoiceResidue({ clearInput: true }), 50);
      btn?.classList.add('active');
      const stream = await startMic();
      if (!stream) { micActive = false; userWantedMic = false; btn?.classList.remove('active'); return; }
      startCloudStream(stream);
      setTimeout(() => clearVoiceResidue({ clearInput: true }), 250);
    } else {
      // 场景 C：正在录 → 关
      stopVoiceInput();
    }
  }

  function stopVoiceInput({ keepIntent = false, reason = '' } = {}) {
    if (doneTimer) { clearTimeout(doneTimer); doneTimer = null; }
    if (autoSendTimer) { clearTimeout(autoSendTimer); autoSendTimer = null; }
    lastTranscriptText = '';
    micActive = false;
    if (!keepIntent) userWantedMic = false;
    btn?.classList.toggle('active', Boolean(keepIntent && userWantedMic));
    bargeinBuffer = [];
    bargeinBuffering = false;
    stopCloudStream();
    stopMic();
    setStatus('idle');
    if (transcript) transcript.textContent = '';
  }

  async function resumeVoiceInputFromMedia() {
    if (!suspendedByMedia || !userWantedMic) return;
    suspendedByMedia = false;
    bargeinFrames = 0;

    // 拿走缓冲区快照并立刻停止写入，避免 WS 重连期间继续堆积
    const bufferedChunks = bargeinBuffer.slice();
    bargeinBuffer = [];
    bargeinBuffering = false;

    if (micActive && micData && cloudProcessor) {
      // TTS 模式：ScriptProcessor 仍存活，只需重连 WebSocket
      setStatus('listening');
      cloudWs = new WebSocket(getVoiceWsUrl());
      cloudWs.binaryType = 'arraybuffer';
      cloudWs.onopen = () => {
        sendVoiceConfig(cloudWs);
        if (transcript) transcript.textContent = '';
        // 先把预缓冲的历史音频一次性发出，补回打断前说的内容
        for (const chunk of bufferedChunks) {
          if (cloudWs.readyState === WebSocket.OPEN) cloudWs.send(chunk.buffer);
        }
      };
      cloudWs.onmessage = handleVoiceMessage;
      cloudWs.onerror = () => { setStatus('error'); };
      cloudWs.onclose = () => { if (micActive) setStatus('idle'); };
    } else {
      // 视频/音乐模式，或 Processor 已被销毁：完整重启
      micActive = true;
      btn?.classList.add('active');
      const stream = await startMic();
      if (!stream) {
        micActive = false;
        userWantedMic = false;
        btn?.classList.remove('active');
        return;
      }
      startCloudStream(stream);
    }
  }

  window.pulseVoice = {
    isActive: () => micActive,
    // 视频/音乐模式：完全停止 mic（不需要打断能力）
    suspendForMedia: () => {
      if (!micActive) return;
      suspendedByMedia = true;
      stopVoiceInput({ keepIntent: true, reason: '视频模式中，语音已暂停' });
    },
    // TTS 模式：只停云端 ASR WebSocket，保持 mic 硬件 + ScriptProcessor
    // 开启预缓冲：打断时可回放最近 1.5s 的音频，避免开头几个字丢失
    suspendForTTS: () => {
      if (!micActive) return;
      suspendedByMedia = true;
      ttsStartTime = Date.now();
      bargeinFrames = 0;
      bargeinBuffer = [];
      bargeinBuffering = true;
      stopCloudStream({ preserveProcessor: true }); // 保留 Processor，只断 WS
      setStatus('speaking');
    },
    resumeAfterMedia: resumeVoiceInputFromMedia,
    stop: () => stopVoiceInput(),
  };

  window.addEventListener('pulse:video-mode', (event) => {
    if (event.detail?.active) {
      window.pulseVoice.suspendForMedia();
    } else {
      window.pulseVoice.resumeAfterMedia();
    }
  });

  window.addEventListener('pulse:music-mode', (event) => {
    if (event.detail?.active) {
      window.pulseVoice.suspendForMedia();
    } else {
      window.pulseVoice.resumeAfterMedia();
    }
  });

  // 阈值实时更新（设置面板保存后立即生效，无需重启语音）
  window.addEventListener('pulse:voice-threshold', (event) => {
    const t = Number(event.detail?.threshold);
    if (!isNaN(t) && t > 0) {
      nearFieldGate.noiseFloor = t * 0.375;
    }
  });

  // ─── 面板初始化 ───
  function openPanel() {
    panel.hidden = false;
    if (!rafId) drawFrame();
  }

  btn?.addEventListener('click', toggleVoice);
  canvas.addEventListener('click', toggleVoice);

  setStatus('idle');
  openPanel();
  // 用户点击麦克风按钮或声波球时才启动麦克风。
}
