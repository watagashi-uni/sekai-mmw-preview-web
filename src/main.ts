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
  <div class="app-shell" id="app-shell">
    <section class="preview-panel" id="preview-panel">
      <canvas class="preview-canvas" id="preview-canvas"></canvas>
      <canvas class="effects-canvas" id="effects-canvas"></canvas>
      <button class="exit-fullscreen-button" id="exit-fullscreen-button" type="button" hidden title="退出全屏" aria-label="退出全屏"></button>
      <button class="lock-controls-button" id="lock-controls-button" type="button" hidden title="锁定控制栏" aria-label="锁定控制栏"></button>
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
      <div class="controls-row controls-row-main">
        <button id="play-toggle" type="button" class="has-icon"></button>
        <div class="time-readout" id="time-readout">00:00 / 00:00</div>
      </div>
      <div class="controls-row controls-row-progress">
        <input id="progress-input" class="timeline" type="range" min="0" max="0" step="0.001" value="0" />
      </div>
      <div class="controls-row controls-row-speed">
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
        <label class="note-speed" aria-label="noteSpeed">
          noteSpeed
          <button id="note-speed-minus-one-button" type="button" class="secondary note-speed-step" aria-label="降低 noteSpeed 1">-1</button>
          <button id="note-speed-minus-point-one-button" type="button" class="secondary note-speed-step" aria-label="降低 noteSpeed 0.1">-0.1</button>
          <output id="note-speed-output">10.5</output>
          <button id="note-speed-plus-point-one-button" type="button" class="secondary note-speed-step" aria-label="提高 noteSpeed 0.1">+0.1</button>
          <button id="note-speed-plus-one-button" type="button" class="secondary note-speed-step" aria-label="提高 noteSpeed 1">+1</button>
        </label>
      </div>
      <div class="controls-row controls-row-toggle">
        <label class="toggle-control">
          <input id="low-effects-input" type="checkbox" />
          低特效
        </label>
        <label class="toggle-control">
          <input id="low-resolution-input" type="checkbox" />
          低分辨率
        </label>
      </div>
      <div class="controls-row controls-row-fullscreen">
        <button id="web-fullscreen-toggle" type="button" class="secondary has-icon" hidden title="网页全屏" aria-label="网页全屏"></button>
        <button id="fullscreen-toggle" type="button" class="secondary has-icon" title="全屏" aria-label="全屏"></button>
        <div class="ios-hint" id="ios-hint" hidden>iPad 请用网页全屏</div>
      </div>
      <div class="warning-text" id="warning-text"></div>
      <div class="attribution-line">
        Adapted from <a href="https://github.com/crash5band/MikuMikuWorld" target="_blank" rel="noreferrer">MikuMikuWorld</a> by Crash5b (MIT). Ported to browser by watagashi-uni. Project: <a href="https://github.com/watagashi-uni/sekai-mmw-preview-web" target="_blank" rel="noreferrer">sekai-mmw-preview-web</a>.
      </div>
    </section>
  </div>
`

const previewPanel = app.querySelector<HTMLElement>('#preview-panel')!
const appShell = app.querySelector<HTMLElement>('#app-shell')!
const controlsPanel = app.querySelector<HTMLElement>('.controls')!
const canvas = app.querySelector<HTMLCanvasElement>('#preview-canvas')!
const effectsCanvas = app.querySelector<HTMLCanvasElement>('#effects-canvas')!
const exitFullscreenButton = app.querySelector<HTMLButtonElement>('#exit-fullscreen-button')!
const lockControlsButton = app.querySelector<HTMLButtonElement>('#lock-controls-button')!
const statusLayer = app.querySelector<HTMLDivElement>('#status-layer')!
const statusTitle = app.querySelector<HTMLDivElement>('#status-title')!
const statusText = app.querySelector<HTMLDivElement>('#status-text')!
const unlockLayer = app.querySelector<HTMLDivElement>('#unlock-layer')!
const unlockButton = app.querySelector<HTMLButtonElement>('#unlock-button')!
const bgmLoadingLayer = app.querySelector<HTMLDivElement>('#bgm-loading-layer')!
const playToggle = app.querySelector<HTMLButtonElement>('#play-toggle')!
const webFullscreenToggle = app.querySelector<HTMLButtonElement>('#web-fullscreen-toggle')!
const fullscreenToggle = app.querySelector<HTMLButtonElement>('#fullscreen-toggle')!
const progressInput = app.querySelector<HTMLInputElement>('#progress-input')!
const speedSelect = app.querySelector<HTMLSelectElement>('#speed-select')!
const noteSpeedOutput = app.querySelector<HTMLOutputElement>('#note-speed-output')!
const noteSpeedMinusOneButton = app.querySelector<HTMLButtonElement>('#note-speed-minus-one-button')!
const noteSpeedMinusPointOneButton = app.querySelector<HTMLButtonElement>('#note-speed-minus-point-one-button')!
const noteSpeedPlusPointOneButton = app.querySelector<HTMLButtonElement>('#note-speed-plus-point-one-button')!
const noteSpeedPlusOneButton = app.querySelector<HTMLButtonElement>('#note-speed-plus-one-button')!
const lowEffectsInput = app.querySelector<HTMLInputElement>('#low-effects-input')!
const lowResolutionInput = app.querySelector<HTMLInputElement>('#low-resolution-input')!
const timeReadout = app.querySelector<HTMLDivElement>('#time-readout')!
const warningText = app.querySelector<HTMLDivElement>('#warning-text')!
const iosHint = app.querySelector<HTMLDivElement>('#ios-hint')!

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
const LOW_RESOLUTION_STORAGE_KEY = 'preview-low-resolution'
const MAX_RENDER_WIDTH = 1280
const MAX_RENDER_HEIGHT = 720
const LOW_RENDER_WIDTH = 960
const LOW_RENDER_HEIGHT = 540
const UI_REFRESH_INTERVAL_MS = 50
const CONTROLS_AUTO_HIDE_MS = 3000
let lastUiRefreshMs = 0
let isFullscreen = false
let isNativeFullscreen = false
let controlsVisible = true
let controlsLocked = false
let controlsHideTimer: number | null = null
let isIOS = false
let isIPad = false
let lowResolutionEnabled = false
let iosTouchGuardsCleanup: (() => void) | null = null

type WebkitFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

type WebkitFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

const ICON_EXIT_FULLSCREEN = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <path d="M6 6L18 18M18 6L6 18" />
  </svg>
`

const ICON_ENTER_FULLSCREEN = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <path d="M9 4H4v5M20 9V4h-5M15 20h5v-5M4 15v5h5" />
  </svg>
`

const ICON_WEB_FULLSCREEN = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <path d="M4 5h16v12H4zM8 19h8" />
    <path d="M9 9h6v4H9z" />
  </svg>
`

const ICON_LOCKED = `
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17 9h-1V7a4 4 0 10-8 0v2H7a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2v-8a2 2 0 00-2-2zM10 9V7a2 2 0 114 0v2h-4zM13 15.73V17a1 1 0 11-2 0v-1.27a2 2 0 112 0z" />
  </svg>
`

const ICON_UNLOCKED = `
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17 9h-6V7a2 2 0 113.84-.75a1 1 0 001.92-.5A4 4 0 109 7v2H7a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2v-8a2 2 0 00-2-2zm-5 8a2 2 0 110-4a2 2 0 010 4z" />
  </svg>
`

const ICON_PLAY = `
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
`

const ICON_PAUSE = `
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
  </svg>
`

function renderTextIconButton(icon: string, label: string) {
  return `<span class="btn-icon">${icon}</span><span class="btn-label">${label}</span>`
}

function detectIosDevice() {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function detectIpadDevice() {
  const ua = navigator.userAgent
  return /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function syncPseudoFullscreenViewport() {
  const visualViewport = window.visualViewport
  const viewportWidth = Math.round(visualViewport?.width ?? window.innerWidth)
  const viewportHeight = Math.round(visualViewport?.height ?? window.innerHeight)
  appShell.style.setProperty('--pseudo-fullscreen-width', `${viewportWidth}px`)
  appShell.style.setProperty('--pseudo-fullscreen-height', `${viewportHeight}px`)
}

function clearPseudoFullscreenViewport() {
  appShell.style.removeProperty('--pseudo-fullscreen-width')
  appShell.style.removeProperty('--pseudo-fullscreen-height')
}

function clearIosTouchGuards() {
  if (!iosTouchGuardsCleanup) {
    return
  }
  iosTouchGuardsCleanup()
  iosTouchGuardsCleanup = null
}

function syncIosTouchGuards() {
  const shouldGuardTouch = isIOS && isFullscreen && !isNativeFullscreen
  if (!shouldGuardTouch) {
    clearIosTouchGuards()
    return
  }
  if (iosTouchGuardsCleanup) {
    return
  }

  const isInteractiveTarget = (target: EventTarget | null) => {
    const element = target as HTMLElement | null
    return !!element?.closest('button, input, select, label, a')
  }

  const blockTouchMove = (event: TouchEvent) => {
    if (isInteractiveTarget(event.target)) {
      return
    }
    event.preventDefault()
  }

  const blockTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      return
    }
    if (isInteractiveTarget(event.target)) {
      return
    }
    const element = appShell
    if (element.scrollTop <= 0) {
      element.scrollTop = 1
    }
    if (element.scrollTop + element.clientHeight >= element.scrollHeight) {
      element.scrollTop = Math.max(1, element.scrollHeight - element.clientHeight - 1)
    }
  }

  const previousBodyTouchAction = document.body.style.touchAction
  const previousHtmlTouchAction = document.documentElement.style.touchAction

  document.body.style.touchAction = 'none'
  document.documentElement.style.touchAction = 'none'
  document.addEventListener('touchmove', blockTouchMove, { passive: false })
  appShell.addEventListener('touchstart', blockTouchStart, { passive: true })

  iosTouchGuardsCleanup = () => {
    document.removeEventListener('touchmove', blockTouchMove)
    appShell.removeEventListener('touchstart', blockTouchStart)
    document.body.style.touchAction = previousBodyTouchAction
    document.documentElement.style.touchAction = previousHtmlTouchAction
  }
}

function getMaxQualityRenderDpr(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    return 1
  }
  const maxWidth = lowResolutionEnabled ? LOW_RENDER_WIDTH : MAX_RENDER_WIDTH
  const maxHeight = lowResolutionEnabled ? LOW_RENDER_HEIGHT : MAX_RENDER_HEIGHT
  return Math.min(maxWidth / width, maxHeight / height)
}

function applyRenderSize() {
  if (!rendererReady) {
    return
  }
  const bounds = previewPanel.getBoundingClientRect()
  const dpr = getMaxQualityRenderDpr(bounds.width, bounds.height)
  renderer.resize(bounds.width, bounds.height, dpr)
  wasm.resize(bounds.width, bounds.height, dpr)
  effects.resize(bounds.width, bounds.height, dpr)
}

function clearControlsHideTimer() {
  if (controlsHideTimer !== null) {
    window.clearTimeout(controlsHideTimer)
    controlsHideTimer = null
  }
}

function syncBodyScrollLock() {
  const lockScroll = isFullscreen && !isNativeFullscreen
  document.body.style.overflow = lockScroll ? 'hidden' : ''
  document.documentElement.style.overflow = lockScroll ? 'hidden' : ''
  document.body.style.overscrollBehavior = lockScroll ? 'none' : ''
  document.documentElement.style.overscrollBehavior = lockScroll ? 'none' : ''
}

function applyFullscreenUi() {
  appShell.classList.toggle('fullscreen-mode', isFullscreen)
  appShell.classList.toggle('pseudo-fullscreen-mode', isFullscreen && !isNativeFullscreen)
  exitFullscreenButton.hidden = !isFullscreen
  lockControlsButton.hidden = !isFullscreen
  webFullscreenToggle.hidden = !isIOS || isFullscreen
  iosHint.hidden = !isIPad || isFullscreen
  exitFullscreenButton.innerHTML = ICON_EXIT_FULLSCREEN
  lockControlsButton.innerHTML = controlsLocked ? ICON_LOCKED : ICON_UNLOCKED
  lockControlsButton.title = controlsLocked ? '解锁控制栏' : '锁定控制栏'
  lockControlsButton.setAttribute('aria-label', controlsLocked ? '解锁控制栏' : '锁定控制栏')
  const shouldHideControls = isFullscreen && (controlsLocked || !controlsVisible)
  controlsPanel.classList.toggle('hidden-controls', shouldHideControls)
  const fullscreenLabel = isFullscreen ? '退出全屏' : isIOS ? '系统全屏' : '全屏'
  const fullscreenIcon = isFullscreen ? ICON_EXIT_FULLSCREEN : ICON_ENTER_FULLSCREEN
  fullscreenToggle.innerHTML = renderTextIconButton(fullscreenIcon, fullscreenLabel)
  fullscreenToggle.title = fullscreenLabel
  fullscreenToggle.setAttribute('aria-label', fullscreenLabel)
  webFullscreenToggle.innerHTML = renderTextIconButton(ICON_WEB_FULLSCREEN, '网页全屏')
  webFullscreenToggle.title = '网页全屏'
  webFullscreenToggle.setAttribute('aria-label', '网页全屏')
  if (isFullscreen && !isNativeFullscreen) {
    syncPseudoFullscreenViewport()
  } else {
    clearPseudoFullscreenViewport()
  }
  syncBodyScrollLock()
  syncIosTouchGuards()
}

function showControls() {
  controlsVisible = true
  applyFullscreenUi()
}

function hideControls() {
  controlsVisible = false
  applyFullscreenUi()
}

function resetControlsAutoHide() {
  if (!isFullscreen || controlsLocked) {
    return
  }
  showControls()
  clearControlsHideTimer()
  controlsHideTimer = window.setTimeout(() => {
    hideControls()
  }, CONTROLS_AUTO_HIDE_MS)
}

function exitPseudoFullscreen() {
  isNativeFullscreen = false
  isFullscreen = false
  controlsLocked = false
  controlsVisible = true
  clearControlsHideTimer()
  applyFullscreenUi()
}

function enterWebFullscreen() {
  isNativeFullscreen = false
  isFullscreen = true
  controlsVisible = true
  controlsLocked = false
  syncPseudoFullscreenViewport()
  applyFullscreenUi()
  resetControlsAutoHide()
  applyRenderSize()
}

function syncFullscreenFromBrowser() {
  const fullscreenDocument = document as WebkitFullscreenDocument
  const fullscreenElement = document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null
  const isActive = fullscreenElement === appShell

  if (isActive) {
    isNativeFullscreen = true
    isFullscreen = true
    controlsLocked = false
    controlsVisible = true
    applyFullscreenUi()
    resetControlsAutoHide()
    applyRenderSize()
    return
  }

  if (isNativeFullscreen) {
    try {
      screen.orientation.unlock?.()
    } catch {
      // Ignore unsupported orientation unlock.
    }
    exitPseudoFullscreen()
    applyRenderSize()
  }
}

async function enterFullscreen() {
  const fullscreenElement = appShell as WebkitFullscreenElement
  try {
    if (fullscreenElement.requestFullscreen) {
      await fullscreenElement.requestFullscreen()
    } else if (fullscreenElement.webkitRequestFullscreen) {
      await fullscreenElement.webkitRequestFullscreen()
    } else {
      throw new Error('Fullscreen API unavailable')
    }
    isNativeFullscreen = true
    isFullscreen = true
  } catch {
    isNativeFullscreen = false
    isFullscreen = true
  }

  try {
    await (screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> }).lock?.(
      'landscape',
    )
  } catch {
    // Ignore unsupported orientation lock.
  }

  controlsVisible = true
  controlsLocked = false
  applyFullscreenUi()
  resetControlsAutoHide()
  applyRenderSize()
}

async function exitFullscreen() {
  try {
    screen.orientation.unlock?.()
  } catch {
    // Ignore unsupported orientation unlock.
  }

  if (isNativeFullscreen) {
    const fullscreenDocument = document as WebkitFullscreenDocument
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else if (fullscreenDocument.webkitFullscreenElement && fullscreenDocument.webkitExitFullscreen) {
        await fullscreenDocument.webkitExitFullscreen()
      }
    } catch {
      // Ignore native fullscreen exit error and fallback to local state reset.
    }
  }

  exitPseudoFullscreen()
  applyRenderSize()
}

function onFullscreenInteraction() {
  if (!isFullscreen) {
    return
  }
  resetControlsAutoHide()
}

function onViewportChange() {
  if (!isFullscreen || isNativeFullscreen) {
    return
  }
  syncPseudoFullscreenViewport()
  applyRenderSize()
}

const resizeObserver = new ResizeObserver(() => {
  applyRenderSize()
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
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
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
  const playState = snapshot.state === 'playing' ? 'playing' : 'paused'

  progressInput.max = String(durationSec || 0)
  progressInput.value = String(Math.min(currentTimeSec, durationSec || currentTimeSec))
  timeReadout.textContent = `${formatTime(currentTimeSec)} / ${formatTime(durationSec)}`
  if (playToggle.dataset.state !== playState) {
    const playLabel = playState === 'playing' ? '暂停' : '播放'
    playToggle.innerHTML = renderTextIconButton(playState === 'playing' ? ICON_PAUSE : ICON_PLAY, playLabel)
    playToggle.setAttribute('aria-label', playLabel)
    playToggle.title = playLabel
    playToggle.dataset.state = playState
  }
  playToggle.disabled = bgmLoading
  unlockLayer.hidden = !snapshot.requiresGesture
  bgmLoadingLayer.hidden = !bgmLoading
  warningText.textContent = warningMessage
}

async function bootstrap() {
  try {
    setStatus('正在加载 MMW 资源', '贴图、着色器壳层和 wasm 模块正在初始化。')
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

function applyNoteSpeed(nextValue: number) {
  const snapped = Math.round(nextValue * 10) / 10
  const clamped = Math.min(12, Math.max(1, snapped))
  currentConfig = {
    ...currentConfig,
    noteSpeed: clamped,
  }
  noteSpeedOutput.value = clamped.toFixed(1)
  wasm.setPreviewConfig(currentConfig)
}

function adjustNoteSpeed(delta: number) {
  applyNoteSpeed(currentConfig.noteSpeed + delta)
}

function bindTapAction(element: HTMLElement, handler: () => void) {
  let triggeredByTouch = false
  element.addEventListener(
    'touchend',
    (event) => {
      if (event.cancelable) {
        event.preventDefault()
      }
      triggeredByTouch = true
      handler()
    },
    { passive: false },
  )
  element.addEventListener('click', () => {
    if (triggeredByTouch) {
      triggeredByTouch = false
      return
    }
    handler()
  })
}

noteSpeedMinusOneButton.addEventListener('click', () => {
  adjustNoteSpeed(-1)
})

noteSpeedMinusPointOneButton.addEventListener('click', () => {
  adjustNoteSpeed(-0.1)
})

noteSpeedPlusPointOneButton.addEventListener('click', () => {
  adjustNoteSpeed(0.1)
})

noteSpeedPlusOneButton.addEventListener('click', () => {
  adjustNoteSpeed(1)
})

lowEffectsInput.addEventListener('change', () => {
  currentConfig = {
    ...currentConfig,
    effectOpacity: lowEffectsInput.checked ? 0.3 : 1,
  }
  wasm.setPreviewConfig(currentConfig)
  applyEffectLayerOpacity()
})

lowResolutionInput.addEventListener('change', () => {
  lowResolutionEnabled = lowResolutionInput.checked
  try {
    window.localStorage.setItem(LOW_RESOLUTION_STORAGE_KEY, lowResolutionEnabled ? '1' : '0')
  } catch {
    // Ignore storage write failures.
  }
  applyRenderSize()
})

unlockButton.addEventListener('click', async () => {
  await transport.unlock()
  updateUi()
})

bindTapAction(fullscreenToggle, () => {
  if (isFullscreen) {
    void exitFullscreen()
  } else {
    void enterFullscreen()
  }
})

bindTapAction(webFullscreenToggle, () => {
  if (isFullscreen && !isNativeFullscreen) {
    void exitFullscreen()
    return
  }
  if (!isFullscreen) {
    enterWebFullscreen()
  }
})

bindTapAction(exitFullscreenButton, () => {
  if (isFullscreen) {
    void exitFullscreen()
  }
})

bindTapAction(lockControlsButton, () => {
  if (!isFullscreen) {
    return
  }
  controlsLocked = !controlsLocked
  clearControlsHideTimer()
  if (controlsLocked) {
    hideControls()
  } else {
    showControls()
    resetControlsAutoHide()
  }
})

appShell.addEventListener('mousemove', onFullscreenInteraction)
appShell.addEventListener('pointerdown', onFullscreenInteraction)
appShell.addEventListener('touchstart', onFullscreenInteraction, { passive: true })

controlsPanel.addEventListener('mousemove', onFullscreenInteraction)
controlsPanel.addEventListener('pointerdown', onFullscreenInteraction)
controlsPanel.addEventListener('touchstart', onFullscreenInteraction, { passive: true })

window.addEventListener('resize', onViewportChange)
window.addEventListener('orientationchange', onViewportChange)
window.visualViewport?.addEventListener('resize', onViewportChange)
window.visualViewport?.addEventListener('scroll', onViewportChange)

document.addEventListener('fullscreenchange', syncFullscreenFromBrowser)
document.addEventListener('webkitfullscreenchange', syncFullscreenFromBrowser as EventListener)

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') {
    return
  }
  if (isFullscreen && !isNativeFullscreen) {
    event.preventDefault()
    void exitFullscreen()
  }
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
    const nowMs = performance.now()
    if (nowMs - lastUiRefreshMs >= UI_REFRESH_INTERVAL_MS || snapshot.state !== previousTransportState) {
      updateUi()
      lastUiRefreshMs = nowMs
    }
    previousTimeSec = currentTimeSec
    previousTransportState = snapshot.state
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown render error'
    setStatus('预览加载失败', message)
    transport.setError()
    previewReady = false
  }
  requestAnimationFrame(frameLoop)
}

requestAnimationFrame(frameLoop)
isIOS = detectIosDevice()
isIPad = detectIpadDevice()
appShell.classList.toggle('ios-device', isIOS)
try {
  lowResolutionEnabled = window.localStorage.getItem(LOW_RESOLUTION_STORAGE_KEY) === '1'
} catch {
  lowResolutionEnabled = false
}
lowResolutionInput.checked = lowResolutionEnabled
applyFullscreenUi()
applyEffectLayerOpacity()
updateUi()
void bootstrap()
