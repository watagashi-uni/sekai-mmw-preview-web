import './main.css'

import { AudioTransport } from './lib/audioTransport'
import { GlPreviewRenderer } from './lib/glRenderer'
import { JudgementSounds } from './lib/judgementSounds'
import { MmwEffectSystem } from './lib/mmwEffectSystem'
import { MmwWasmPreview } from './lib/mmwWasm'
import type { HitEvent, PreviewRuntimeConfig, TransportState } from './lib/types'
import { normalizeOffsetMs, parseUrlPreviewParams } from './lib/url'

const defaultConfig: PreviewRuntimeConfig = {
  mirror: false,
  flickAnimation: true,
  holdAnimation: true,
  simultaneousLine: true,
  noteSpeed: 10.5,
  holdAlpha: 0.74,
  guideAlpha: 0.5,
  stageOpacity: 1,
  backgroundBrightness: 1,
  effectOpacity: 1,
}

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) {
  throw new Error('Missing app root.')
}

app.innerHTML = `
  <div class="app-shell">
    <section class="preview-panel" id="preview-panel">
      <canvas class="preview-canvas" id="preview-canvas"></canvas>
      <canvas class="effects-canvas" id="effects-canvas"></canvas>
      <div class="status-layer" id="status-layer">
        <div class="status-card">
          <div class="status-title" id="status-title">正在初始化预览</div>
          <div class="status-text" id="status-text">加载 MMW 资源和 wasm 核心中…</div>
        </div>
      </div>
      <div class="unlock-layer" id="unlock-layer" hidden>
        <div class="unlock-card">
          <div class="status-title">浏览器需要一次点击来启动音频</div>
          <div class="status-text">点击后会继续当前播放请求，谱面和 BGM 会按同一时间轴同步。</div>
          <button class="unlock-button" id="unlock-button" type="button">启动音频</button>
        </div>
      </div>
      <div class="bgm-loading-layer" id="bgm-loading-layer" hidden>
        <div class="status-card">
          <div class="status-title">正在加载歌曲</div>
          <div class="status-text">BGM 还没准备好，加载完成后就可以播放。</div>
        </div>
      </div>
    </section>
    <section class="controls">
      <div class="controls-row">
        <button id="play-toggle" type="button">播放</button>
        <button id="stop-button" type="button" class="secondary">停止</button>
        <input id="progress-input" class="timeline" type="range" min="0" max="0" step="0.001" value="0" />
        <div class="time-readout" id="time-readout">00:00.000 / 00:00.000</div>
      </div>
      <div class="controls-row">
        <label>
          速度
          <select id="speed-select">
            <option value="0.25">0.25x</option>
            <option value="0.5">0.5x</option>
            <option value="0.75">0.75x</option>
            <option value="1" selected>1x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
          </select>
        </label>
        <label class="note-speed">
          noteSpeed
          <input id="note-speed-input" type="range" min="1" max="12" step="0.1" value="10.5" />
          <output id="note-speed-output">10.5</output>
        </label>
        <label class="toggle-control">
          <input id="low-effects-input" type="checkbox" />
          低特效
        </label>
      </div>
      <div class="meta-line" id="meta-line"></div>
      <div class="warning-text" id="warning-text"></div>
      <div class="attribution-line">
        Adapted from <a href="https://github.com/crash5band/MikuMikuWorld" target="_blank" rel="noreferrer">MikuMikuWorld</a> by Crash5b, licensed under MIT.
      </div>
    </section>
  </div>
`

const previewPanel = app.querySelector<HTMLElement>('#preview-panel')!
const canvas = app.querySelector<HTMLCanvasElement>('#preview-canvas')!
const effectsCanvas = app.querySelector<HTMLCanvasElement>('#effects-canvas')!
const statusLayer = app.querySelector<HTMLDivElement>('#status-layer')!
const statusTitle = app.querySelector<HTMLDivElement>('#status-title')!
const statusText = app.querySelector<HTMLDivElement>('#status-text')!
const unlockLayer = app.querySelector<HTMLDivElement>('#unlock-layer')!
const unlockButton = app.querySelector<HTMLButtonElement>('#unlock-button')!
const bgmLoadingLayer = app.querySelector<HTMLDivElement>('#bgm-loading-layer')!
const playToggle = app.querySelector<HTMLButtonElement>('#play-toggle')!
const stopButton = app.querySelector<HTMLButtonElement>('#stop-button')!
const progressInput = app.querySelector<HTMLInputElement>('#progress-input')!
const speedSelect = app.querySelector<HTMLSelectElement>('#speed-select')!
const noteSpeedInput = app.querySelector<HTMLInputElement>('#note-speed-input')!
const noteSpeedOutput = app.querySelector<HTMLOutputElement>('#note-speed-output')!
const lowEffectsInput = app.querySelector<HTMLInputElement>('#low-effects-input')!
const timeReadout = app.querySelector<HTMLDivElement>('#time-readout')!
const metaLine = app.querySelector<HTMLDivElement>('#meta-line')!
const warningText = app.querySelector<HTMLDivElement>('#warning-text')!

const transport = new AudioTransport()
const wasm = new MmwWasmPreview()
const renderer = new GlPreviewRenderer(canvas)
const effects = new MmwEffectSystem(effectsCanvas)
const judgementSounds = new JudgementSounds()

let normalizedOffsetMs = 0
let previewReady = false
let rendererReady = false
let warningMessage = ''
const emptyFrame = new Float32Array()
let currentConfig = { ...defaultConfig }
let hitEvents: HitEvent[] = []
let nextHitEventIndex = 0
let previousTimeSec = 0
let previousTransportState: TransportState = 'idle'
let initialStartSec = 0
let bgmExpected = false
let bgmLoaded = false
let bgmLoadingActive = false
const BGM_FETCH_TIMEOUT_MS = 30000
const BGM_DECODE_TIMEOUT_MS = 30000

const resizeObserver = new ResizeObserver(() => {
  const bounds = previewPanel.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  renderer.resize(bounds.width, bounds.height, dpr)
  wasm.resize(bounds.width, bounds.height, dpr)
  effects.resize(bounds.width, bounds.height, dpr)
})

function setStatus(title: string, text: string) {
  statusTitle.textContent = title
  statusText.textContent = text
  statusLayer.hidden = false
}

function applyEffectLayerOpacity() {
  effectsCanvas.style.opacity = '1'
}

function clearStatus() {
  statusLayer.hidden = true
}

function formatTime(value: number) {
  const safe = Math.max(value, 0)
  const minutes = Math.floor(safe / 60)
  const seconds = Math.floor(safe % 60)
  const milliseconds = Math.floor((safe % 1) * 1000)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

async function fetchText(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load SUS: ${response.status} ${response.statusText}`)
  }
  return response.text()
}

async function fetchArrayBuffer(url: string, timeoutMs: number) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`Failed to load BGM: ${response.status} ${response.statusText}`)
    }
    return response.arrayBuffer()
  } finally {
    window.clearTimeout(timer)
  }
}

function updateUi() {
  const snapshot = transport.getSnapshot()
  const currentTimeSec = snapshot.currentTimeSec
  const durationSec = snapshot.durationSec
  const bgmLoading = bgmLoadingActive

  progressInput.max = String(durationSec || 0)
  progressInput.value = String(Math.min(currentTimeSec, durationSec || currentTimeSec))
  timeReadout.textContent = `${formatTime(currentTimeSec)} / ${formatTime(durationSec)}`
  playToggle.textContent = snapshot.state === 'playing' ? '暂停' : '播放'
  playToggle.disabled = bgmLoading
  unlockLayer.hidden = !snapshot.requiresGesture
  bgmLoadingLayer.hidden = !bgmLoading
  warningText.textContent = warningMessage
}

async function bootstrap() {
  try {
    setStatus('正在加载 MMW 资源', '复制后的贴图、着色器壳层和 wasm 模块正在初始化。')
    await Promise.all([
      wasm.init(),
      renderer.loadTextures(),
      effects.load(),
      judgementSounds.load(transport.getAudioContext()).catch(() => {
        warningMessage = '判定音效加载失败，已静默继续。'
      }),
    ])
    rendererReady = true
    resizeObserver.observe(previewPanel)

    setStatus('正在加载谱面', '正在通过 URL 参数拉取 SUS 文件。')
    const params = parseUrlPreviewParams(new URL(window.location.href))
    bgmExpected = !!params.bgm
    bgmLoaded = !params.bgm
    const susFetchPromise = fetchText(params.sus)
    const bgmFetchPromise = params.bgm
      ? fetchArrayBuffer(params.bgm, BGM_FETCH_TIMEOUT_MS)
      : Promise.resolve<ArrayBuffer | null>(null)
    const susText = await susFetchPromise
    normalizedOffsetMs = normalizeOffsetMs(params.rawOffsetMs, susText)

    wasm.loadSusText(susText, normalizedOffsetMs)
    wasm.setPreviewConfig(currentConfig)
    hitEvents = wasm.getHitEvents().map((event) => ({
      ...event,
      timeSec: event.timeSec - normalizedOffsetMs / 1000,
      endTimeSec:
        event.endTimeSec === undefined
          ? undefined
          : event.endTimeSec - normalizedOffsetMs / 1000,
    }))
    nextHitEventIndex = 0

    const chartEndTimeSec = wasm.getChartEndTimeSec()
    const minimumDurationSec = Math.max(chartEndTimeSec - normalizedOffsetMs / 1000 + 1, 1)
    transport.setDuration(minimumDurationSec)
    transport.setReady()
    initialStartSec = Math.max(0, -normalizedOffsetMs / 1000)
    if (initialStartSec > 0.001) {
      transport.seek(initialStartSec)
      previousTimeSec = initialStartSec
      nextHitEventIndex = lowerBoundHitEvent(initialStartSec)
    }

    metaLine.innerHTML =
      `offset: <code>${Math.round(normalizedOffsetMs)} ms</code> · ` +
      `chartTime = audioPosition + <code>${(normalizedOffsetMs / 1000).toFixed(3)}s</code>`

    previewReady = true
    clearStatus()
    updateUi()

    if (params.bgm) {
      bgmLoadingActive = true
      warningMessage = '正在加载 BGM…'
      updateUi()
      void (async () => {
        try {
          const bgmData = await bgmFetchPromise
          if (!bgmData) {
            throw new Error('Failed to load BGM: empty response')
          }
          await Promise.race([
            transport.setAudioData(bgmData),
            new Promise<never>((_, reject) => {
              window.setTimeout(() => reject(new Error('BGM decode timeout.')), BGM_DECODE_TIMEOUT_MS)
            }),
          ])
          transport.setDuration(Math.max(transport.getSnapshot().durationSec, minimumDurationSec))
          bgmLoaded = true
          bgmLoadingActive = false
          warningMessage = ''
        } catch (error) {
          bgmExpected = false
          bgmLoaded = false
          bgmLoadingActive = false
          warningMessage =
            error instanceof Error
              ? `${error.message}，已切换为静音预览。`
              : 'BGM 加载失败，已切换为静音预览。'
        }
        updateUi()
      })()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    setStatus('预览加载失败', message)
    transport.setError()
    updateUi()
  }
}

playToggle.addEventListener('click', async () => {
  if (bgmExpected && !bgmLoaded) {
    warningMessage = '歌曲仍在加载中，请稍候。'
    updateUi()
    return
  }
  if (transport.getSnapshot().state === 'playing') {
    transport.pause()
    return
  }

  const ok = await transport.play()
  if (!ok) {
    unlockLayer.hidden = false
  }
  updateUi()
})

stopButton.addEventListener('click', () => {
  transport.stop()
  if (initialStartSec > 0.001) {
    transport.seek(initialStartSec)
  }
  nextHitEventIndex = lowerBoundHitEvent(initialStartSec)
  previousTimeSec = initialStartSec
  effects.reset()
  updateUi()
})

progressInput.addEventListener('input', () => {
  const nextTime = Number(progressInput.value)
  transport.seek(nextTime)
  nextHitEventIndex = lowerBoundHitEvent(nextTime)
  previousTimeSec = nextTime
  effects.reset()
  updateUi()
})

speedSelect.addEventListener('change', async () => {
  await transport.setPlaybackRate(Number(speedSelect.value))
  updateUi()
})

noteSpeedInput.addEventListener('input', () => {
  currentConfig = {
    ...currentConfig,
    noteSpeed: Number(noteSpeedInput.value),
  }
  noteSpeedOutput.value = currentConfig.noteSpeed.toFixed(1)
  wasm.setPreviewConfig(currentConfig)
})

lowEffectsInput.addEventListener('change', () => {
  currentConfig = {
    ...currentConfig,
    effectOpacity: lowEffectsInput.checked ? 0.3 : 1,
  }
  wasm.setPreviewConfig(currentConfig)
  applyEffectLayerOpacity()
})

unlockButton.addEventListener('click', async () => {
  await transport.unlock()
  updateUi()
})

transport.subscribe(updateUi)

function lowerBoundHitEvent(timeSec: number) {
  let low = 0
  let high = hitEvents.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (hitEvents[mid].timeSec < timeSec - 0.0001) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  return low
}

function emitHitEvents(fromSec: number, toSec: number) {
  while (nextHitEventIndex < hitEvents.length && hitEvents[nextHitEventIndex].timeSec <= toSec + 0.0001) {
    const event = hitEvents[nextHitEventIndex]
    if (event.timeSec >= fromSec - 0.0001) {
      triggerNoteEffects(event)
      judgementSounds.trigger(
        transport.getAudioContext(),
        event,
        transport.getSnapshot().playbackRate,
        event.timeSec,
      )
    }
    nextHitEventIndex += 1
  }
}

function resumeActiveHoldLoops(currentTimeSec: number) {
  for (const event of hitEvents) {
    if (event.kind !== 'holdLoop' || event.endTimeSec === undefined) {
      continue
    }
    if (event.timeSec < currentTimeSec - 0.0001 && event.endTimeSec > currentTimeSec + 0.0001) {
      judgementSounds.trigger(
        transport.getAudioContext(),
        event,
        transport.getSnapshot().playbackRate,
        currentTimeSec,
      )
    }
  }
}

function triggerNoteEffects(event: HitEvent) {
  const trigger = {
    x: event.center,
    width: event.width,
    timeSec: performance.now() / 1000,
    untilSec: event.endTimeSec,
  }

  switch (event.kind) {
    case 'flick':
      effects.trigger(event.critical ? 'fx_note_critical_flick_aura' : 'fx_note_flick_aura', trigger)
      effects.trigger(event.critical ? 'fx_note_critical_flick_gen' : 'fx_note_flick_gen', trigger)
      effects.trigger(event.critical ? 'fx_note_critical_flick_flash' : 'fx_note_flick_flash', trigger)
      if (event.critical) {
        effects.trigger('fx_lane_critical_flick', trigger)
      }
      break
    case 'trace':
      effects.trigger(event.critical ? 'fx_note_critical_trace_aura' : 'fx_note_trace_aura', trigger)
      break
    case 'tick':
      effects.trigger(event.critical ? 'fx_note_critical_long_hold_via_aura' : 'fx_note_long_hold_via_aura', trigger)
      break
    case 'holdLoop':
      effects.trigger(event.critical ? 'fx_note_critical_long_hold_gen' : 'fx_note_long_hold_gen', trigger)
      effects.trigger(event.critical ? 'fx_note_critical_long_hold_gen_aura' : 'fx_note_hold_aura', trigger)
      break
    case 'criticalTap':
      effects.trigger('fx_note_critical_normal_aura', trigger)
      effects.trigger('fx_note_critical_normal_gen', trigger)
      effects.trigger('fx_lane_critical', trigger)
      break
    case 'tap':
    default:
      effects.trigger('fx_note_normal_aura', trigger)
      effects.trigger('fx_note_normal_gen', trigger)
      effects.trigger('fx_lane_default', trigger)
      break
  }
}

function frameLoop() {
  if (!rendererReady) {
    requestAnimationFrame(frameLoop)
    return
  }
  try {
    const snapshot = transport.getSnapshot()
    const currentTimeSec = snapshot.currentTimeSec
    const chartTimeSec = currentTimeSec + normalizedOffsetMs / 1000
    const frame = previewReady ? wasm.render(chartTimeSec) : { count: 0, floats: emptyFrame }
    renderer.render(frame.floats, frame.count, currentConfig)

    if (previewReady) {
      if (
        snapshot.state !== 'playing' ||
        previousTransportState !== 'playing' ||
        currentTimeSec < previousTimeSec ||
        currentTimeSec - previousTimeSec > 0.25
      ) {
        nextHitEventIndex = lowerBoundHitEvent(currentTimeSec)
        if (snapshot.state !== 'playing') {
          effects.reset()
          judgementSounds.stopAll()
        } else {
          resumeActiveHoldLoops(currentTimeSec)
        }
      } else {
        emitHitEvents(previousTimeSec, currentTimeSec)
      }
    }

    effects.render(performance.now() / 1000)
    previousTimeSec = currentTimeSec
    previousTransportState = snapshot.state
    updateUi()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown render error'
    setStatus('预览加载失败', message)
    transport.setError()
    previewReady = false
  }
  requestAnimationFrame(frameLoop)
}

requestAnimationFrame(frameLoop)
applyEffectLayerOpacity()
void bootstrap()
