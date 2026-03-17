import './main.css'

import { AudioTransport } from './lib/audioTransport'
import { GlPreviewRenderer } from './lib/glRenderer'
import { HudTimeline } from './lib/hudTimeline'
import { JudgementSounds } from './lib/judgementSounds'
import { MmwEffectSystem } from './lib/mmwEffectSystem'
import { MmwWasmPreview } from './lib/mmwWasm'
import { generateOverlayV3BackgroundObjectUrl } from './lib/overlayBackgroundGen'
import type {
  HitEvent,
  HudEvent,
  HudRuntimeState,
  PreviewRuntimeConfig,
  SongMetadata,
  TransportState,
  UrlPreviewParams,
} from './lib/types'
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
      <div class="ap-layer" id="ap-layer" hidden>
        <video class="ap-video-source" id="ap-video" preload="auto" playsinline></video>
        <canvas class="ap-canvas" id="ap-canvas"></canvas>
      </div>
      <div class="hud-layer" id="hud-layer" hidden>
        <div class="hud-layout" id="hud-layout">
          <div class="hud-score-root" id="hud-score-root">
            <img class="hud-score-bg" src="/assets/mmw/overlay/score/bg.png" alt="" />
            <div class="hud-score-bar-clip" id="hud-score-bar-clip">
              <img class="hud-score-bar" src="/assets/mmw/overlay/score/bar.png" alt="" />
            </div>
            <img class="hud-score-fg" src="/assets/mmw/overlay/score/fg.png" alt="" />
            <img class="hud-score-rank-txt" id="hud-score-rank-txt" src="/assets/mmw/overlay/score/rank/txt/en/d.png" alt="" />
            <img class="hud-score-rank-char" id="hud-score-rank-char" src="/assets/mmw/overlay/score/rank/chr/d.png" alt="" />
            <div class="hud-score-digits" id="hud-score-digits"></div>
          </div>
          <div class="hud-life-root" id="hud-life-root">
            <img class="hud-life-bg" src="/assets/mmw/overlay/life/v3/bg.png" alt="" />
            <div class="hud-life-fill-clip" id="hud-life-fill-clip">
              <img class="hud-life-fill" src="/assets/mmw/overlay/life/v3/normal.png" alt="" />
            </div>
            <div class="hud-life-digits" id="hud-life-digits"></div>
          </div>
          <div class="hud-combo-root" id="hud-combo-root" hidden>
            <img class="hud-combo-tag" src="/assets/mmw/overlay/combo/nt.png" alt="" />
            <div class="hud-combo-digits" id="hud-combo-digits"></div>
          </div>
          <div class="hud-judge-layer" id="hud-judge-layer" hidden></div>
          <div class="hud-intro-card" id="hud-intro-card" hidden>
            <div class="hud-intro-bg">
              <canvas class="hud-intro-bg-canvas" id="hud-intro-bg-canvas"></canvas>
            </div>
            <div class="hud-intro-cover-shell" id="hud-intro-cover-shell">
              <img class="hud-intro-cover" id="hud-intro-cover" alt="song cover" />
              <div class="hud-intro-difficulty" id="hud-intro-difficulty" hidden></div>
            </div>
            <div class="hud-intro-text">
              <div class="hud-intro-extra" id="hud-intro-extra" hidden></div>
              <div class="hud-intro-title" id="hud-intro-title">Unknown Title</div>
              <div class="hud-intro-meta" id="hud-intro-description-1">作詞：-    作曲：-    編曲：-</div>
              <div class="hud-intro-meta" id="hud-intro-description-2">Vo. -</div>
            </div>
          </div>
        </div>
      </div>
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
const apLayer = app.querySelector<HTMLDivElement>('#ap-layer')!
const apVideo = app.querySelector<HTMLVideoElement>('#ap-video')!
const apCanvas = app.querySelector<HTMLCanvasElement>('#ap-canvas')!
const hudLayer = app.querySelector<HTMLDivElement>('#hud-layer')!
const hudScoreRoot = app.querySelector<HTMLDivElement>('#hud-score-root')!
const hudLifeRoot = app.querySelector<HTMLDivElement>('#hud-life-root')!
const hudScoreBarClip = app.querySelector<HTMLDivElement>('#hud-score-bar-clip')!
const hudScoreRankTxt = app.querySelector<HTMLImageElement>('#hud-score-rank-txt')!
const hudScoreRankChar = app.querySelector<HTMLImageElement>('#hud-score-rank-char')!
const hudScoreDigits = app.querySelector<HTMLDivElement>('#hud-score-digits')!
const hudLifeFillClip = app.querySelector<HTMLDivElement>('#hud-life-fill-clip')!
const hudLifeDigits = app.querySelector<HTMLDivElement>('#hud-life-digits')!
const hudComboRoot = app.querySelector<HTMLDivElement>('#hud-combo-root')!
const hudComboDigits = app.querySelector<HTMLDivElement>('#hud-combo-digits')!
const hudJudgeLayer = app.querySelector<HTMLDivElement>('#hud-judge-layer')!
const hudIntroCard = app.querySelector<HTMLDivElement>('#hud-intro-card')!
const hudIntroBgCanvas = app.querySelector<HTMLCanvasElement>('#hud-intro-bg-canvas')!
const hudIntroCoverShell = app.querySelector<HTMLDivElement>('#hud-intro-cover-shell')!
const hudIntroCover = app.querySelector<HTMLImageElement>('#hud-intro-cover')!
const hudIntroText = app.querySelector<HTMLDivElement>('.hud-intro-text')!
const hudIntroDifficulty = app.querySelector<HTMLDivElement>('#hud-intro-difficulty')!
const hudIntroExtra = app.querySelector<HTMLDivElement>('#hud-intro-extra')!
const hudIntroTitle = app.querySelector<HTMLDivElement>('#hud-intro-title')!
const hudIntroDescription1 = app.querySelector<HTMLDivElement>('#hud-intro-description-1')!
const hudIntroDescription2 = app.querySelector<HTMLDivElement>('#hud-intro-description-2')!
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

type IntroCardMetadata = {
  title: string
  description1: string
  description2: string
  extra: string
  difficulty: string
}

const INTRO_COVER_LAYOUT = {
  leftPx: 148,
  bottomPx: 104,
  sizePx: 350,
  textLeftPx: 540,
  textBottomPx: 110,
  noCoverTextLeftPx: 186,
}

let normalizedOffsetMs = 0
let sourceOffsetSec = 0
let chartLeadInSec = 9
let audioStartDelaySec = 0
let previewReady = false
let rendererReady = false
let warningMessage = ''
const emptyFrame = new Float32Array()
let currentConfig = { ...defaultConfig }
let hitEvents: HitEvent[] = []
let nextHitEventIndex = 0
let hudEvents: HudEvent[] = []
let hudTimeline: HudTimeline | null = null
let songMetadata: SongMetadata = {
  title: '',
  artist: '',
  designer: '',
}
let introMetadata: IntroCardMetadata = {
  title: '',
  description1: '',
  description2: '',
  extra: '',
  difficulty: '',
}
let hudJudgeTimes: number[] = []
let hudComboTimes: number[] = []
let lastHudScoreText = ''
let lastHudComboText = ''
let lastHudLifeText = ''
let lastHudRank: HudRuntimeState['rank'] = 'd'
let coverUrl: string | null = null
let previousTimeSec = 0
let previousTransportState: TransportState = 'idle'
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
const HUD_INTRO_DURATION_SEC = 5
const MIN_CHART_LEAD_IN_SEC = 9
const JUDGE_ANIMATION_TOTAL_FRAMES = 20
const JUDGE_ANIMATION_FPS = 60
const FIXED_BACKGROUND_URL = '/assets/mmw/background_overlay.png'
const COMBO_DIGIT_STEP = 92
const COMBO_BASE_SCALE = 0.85
const LIFE_MAX_VALUE = 1000
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
let hudJudgeImage: HTMLImageElement | null = null
let backgroundObjectUrl: string | null = null
let backgroundApplySequence = 0
let chartPlayableEndSec = Number.POSITIVE_INFINITY
let apSequenceTriggered = false
let apPlaybackActive = false
let apStartDelayTimer: number | null = null
let apLastDrawMs = 0
const AP_VIDEO_URL = '/assets/mmw/overlay/ap.mp4'
const AP_START_DELAY_MS = 1000
const AP_DRAW_INTERVAL_MS = 1000 / 30
const AP_ALPHA_GAMMA = 1.12
const AP_COLOR_GAIN = 1.08
const apContext = apCanvas.getContext('2d', { willReadFrequently: true })
const introBgContext = hudIntroBgCanvas.getContext('2d')
const introGradImage = new Image()
let introGradReady = false
const INTRO_BG_WIDTH = 1920
const INTRO_BG_HEIGHT = 1080
const INTRO_BG_BASE_COLOR = 'rgba(104, 104, 156, 0.8)'
const INTRO_GRAD_DRAW_WIDTH = 2001
const INTRO_GRAD_DRAW_HEIGHT = 1125
const INTRO_GRAD_START_Y = 1500
const INTRO_GRAD_END_Y = 0
const INTRO_GRAD_START_SEC = 1
const INTRO_GRAD_DURATION_SEC = 2
const INTRO_GRAD_ALPHA = 0.1

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
  const hudScale = Math.min(bounds.width / 1920, bounds.height / 1080)
  hudLayer.style.setProperty('--hud-scale', String(hudScale))
  const dpr = getMaxQualityRenderDpr(bounds.width, bounds.height)
  renderer.resize(bounds.width, bounds.height, dpr)
  wasm.resize(bounds.width, bounds.height, dpr)
  effects.resize(bounds.width, bounds.height, dpr)
  resizeApCanvas()
}

function resizeApCanvas() {
  const bounds = previewPanel.getBoundingClientRect()
  const width = Math.max(2, Math.round(bounds.width))
  const height = Math.max(2, Math.round(bounds.height))
  if (apCanvas.width === width && apCanvas.height === height) {
    return
  }
  apCanvas.width = width
  apCanvas.height = height
}

function clearApCanvas() {
  if (!apContext) {
    return
  }
  apContext.clearRect(0, 0, apCanvas.width, apCanvas.height)
}

function hideApLayer() {
  apPlaybackActive = false
  apLayer.hidden = true
  previewPanel.classList.remove('ap-active')
  clearApCanvas()
}

function clearApStartDelay() {
  if (apStartDelayTimer !== null) {
    window.clearTimeout(apStartDelayTimer)
    apStartDelayTimer = null
  }
}

function stopApPlayback(resetTrigger: boolean) {
  clearApStartDelay()
  apVideo.pause()
  apVideo.currentTime = 0
  apLastDrawMs = 0
  if (resetTrigger) {
    apSequenceTriggered = false
  }
  hideApLayer()
}

function startApPlayback() {
  if (apSequenceTriggered) {
    return
  }
  apSequenceTriggered = true
  apPlaybackActive = true
  apLayer.hidden = false
  previewPanel.classList.add('ap-active')
  resizeApCanvas()
  clearApCanvas()
  apLastDrawMs = 0
  effects.reset()
  judgementSounds.stopAll()
  apVideo.currentTime = 0
  void apVideo.play().catch(() => {
    warningMessage = 'AP 视频播放失败，已跳过。'
    hideApLayer()
  })
}

function queueApPlayback() {
  if (apSequenceTriggered || apStartDelayTimer !== null) {
    return
  }
  apStartDelayTimer = window.setTimeout(() => {
    apStartDelayTimer = null
    if (!previewReady || !Number.isFinite(chartPlayableEndSec)) {
      return
    }
    const snapshot = transport.getSnapshot()
    if (toChartTimeSec(snapshot.currentTimeSec) + 0.05 < chartPlayableEndSec) {
      return
    }
    startApPlayback()
  }, AP_START_DELAY_MS)
}

function drawApFrame(nowMs: number) {
  if (!apPlaybackActive || !apContext || apVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return
  }
  if (nowMs - apLastDrawMs < AP_DRAW_INTERVAL_MS) {
    return
  }
  apLastDrawMs = nowMs

  const width = apCanvas.width
  const height = apCanvas.height
  apContext.clearRect(0, 0, width, height)
  apContext.drawImage(apVideo, 0, 0, width, height)

  const frame = apContext.getImageData(0, 0, width, height)
  const data = frame.data
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    const maxChannel = Math.max(r, g, b)
    const alpha = Math.round(Math.pow(maxChannel / 255, AP_ALPHA_GAMMA) * 255)
    data[index] = Math.min(255, Math.round(r * AP_COLOR_GAIN))
    data[index + 1] = Math.min(255, Math.round(g * AP_COLOR_GAIN))
    data[index + 2] = Math.min(255, Math.round(b * AP_COLOR_GAIN))
    data[index + 3] = alpha
  }
  apContext.putImageData(frame, 0, 0)
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

function revokeBackgroundObjectUrl() {
  if (!backgroundObjectUrl) {
    return
  }
  URL.revokeObjectURL(backgroundObjectUrl)
  backgroundObjectUrl = null
}

async function composeBackgroundWithCover(cover: string) {
  return generateOverlayV3BackgroundObjectUrl(cover)
}

async function createObjectUrlFromRemote(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)
  }
  const blob = await response.blob()
  return URL.createObjectURL(blob)
}

async function applyBackground(cover: string | null) {
  const sequence = ++backgroundApplySequence

  const applyTexture = async (url: string) => {
    await renderer.setBackgroundTexture(url)
  }

  if (!cover) {
    revokeBackgroundObjectUrl()
    await applyTexture(FIXED_BACKGROUND_URL)
    return
  }

  try {
    const merged = await composeBackgroundWithCover(cover)
    if (sequence !== backgroundApplySequence) {
      URL.revokeObjectURL(merged)
      return
    }
    revokeBackgroundObjectUrl()
    backgroundObjectUrl = merged
    await applyTexture(backgroundObjectUrl)
  } catch {
    if (sequence !== backgroundApplySequence) {
      return
    }
    try {
      const fallbackCoverObjectUrl = await createObjectUrlFromRemote(cover)
      if (sequence !== backgroundApplySequence) {
        URL.revokeObjectURL(fallbackCoverObjectUrl)
        return
      }
      revokeBackgroundObjectUrl()
      backgroundObjectUrl = fallbackCoverObjectUrl
      await applyTexture(backgroundObjectUrl)
      return
    } catch {
      revokeBackgroundObjectUrl()
      await applyTexture(FIXED_BACKGROUND_URL)
    }
  }
}

function formatScoreValue(value: number) {
  return String(Math.max(0, Math.round(value))).padStart(8, '0')
}

function createHudImage(path: string, className: string) {
  const image = document.createElement('img')
  image.className = className
  image.src = path
  image.alt = ''
  return image
}

function setScoreDigits(score: number) {
  const text = formatScoreValue(score)
  if (text === lastHudScoreText) {
    return
  }
  lastHudScoreText = text

  const fragment = document.createDocumentFragment()
  for (const digit of text) {
    const stack = document.createElement('span')
    stack.className = 'hud-score-digit-stack'
    stack.append(
      createHudImage(`/assets/mmw/overlay/score/digit/s${digit}.png`, 'hud-score-digit-shadow'),
      createHudImage(`/assets/mmw/overlay/score/digit/${digit}.png`, 'hud-score-digit-main'),
    )
    fragment.append(stack)
  }
  hudScoreDigits.replaceChildren(fragment)
}

function setLifeDigits(lifeRatio: number) {
  const lifeValue = Math.max(0, Math.round(LIFE_MAX_VALUE * Math.min(1, Math.max(0, lifeRatio))))
  const text = String(lifeValue)
  if (text === lastHudLifeText) {
    return
  }
  lastHudLifeText = text

  const fragment = document.createDocumentFragment()
  const reversed = [...text].reverse()
  for (let index = 0; index < reversed.length; index += 1) {
    const digit = reversed[index]
    const stack = document.createElement('span')
    stack.className = 'hud-life-digit-slot'
    stack.style.left = `${319 - index * 22}px`
    const digitStack = document.createElement('span')
    digitStack.className = 'hud-life-digit-stack'
    digitStack.append(
      createHudImage(`/assets/mmw/overlay/life/v3/digit/s${digit}.png`, 'hud-life-digit-shadow'),
      createHudImage(`/assets/mmw/overlay/life/v3/digit/${digit}.png`, 'hud-life-digit-main'),
    )
    stack.append(
      digitStack,
    )
    fragment.append(stack)
  }
  hudLifeDigits.replaceChildren(fragment)
}

function setComboDigits(combo: number) {
  if (combo <= 0) {
    if (lastHudComboText !== '') {
      lastHudComboText = ''
      hudComboDigits.replaceChildren()
    }
    return
  }

  const text = String(combo)
  if (text === lastHudComboText) {
    return
  }
  lastHudComboText = text

  const fragment = document.createDocumentFragment()
  const mid = text.length / 2
  for (let index = 0; index < text.length; index += 1) {
    const digit = text[index]
    const slot = document.createElement('span')
    slot.className = 'hud-combo-slot'
    slot.style.left = `calc(50% + ${(index - mid + 0.5) * COMBO_DIGIT_STEP}px)`
    slot.append(
      createHudImage(`/assets/mmw/overlay/combo/b${digit}.png`, 'hud-combo-digit-glow'),
      createHudImage(`/assets/mmw/overlay/combo/n${digit}.png`, 'hud-combo-digit'),
    )
    fragment.append(slot)
  }
  hudComboDigits.replaceChildren(fragment)
}

function setRankSprites(rank: HudRuntimeState['rank']) {
  if (rank === lastHudRank) {
    return
  }
  lastHudRank = rank
  hudScoreRankTxt.src = `/assets/mmw/overlay/score/rank/txt/en/${rank}.png`
  hudScoreRankChar.src = `/assets/mmw/overlay/score/rank/chr/${rank}.png`
}

function upperBoundNumber(values: readonly number[], target: number) {
  let low = 0
  let high = values.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (values[mid] <= target + 0.0001) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  return low
}

function renderJudgeBursts(currentTimeSec: number, hidden: boolean) {
  if (hidden || hudJudgeTimes.length === 0) {
    hudJudgeLayer.hidden = true
    return
  }

  const latestIndex = upperBoundNumber(hudJudgeTimes, currentTimeSec) - 1
  if (latestIndex < 0) {
    hudJudgeLayer.hidden = true
    return
  }
  const progressFrames = (currentTimeSec - hudJudgeTimes[latestIndex]) * JUDGE_ANIMATION_FPS
  if (progressFrames < 0 || progressFrames >= JUDGE_ANIMATION_TOTAL_FRAMES) {
    hudJudgeLayer.hidden = true
    return
  }

  let alpha = 1
  let rawScale = 2 / 3
  if (progressFrames < 2) {
    alpha = 0
  } else if (progressFrames < 5) {
    rawScale = (2 / 3) - Math.pow(-1.45 + progressFrames / 4, 4) * (2 / 3)
  }
  const scale = Math.max(0.01, rawScale * 1.5)

  if (!hudJudgeImage) {
    hudJudgeImage = createHudImage('/assets/mmw/overlay/judge/v3/1.png', 'hud-judge-burst')
    hudJudgeLayer.replaceChildren(hudJudgeImage)
  }
  hudJudgeImage.style.opacity = String(alpha)
  hudJudgeImage.style.transform = `scale(${scale})`

  hudJudgeLayer.hidden = false
}

function updateComboAnimation(currentTimeSec: number, combo: number, hidden: boolean) {
  if (hidden || combo <= 0 || hudComboTimes.length === 0) {
    hudComboDigits.style.transform = `translate(-50%, -50%) scale(${COMBO_BASE_SCALE})`
    hudComboRoot.style.setProperty('--combo-glow-opacity', '0')
    return
  }

  const latestIndex = upperBoundNumber(hudComboTimes, currentTimeSec) - 1
  if (latestIndex < 0) {
    hudComboDigits.style.transform = `translate(-50%, -50%) scale(${COMBO_BASE_SCALE})`
    hudComboRoot.style.setProperty('--combo-glow-opacity', '0')
    return
  }

  const progress = (currentTimeSec - hudComboTimes[latestIndex]) * JUDGE_ANIMATION_FPS
  const shiftScale = Math.min(1, Math.max(0.5, (progress / 8) * 0.5 + 0.5))
  const burstAlpha = progress < 14 ? Math.max(0, 1 - progress / 14) : 0
  const glowAlpha = Math.min(1, 0.25 + burstAlpha * 0.75)

  hudComboDigits.style.transform = `translate(-50%, -50%) scale(${shiftScale * COMBO_BASE_SCALE})`
  hudComboRoot.style.setProperty('--combo-glow-opacity', glowAlpha.toFixed(3))
}

function setHudCover(url: string | null) {
  hudIntroCoverShell.style.left = `${INTRO_COVER_LAYOUT.leftPx}px`
  hudIntroCoverShell.style.bottom = `${INTRO_COVER_LAYOUT.bottomPx}px`
  hudIntroCoverShell.style.width = `${INTRO_COVER_LAYOUT.sizePx}px`
  hudIntroCoverShell.style.height = `${INTRO_COVER_LAYOUT.sizePx}px`
  hudIntroText.style.left = `${INTRO_COVER_LAYOUT.textLeftPx}px`
  hudIntroText.style.bottom = `${INTRO_COVER_LAYOUT.textBottomPx}px`
  hudIntroCard.style.setProperty('--intro-text-left', `${INTRO_COVER_LAYOUT.noCoverTextLeftPx}px`)

  if (!url) {
    hudIntroCoverShell.hidden = true
    hudIntroCover.hidden = true
    hudIntroCover.removeAttribute('src')
    hudIntroCard.classList.add('no-cover')
    return
  }
  hudIntroCoverShell.hidden = false
  hudIntroCover.hidden = false
  hudIntroCard.classList.remove('no-cover')
  hudIntroCover.src = url
}

function sanitizeIntroText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? '' : trimmed
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function easeOutQuad(value: number) {
  const clamped = clamp01(value)
  return 1 - (1 - clamped) * (1 - clamped)
}

function drawIntroGradLayer(introTimeSec: number, waveStartSec: number) {
  if (!introBgContext || !introGradReady) {
    return
  }
  const normalized = (introTimeSec - waveStartSec) / INTRO_GRAD_DURATION_SEC
  if (normalized <= 0 || normalized >= 1) {
    return
  }
  const eased = easeOutQuad(normalized)
  const offsetY = INTRO_GRAD_START_Y + (INTRO_GRAD_END_Y - INTRO_GRAD_START_Y) * eased
  const drawX = (INTRO_BG_WIDTH - INTRO_GRAD_DRAW_WIDTH) / 2
  const drawY = (INTRO_BG_HEIGHT - INTRO_GRAD_DRAW_HEIGHT) / 2 + offsetY
  introBgContext.globalAlpha = INTRO_GRAD_ALPHA
  introBgContext.drawImage(introGradImage, drawX, drawY, INTRO_GRAD_DRAW_WIDTH, INTRO_GRAD_DRAW_HEIGHT)
}

function renderIntroBackdrop(currentTimeSec: number) {
  if (!introBgContext) {
    return
  }
  const introTimeSec = Math.min(HUD_INTRO_DURATION_SEC, Math.max(0, currentTimeSec))
  introBgContext.clearRect(0, 0, INTRO_BG_WIDTH, INTRO_BG_HEIGHT)
  introBgContext.globalAlpha = 1
  introBgContext.fillStyle = INTRO_BG_BASE_COLOR
  introBgContext.fillRect(0, 0, INTRO_BG_WIDTH, INTRO_BG_HEIGHT)
  drawIntroGradLayer(introTimeSec, INTRO_GRAD_START_SEC)
  drawIntroGradLayer(introTimeSec, INTRO_GRAD_START_SEC + INTRO_GRAD_DURATION_SEC)
  introBgContext.globalAlpha = 1
}

function normalizeDifficulty(value: string) {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '')
  switch (normalized) {
    case 'EASY':
    case 'NORMAL':
    case 'HARD':
    case 'EXPERT':
    case 'MASTER':
    case 'APPEND':
    case 'ETERNAL':
      return normalized
    default:
      return value.trim()
  }
}

function difficultyTheme(value: string) {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '')
  switch (normalized) {
    case 'EASY':
      return 'easy'
    case 'NORMAL':
      return 'normal'
    case 'HARD':
      return 'hard'
    case 'EXPERT':
      return 'expert'
    case 'MASTER':
      return 'master'
    case 'APPEND':
      return 'append'
    case 'ETERNAL':
      return 'eternal'
    default:
      return ''
  }
}

function resolveIntroMetadata(params: UrlPreviewParams, metadata: SongMetadata): IntroCardMetadata {
  const title = sanitizeIntroText(params.title) || sanitizeIntroText(metadata.title) || 'Unknown Title'
  const lyricist = sanitizeIntroText(params.lyricist) || '-'
  const composer = sanitizeIntroText(params.composer) || sanitizeIntroText(metadata.artist) || '-'
  const arranger = sanitizeIntroText(params.arranger) || '-'
  const vocal = sanitizeIntroText(params.vocal) || '-'
  const difficultyText = sanitizeIntroText(params.difficulty)

  return {
    title,
    description1:
      sanitizeIntroText(params.description1) || `作詞：${lyricist}    作曲：${composer}    編曲：${arranger}`,
    description2: sanitizeIntroText(params.description2) || `Vo. ${vocal}`,
    extra: sanitizeIntroText(params.extra),
    difficulty: difficultyText ? normalizeDifficulty(difficultyText) : '',
  }
}

function applyHudMetadata() {
  const title = introMetadata.title.trim() || songMetadata.title.trim() || 'Unknown Title'
  const description1 = introMetadata.description1.trim() || '-'
  const description2 = introMetadata.description2.trim() || '-'
  const extra = introMetadata.extra.trim()
  const difficulty = introMetadata.difficulty.trim()
  const theme = difficultyTheme(difficulty)

  hudIntroTitle.textContent = title
  hudIntroDescription1.textContent = description1
  hudIntroDescription2.textContent = description2
  hudIntroExtra.textContent = extra
  hudIntroExtra.hidden = extra === ''
  hudIntroDifficulty.textContent = difficulty
  hudIntroDifficulty.hidden = difficulty === ''
  if (theme) {
    hudIntroDifficulty.dataset.theme = theme
  } else {
    delete hudIntroDifficulty.dataset.theme
  }
  setHudCover(coverUrl)
}

function hasIntroCardContent() {
  return Boolean(
    coverUrl ||
      introMetadata.title.trim() ||
      introMetadata.description1.trim() ||
      introMetadata.description2.trim() ||
      introMetadata.extra.trim() ||
      introMetadata.difficulty.trim(),
  )
}

function isIntroVisible(currentTimeSec: number, transportState: TransportState) {
  return hasIntroCardContent() && transportState === 'playing' && currentTimeSec >= 0 && currentTimeSec < HUD_INTRO_DURATION_SEC
}

function updateTimingAlignment() {
  sourceOffsetSec = -normalizedOffsetMs / 1000
  chartLeadInSec = Math.max(sourceOffsetSec, MIN_CHART_LEAD_IN_SEC)
  audioStartDelaySec = Math.max(0, chartLeadInSec - sourceOffsetSec)
  transport.setAudioStartOffset(audioStartDelaySec)
}

function toChartTimeSec(currentTimeSec: number) {
  return currentTimeSec - chartLeadInSec
}

function renderHud(
  state: HudRuntimeState,
  currentTimeSec: number,
  transportState: TransportState,
  chartTimeSec: number,
) {
  hudLayer.hidden = !previewReady
  if (!previewReady) {
    previewPanel.classList.remove('intro-active')
    return
  }

  const hasIntroContent = hasIntroCardContent()
  const introVisible = isIntroVisible(currentTimeSec, transportState)
  if (introVisible) {
    renderIntroBackdrop(currentTimeSec)
  }
  previewPanel.classList.toggle('intro-active', introVisible)
  hudScoreRoot.hidden = false
  hudLifeRoot.hidden = false
  hudComboRoot.hidden = introVisible || state.combo <= 0
  hudIntroCard.hidden = !hasIntroContent
  hudIntroCard.classList.toggle('visible', introVisible)

  setRankSprites(state.rank)
  setScoreDigits(state.score)
  setLifeDigits(state.lifeRatio)
  setComboDigits(state.combo)
  updateComboAnimation(chartTimeSec, state.combo, introVisible)
  hudScoreBarClip.style.width = `${Math.min(100, Math.max(0, state.scoreBarRatio * 100))}%`
  hudLifeFillClip.style.width = `${Math.min(100, Math.max(0, state.lifeRatio * 100))}%`
  renderJudgeBursts(chartTimeSec, introVisible)
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
    applyRenderSize()

    setStatus('正在加载谱面', '正在通过 URL 参数拉取 SUS 文件。')
    const params = parseUrlPreviewParams(new URL(window.location.href))
    coverUrl = params.cover
    void applyBackground(coverUrl).catch(() => {
      // Ignore background texture failures and keep default background.
    })
    bgmExpected = !!params.bgm
    bgmLoaded = !params.bgm
    const susFetchPromise = fetchText(params.sus)
    const bgmFetchPromise = params.bgm
      ? fetchArrayBuffer(params.bgm, BGM_FETCH_TIMEOUT_MS)
      : Promise.resolve<ArrayBuffer | null>(null)
    const susText = await susFetchPromise
    normalizedOffsetMs = normalizeOffsetMs(params.rawOffsetMs, susText)
    updateTimingAlignment()

    wasm.loadSusText(susText, -chartLeadInSec * 1000)
    wasm.setPreviewConfig(currentConfig)
    songMetadata = wasm.getSongMetadata()
    introMetadata = resolveIntroMetadata(params, songMetadata)
    applyHudMetadata()
    hitEvents = wasm.getHitEvents().map((event) => ({
      ...event,
      timeSec: event.timeSec,
      endTimeSec:
        event.endTimeSec === undefined
          ? undefined
          : event.endTimeSec,
    }))
    hudEvents = wasm.getHudEvents().map((event) => ({
      ...event,
      timeSec: event.timeSec,
    }))
    hudJudgeTimes = hudEvents
      .filter((event) => event.showJudge)
      .map((event) => event.timeSec)
      .sort((left, right) => left - right)
    hudComboTimes = hudEvents.map((event) => event.timeSec).sort((left, right) => left - right)
    hudTimeline = new HudTimeline(hudEvents)
    lastHudScoreText = ''
    lastHudComboText = ''
    lastHudLifeText = ''
    lastHudRank = 'd'
    nextHitEventIndex = 0

    const chartEndTimeSec = wasm.getChartEndTimeSec()
    chartPlayableEndSec = Math.max(0, chartEndTimeSec)
    const minimumDurationSec = Math.max(chartEndTimeSec + chartLeadInSec + 1, 1)
    transport.setDuration(minimumDurationSec)
    transport.setReady()
    transport.seek(0)
    previousTimeSec = toChartTimeSec(0)
    nextHitEventIndex = lowerBoundHitEvent(previousTimeSec)
    stopApPlayback(true)

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
    hudTimeline = null
    hudEvents = []
    hudJudgeTimes = []
    hudComboTimes = []
    chartPlayableEndSec = Number.POSITIVE_INFINITY
    stopApPlayback(true)
    lastHudLifeText = ''
    hudLayer.hidden = true
    previewPanel.classList.remove('intro-active')
    setStatus('预览加载失败', message)
    transport.setError()
    updateUi()
  }
}

apVideo.src = AP_VIDEO_URL
apVideo.loop = false
apVideo.preload = 'auto'
apVideo.playsInline = true
introGradImage.src = '/assets/mmw/overlay/start_grad.png'
introGradImage.addEventListener('load', () => {
  introGradReady = true
  renderIntroBackdrop(0)
})
introGradImage.addEventListener('error', () => {
  introGradReady = false
})
apVideo.addEventListener('ended', () => {
  hideApLayer()
})
apVideo.addEventListener('error', () => {
  warningMessage = 'AP 视频加载失败，已跳过。'
  hideApLayer()
})

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
  stopApPlayback(true)
  const chartTimeSec = toChartTimeSec(nextTime)
  nextHitEventIndex = lowerBoundHitEvent(chartTimeSec)
  previousTimeSec = chartTimeSec
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
    const introVisible = isIntroVisible(currentTimeSec, snapshot.state)
    const chartTimeSec = toChartTimeSec(currentTimeSec)
    const frame = previewReady ? wasm.render(chartTimeSec) : { count: 0, floats: emptyFrame }
    const renderConfig = introVisible
      ? {
          ...currentConfig,
          stageOpacity: 0,
        }
      : currentConfig
    renderer.render(frame.floats, frame.count, renderConfig)

    const reachedChartEnd =
      previewReady &&
      Number.isFinite(chartPlayableEndSec) &&
      chartTimeSec >= chartPlayableEndSec - 0.0001 &&
      (snapshot.state === 'playing' || previousTransportState === 'playing')
    if (reachedChartEnd) {
      queueApPlayback()
    }

    if (previewReady) {
      if (introVisible) {
        nextHitEventIndex = lowerBoundHitEvent(chartTimeSec)
        effects.reset()
        judgementSounds.stopAll()
      } else if (
        snapshot.state !== 'playing' ||
        previousTransportState !== 'playing' ||
        chartTimeSec < previousTimeSec ||
        chartTimeSec - previousTimeSec > 0.25
      ) {
        nextHitEventIndex = lowerBoundHitEvent(chartTimeSec)
        if (snapshot.state !== 'playing') {
          effects.reset()
          judgementSounds.stopAll()
        } else {
          resumeActiveHoldLoops(chartTimeSec)
        }
      } else {
        emitHitEvents(previousTimeSec, chartTimeSec)
      }
    }

    if (previewReady && hudTimeline) {
      renderHud(hudTimeline.snapshotAt(chartTimeSec), currentTimeSec, snapshot.state, chartTimeSec)
    } else {
      hudLayer.hidden = true
      previewPanel.classList.remove('intro-active')
    }

    effects.render(performance.now() / 1000)
    const nowMs = performance.now()
    drawApFrame(nowMs)
    if (nowMs - lastUiRefreshMs >= UI_REFRESH_INTERVAL_MS || snapshot.state !== previousTransportState) {
      updateUi()
      lastUiRefreshMs = nowMs
    }
    previousTimeSec = chartTimeSec
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
applyHudMetadata()
setScoreDigits(0)
setLifeDigits(1)
setComboDigits(0)
hudScoreBarClip.style.width = '0%'
hudLifeFillClip.style.width = '100%'
hudIntroBgCanvas.width = INTRO_BG_WIDTH
hudIntroBgCanvas.height = INTRO_BG_HEIGHT
renderIntroBackdrop(0)
hudLayer.hidden = true
stopApPlayback(true)
window.addEventListener('beforeunload', () => {
  stopApPlayback(false)
  revokeBackgroundObjectUrl()
})
updateUi()
void bootstrap()
