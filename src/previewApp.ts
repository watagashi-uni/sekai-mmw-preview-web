import './main.css'

import { MmwWasmPlayer } from './lib/mmwWasm'
import type { PreviewRuntimeConfig, SessionMetadata, UrlPreviewParams, WasmPlayerSnapshot } from './lib/types'
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

const MIN_CHART_LEAD_IN_MS = 9000
const FETCH_TIMEOUT_MS = 30000
const LOW_RESOLUTION_STORAGE_KEY = 'preview-low-resolution'
const FONT_HINT_SEEN_STORAGE_KEY = 'preview-font-hint-seen'
const MAX_RENDER_WIDTH = 1920
const MAX_RENDER_HEIGHT = 1080
const LOW_RENDER_WIDTH = 1280
const LOW_RENDER_HEIGHT = 720
const UI_REFRESH_INTERVAL_MS = 50
const CONTROLS_AUTO_HIDE_MS = 3000
const AP_VIDEO_URL = '/assets/mmw/overlay/ap.mp4'
const AP_DRAW_INTERVAL_MS = 1000 / 30
const AP_ALPHA_GAMMA = 1.12
const AP_COLOR_GAIN = 1.08

const SOUND_URLS = {
  perfect: '/assets/mmw/sound/se_live_perfect.mp3',
  criticalTap: '/assets/mmw/sound/se_live_critical.mp3',
  flick: '/assets/mmw/sound/se_live_flick.mp3',
  flickCritical: '/assets/mmw/sound/se_live_flick_critical.mp3',
  trace: '/assets/mmw/sound/se_live_trace.mp3',
  traceCritical: '/assets/mmw/sound/se_live_trace_critical.mp3',
  tick: '/assets/mmw/sound/se_live_connect.mp3',
  tickCritical: '/assets/mmw/sound/se_live_connect_critical.mp3',
  holdLoop: '/assets/mmw/sound/se_live_long.mp3',
  holdLoopCritical: '/assets/mmw/sound/se_live_long_critical.mp3',
} as const

type BootLocalPayload = {
  susFile: File
  bgmFile: File | null
  coverFile: File | null
  rawOffsetMs: number | null
  title: string | null
  lyricist: string | null
  composer: string | null
  arranger: string | null
  vocal: string | null
  difficulty: string | null
  showLockControlsButton: boolean
}

type LocalPreviewInput = Omit<BootLocalPayload, 'showLockControlsButton'> & {
  showLockControlsButton?: boolean
}

declare global {
  interface Window {
    __MMW_BOOT_LOCAL_PAYLOAD?: BootLocalPayload
  }
}

type WebkitFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

type WebkitFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

const appRoot = document.querySelector<HTMLDivElement>('#app')
if (!appRoot) {
  throw new Error('Missing app root.')
}
const app = appRoot

app.innerHTML = `
  <div class="app-layout">
    <aside class="app-sidebar">
      <div class="sidebar-header">
        <div class="sidebar-brand">PJSK谱面在线预览</div>
        <button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="Toggle Menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      </div>
      <nav class="sidebar-nav" id="sidebar-nav">
        <a href="/" class="nav-link">主页</a>
        <a href="/upload" class="nav-link">加载自制谱</a>
        <a href="/preview" class="nav-link is-active">预览页</a>
        <a href="/about" class="nav-link">关于</a>
        <a href="https://viewer.unipjsk.com/musics" target="_blank" rel="noreferrer" class="nav-link">官服歌曲</a>
      </nav>
    </aside>
    <main class="app-main">
      <div class="app-shell" id="app-shell">
        <section class="preview-panel" id="preview-panel">
          <canvas class="preview-canvas" id="preview-canvas"></canvas>
          <div class="ap-layer" id="ap-layer" hidden>
            <video class="ap-video-source" id="ap-video" preload="auto" playsinline></video>
            <canvas class="ap-canvas" id="ap-canvas"></canvas>
          </div>
          <button class="exit-fullscreen-button" id="exit-fullscreen-button" type="button" hidden title="退出全屏" aria-label="退出全屏"></button>
          <button class="lock-controls-button" id="lock-controls-button" type="button" hidden title="锁定控制栏" aria-label="锁定控制栏"></button>
          <div class="status-layer" id="status-layer">
            <div class="status-card">
              <div class="status-title" id="status-title">正在初始化预览</div>
              <div class="status-text" id="status-text">加载 wasm 模块和原生 Overlay 资源中…</div>
            </div>
          </div>
          <div class="unlock-layer" id="unlock-layer" hidden>
            <div class="unlock-card">
              <div class="status-title">浏览器需要一次点击来启动音频</div>
              <div class="status-text">点击后会继续当前播放请求，BGM 与 key 音会按同一时间轴同步。</div>
              <button class="unlock-button" id="unlock-button" type="button">启动音频</button>
            </div>
          </div>
          <div class="bgm-loading-layer" id="bgm-loading-layer" hidden>
            <div class="status-card">
              <div class="status-title">正在加载歌曲</div>
              <div class="status-text">BGM 还在解码，请稍候。</div>
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
            <label class="background-brightness" aria-label="backgroundBrightness">
              背景亮度
              <input id="background-brightness-input" type="range" min="60" max="100" step="1" value="100" />
              <output id="background-brightness-output">100%</output>
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
          <div class="local-loader-panel" id="local-loader-panel" hidden>
            <div class="local-loader-title">本地预览模式</div>
            <div class="local-loader-text">未检测到 URL 参数。上传本地文件并填写参数后，点击加载即可预览。</div>
            <form class="local-loader-form" id="local-loader-form">
              <table class="local-loader-table">
                <tbody>
                  <tr>
                    <th><label for="local-sus-input">SUS 谱面</label></th>
                    <td><input id="local-sus-input" type="file" accept=".sus,text/plain" required /></td>
                  </tr>
                  <tr>
                    <th><label for="local-bgm-input">BGM（可选）</label></th>
                    <td><input id="local-bgm-input" type="file" accept="audio/*,.mp3,.ogg,.wav,.m4a,.aac,.flac" /></td>
                  </tr>
                  <tr>
                    <th><label for="local-cover-input">曲绘（可选）</label></th>
                    <td><input id="local-cover-input" type="file" accept="image/*" /></td>
                  </tr>
                  <tr>
                    <th><label for="local-offset-input">offset（ms）</label></th>
                    <td><input id="local-offset-input" type="text" inputmode="decimal" placeholder="例如 9000" /></td>
                  </tr>
                  <tr>
                    <th><label for="local-difficulty-input">难度</label></th>
                    <td><input id="local-difficulty-input" type="text" placeholder="0-6 或 EASY/NORMAL/..." /></td>
                  </tr>
                  <tr>
                    <th><label for="local-title-input">曲名</label></th>
                    <td><input id="local-title-input" type="text" /></td>
                  </tr>
                  <tr>
                    <th><label for="local-lyricist-input">作词</label></th>
                    <td><input id="local-lyricist-input" type="text" /></td>
                  </tr>
                  <tr>
                    <th><label for="local-composer-input">作曲</label></th>
                    <td><input id="local-composer-input" type="text" /></td>
                  </tr>
                  <tr>
                    <th><label for="local-arranger-input">编曲</label></th>
                    <td><input id="local-arranger-input" type="text" /></td>
                  </tr>
                  <tr>
                    <th><label for="local-vocal-input">演唱</label></th>
                    <td><input id="local-vocal-input" type="text" /></td>
                  </tr>
                  <tr>
                    <th>全屏锁屏组件</th>
                    <td>
                      <label class="local-lock-toggle">
                        <input id="local-show-lock-input" type="checkbox" checked />
                        是否显示锁屏组件
                      </label>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div class="local-loader-actions">
                <button id="local-loader-submit" type="submit">加载本地预览</button>
              </div>
            </form>
          </div>
          <div class="attribution-line">
            Adapted from <a href="https://github.com/crash5band/MikuMikuWorld" target="_blank" rel="noreferrer">MikuMikuWorld</a> by Crash5b (MIT). Ported to browser by watagashi-uni. Project: <a href="https://github.com/watagashi-uni/sekai-mmw-preview-web" target="_blank" rel="noreferrer">sekai-mmw-preview-web</a>.
          </div>
        </section>
      </div>
    </main>
  </div>
`

const menuToggle = app.querySelector<HTMLButtonElement>('#mobile-menu-toggle')
menuToggle?.addEventListener('click', () => {
  app.querySelector('#sidebar-nav')?.classList.toggle('is-open')
})

const appShell = app.querySelector<HTMLElement>('#app-shell')!
const previewPanel = app.querySelector<HTMLElement>('#preview-panel')!
const canvas = app.querySelector<HTMLCanvasElement>('#preview-canvas')!
const apLayer = app.querySelector<HTMLDivElement>('#ap-layer')!
const apVideo = app.querySelector<HTMLVideoElement>('#ap-video')!
const apCanvas = app.querySelector<HTMLCanvasElement>('#ap-canvas')!
const exitFullscreenButton = app.querySelector<HTMLButtonElement>('#exit-fullscreen-button')!
const lockControlsButton = app.querySelector<HTMLButtonElement>('#lock-controls-button')!
const statusLayer = app.querySelector<HTMLDivElement>('#status-layer')!
const statusTitle = app.querySelector<HTMLDivElement>('#status-title')!
const statusText = app.querySelector<HTMLDivElement>('#status-text')!
const unlockLayer = app.querySelector<HTMLDivElement>('#unlock-layer')!
const unlockButton = app.querySelector<HTMLButtonElement>('#unlock-button')!
const bgmLoadingLayer = app.querySelector<HTMLDivElement>('#bgm-loading-layer')!
const controlsPanel = app.querySelector<HTMLElement>('.controls')!
const playToggle = app.querySelector<HTMLButtonElement>('#play-toggle')!
const timeReadout = app.querySelector<HTMLDivElement>('#time-readout')!
const progressInput = app.querySelector<HTMLInputElement>('#progress-input')!
const speedSelect = app.querySelector<HTMLSelectElement>('#speed-select')!
const noteSpeedMinusOneButton = app.querySelector<HTMLButtonElement>('#note-speed-minus-one-button')!
const noteSpeedMinusPointOneButton = app.querySelector<HTMLButtonElement>('#note-speed-minus-point-one-button')!
const noteSpeedOutput = app.querySelector<HTMLOutputElement>('#note-speed-output')!
const noteSpeedPlusPointOneButton = app.querySelector<HTMLButtonElement>('#note-speed-plus-point-one-button')!
const noteSpeedPlusOneButton = app.querySelector<HTMLButtonElement>('#note-speed-plus-one-button')!
const backgroundBrightnessInput = app.querySelector<HTMLInputElement>('#background-brightness-input')!
const backgroundBrightnessOutput = app.querySelector<HTMLOutputElement>('#background-brightness-output')!
const lowEffectsInput = app.querySelector<HTMLInputElement>('#low-effects-input')!
const lowResolutionInput = app.querySelector<HTMLInputElement>('#low-resolution-input')!
const webFullscreenToggle = app.querySelector<HTMLButtonElement>('#web-fullscreen-toggle')!
const fullscreenToggle = app.querySelector<HTMLButtonElement>('#fullscreen-toggle')!
const iosHint = app.querySelector<HTMLDivElement>('#ios-hint')!
const warningText = app.querySelector<HTMLDivElement>('#warning-text')!
const localLoaderPanel = app.querySelector<HTMLDivElement>('#local-loader-panel')!
const localLoaderForm = app.querySelector<HTMLFormElement>('#local-loader-form')!
const localSusInput = app.querySelector<HTMLInputElement>('#local-sus-input')!
const localBgmInput = app.querySelector<HTMLInputElement>('#local-bgm-input')!
const localCoverInput = app.querySelector<HTMLInputElement>('#local-cover-input')!
const localOffsetInput = app.querySelector<HTMLInputElement>('#local-offset-input')!
const localDifficultyInput = app.querySelector<HTMLInputElement>('#local-difficulty-input')!
const localTitleInput = app.querySelector<HTMLInputElement>('#local-title-input')!
const localLyricistInput = app.querySelector<HTMLInputElement>('#local-lyricist-input')!
const localComposerInput = app.querySelector<HTMLInputElement>('#local-composer-input')!
const localArrangerInput = app.querySelector<HTMLInputElement>('#local-arranger-input')!
const localVocalInput = app.querySelector<HTMLInputElement>('#local-vocal-input')!
const localShowLockInput = app.querySelector<HTMLInputElement>('#local-show-lock-input')!
const localLoaderSubmit = app.querySelector<HTMLButtonElement>('#local-loader-submit')!

const apContext = apCanvas.getContext('2d', { willReadFrequently: true })
const player = new MmwWasmPlayer()
const resizeObserver = new ResizeObserver(() => {
  applyRenderSize()
})

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

const EMPTY_SNAPSHOT: WasmPlayerSnapshot = {
  currentTimeSec: 0,
  durationSec: 0,
  chartEndSec: 0,
  sourceOffsetSec: 0,
  effectiveLeadInSec: 9,
  audioStartDelaySec: 0,
  apStartSec: Number.POSITIVE_INFINITY,
  transportState: 'idle',
  requiresGesture: false,
  hasAudio: false,
  warnings: '',
}

let runtimeReady = false
let previewReady = false
let currentConfig = { ...defaultConfig }
let currentSnapshot: WasmPlayerSnapshot = { ...EMPTY_SNAPSHOT }
let resourceWarningMessage = ''
let sessionWarningMessage = ''
let staticResourcesPromise: Promise<void> | null = null
let pendingPlayAfterUnlock = false
let lastUiRefreshMs = 0
let lastTouchEndMs = 0
let isFullscreen = false
let isNativeFullscreen = false
let controlsVisible = true
let controlsLocked = false
let showLockControlsButton = true
let controlsHideTimer: number | null = null
let iosTouchGuardsCleanup: (() => void) | null = null
let isIOS = false
let isIPad = false
let lowResolutionEnabled = false
let shouldShowInitialFontHint = false
let apSequenceTriggered = false
let apPlaybackActive = false
let apLastDrawMs = 0
const debugErrors = (window.__MMW_DEBUG_ERRORS__ ??= [])

function pushDebugError(error: unknown) {
  const text =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.stack || error.message
        : String(error)
  debugErrors.push(text)
  if (debugErrors.length > 60) {
    debugErrors.splice(0, debugErrors.length - 60)
  }
  console.error('[preview-debug]', text)
}

window.addEventListener('error', (event) => {
  const detail = event.error instanceof Error ? event.error.stack || event.error.message : event.message
  pushDebugError(`window.error: ${detail}`)
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.stack || event.reason.message : String(event.reason)
  pushDebugError(`unhandledrejection: ${reason}`)
})

function renderTextIconButton(icon: string, label: string) {
  return `<span class="btn-icon">${icon}</span><span class="btn-label">${label}</span>`
}

function buildStaticAssetManifest() {
  const assets: Array<{ key: string; url: string }> = [
    { key: 'background_overlay.png', url: '/assets/mmw/background_overlay.png' },
    { key: 'stage.png', url: '/assets/mmw/stage.png' },
    { key: 'notes.png', url: '/assets/mmw/notes.png' },
    { key: 'longNoteLine.png', url: '/assets/mmw/longNoteLine.png' },
    { key: 'touchLine_eff.png', url: '/assets/mmw/touchLine_eff.png' },
    { key: 'effect.png', url: '/assets/mmw/effect.png' },
    { key: 'overlay/bggen/v3/base.png', url: '/assets/mmw/overlay/bggen/v3/base.png' },
    { key: 'overlay/bggen/v3/bottom.png', url: '/assets/mmw/overlay/bggen/v3/bottom.png' },
    { key: 'overlay/bggen/v3/center_cover.png', url: '/assets/mmw/overlay/bggen/v3/center_cover.png' },
    { key: 'overlay/bggen/v3/center_mask.png', url: '/assets/mmw/overlay/bggen/v3/center_mask.png' },
    { key: 'overlay/bggen/v3/side_cover.png', url: '/assets/mmw/overlay/bggen/v3/side_cover.png' },
    { key: 'overlay/bggen/v3/side_mask.png', url: '/assets/mmw/overlay/bggen/v3/side_mask.png' },
    { key: 'overlay/bggen/v3/windows.png', url: '/assets/mmw/overlay/bggen/v3/windows.png' },
    { key: 'overlay/score/bg.png', url: '/assets/mmw/overlay/score/bg.png' },
    { key: 'overlay/score/fg.png', url: '/assets/mmw/overlay/score/fg.png' },
    { key: 'overlay/score/bar.png', url: '/assets/mmw/overlay/score/bar.png' },
    { key: 'overlay/life/v3/bg.png', url: '/assets/mmw/overlay/life/v3/bg.png' },
    { key: 'overlay/life/v3/normal.png', url: '/assets/mmw/overlay/life/v3/normal.png' },
    { key: 'overlay/combo/pt.png', url: '/assets/mmw/overlay/combo/pt.png' },
    { key: 'overlay/combo/pe.png', url: '/assets/mmw/overlay/combo/pe.png' },
    { key: 'overlay/judge/v3/1.png', url: '/assets/mmw/overlay/judge/v3/1.png' },
    { key: 'overlay/autolive.png', url: '/assets/mmw/overlay/autolive.png' },
    { key: 'overlay/start_grad.png', url: '/assets/mmw/overlay/start_grad.png' },
  ]

  for (const rank of ['d', 'c', 'b', 'a', 's']) {
    assets.push({ key: `overlay/score/rank/chr/${rank}.png`, url: `/assets/mmw/overlay/score/rank/chr/${rank}.png` })
    assets.push({ key: `overlay/score/rank/txt/en/${rank}.png`, url: `/assets/mmw/overlay/score/rank/txt/en/${rank}.png` })
  }

  for (const char of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'n', '+']) {
    const fileStem = char === '+' ? 'plus' : char
    const shadowStem = char === '+' ? 'splus' : `s${char}`
    assets.push({ key: `overlay/score/digit/${fileStem}.png`, url: `/assets/mmw/overlay/score/digit/${fileStem}.png` })
    assets.push({ key: `overlay/score/digit/${shadowStem}.png`, url: `/assets/mmw/overlay/score/digit/${shadowStem}.png` })
  }

  for (const char of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
    assets.push({ key: `overlay/combo/p${char}.png`, url: `/assets/mmw/overlay/combo/p${char}.png` })
    assets.push({ key: `overlay/combo/b${char}.png`, url: `/assets/mmw/overlay/combo/b${char}.png` })
    assets.push({ key: `overlay/life/v3/digit/${char}.png`, url: `/assets/mmw/overlay/life/v3/digit/${char}.png` })
    assets.push({ key: `overlay/life/v3/digit/s${char}.png`, url: `/assets/mmw/overlay/life/v3/digit/s${char}.png` })
  }

  const fonts: Array<{ key: string; url: string }> = [
    { key: 'font/FOT-RodinNTLGPro-DB.ttf', url: '/assets/mmw/font/FOT-RodinNTLGPro-DB.ttf' },
    { key: 'font/FOT-RodinNTLG Pro EB.otf', url: '/assets/mmw/font/FOT-RodinNTLG Pro EB.otf' },
    { key: 'font/NotoSansCJKSC-Black.ttf', url: '/assets/mmw/font/NotoSansCJKSC-Black.ttf' },
  ]

  const sounds = Object.entries(SOUND_URLS).map(([key, url]) => ({ key, url }))
  return { assets, fonts, sounds }
}

function takeBootLocalPayload() {
  const payload = window.__MMW_BOOT_LOCAL_PAYLOAD ?? null
  delete window.__MMW_BOOT_LOCAL_PAYLOAD
  return payload
}

function detectIosDevice() {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function detectIpadDevice() {
  const ua = navigator.userAgent
  return /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function setStatus(title: string, text: string) {
  statusTitle.textContent = title
  const detail = debugErrors.length > 0 ? `\n\n${debugErrors.slice(-4).join('\n\n')}` : ''
  statusText.textContent = `${text}${detail}`
  statusLayer.hidden = false
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

function setLocalLoaderVisible(visible: boolean) {
  localLoaderPanel.hidden = !visible
}

function setLocalLoaderBusy(busy: boolean) {
  localLoaderSubmit.disabled = busy
  localLoaderSubmit.textContent = busy ? '正在加载…' : '加载本地预览'
}

function readOptionalTextInput(input: HTMLInputElement) {
  const trimmed = input.value.trim()
  return trimmed === '' ? null : trimmed
}

function readOptionalOffsetMsInput(input: HTMLInputElement) {
  const trimmed = input.value.trim()
  if (trimmed === '') {
    return null
  }
  const parsed = Number.parseFloat(trimmed)
  if (!Number.isFinite(parsed)) {
    throw new Error('offset 必须是数字（毫秒）。')
  }
  return parsed
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
      throw new Error(`Failed to fetch resource: ${response.status} ${response.statusText}`)
    }
    return response.arrayBuffer()
  } finally {
    window.clearTimeout(timer)
  }
}

function toBytes(buffer: ArrayBuffer) {
  return new Uint8Array(buffer)
}

function getSessionMetadata(params: UrlPreviewParams): SessionMetadata {
  return {
    title: params.title,
    lyricist: params.lyricist,
    composer: params.composer,
    arranger: params.arranger,
    vocal: params.vocal,
    difficulty: params.difficulty,
  }
}

function composeWarningText() {
  return [resourceWarningMessage, sessionWarningMessage, currentSnapshot.warnings, ...debugErrors.slice(-2)]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' | ')
}

async function ensureStaticResourcesLoaded() {
  if (staticResourcesPromise) {
    return staticResourcesPromise
  }

  staticResourcesPromise = (async () => {
    const manifest = buildStaticAssetManifest()
    await Promise.all(
      manifest.assets.map(async ({ key, url }) => {
        const data = toBytes(await fetchArrayBuffer(url, FETCH_TIMEOUT_MS))
        await player.preloadAsset(key, data)
      }),
    )
    await Promise.all(
      manifest.fonts.map(async ({ key, url }) => {
        const data = toBytes(await fetchArrayBuffer(url, FETCH_TIMEOUT_MS))
        await player.preloadFont(key, data)
      }),
    )
    const soundResults = await Promise.allSettled(
      manifest.sounds.map(async ({ key, url }) => {
        const data = toBytes(await fetchArrayBuffer(url, FETCH_TIMEOUT_MS))
        await player.preloadSound(key, data)
      }),
    )
    if (soundResults.some((result) => result.status === 'rejected')) {
      resourceWarningMessage = '部分 key 音资源加载失败，可能会缺少音效。'
    }
  })()

  return staticResourcesPromise
}

function getRenderTargetSize(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    return { width: 1, height: 1, dpr: 1 }
  }
  const cssWidth = Math.max(1, Math.round(width))
  const cssHeight = Math.max(1, Math.round(height))
  const maxWidth = lowResolutionEnabled ? LOW_RENDER_WIDTH : MAX_RENDER_WIDTH
  const maxHeight = lowResolutionEnabled ? LOW_RENDER_HEIGHT : MAX_RENDER_HEIGHT
  const deviceDpr =
    typeof window === 'undefined'
      ? 1
      : Math.min(Math.max(window.devicePixelRatio || 1, 1), 3)
  const dpr = Math.min(
    deviceDpr,
    Math.max(1, maxWidth / cssWidth),
    Math.max(1, maxHeight / cssHeight),
  )
  return {
    width: cssWidth,
    height: cssHeight,
    dpr,
  }
}

function resizeApCanvas() {
  const bounds = previewPanel.getBoundingClientRect()
  const renderSize = getRenderTargetSize(bounds.width, bounds.height)
  const width = Math.max(2, Math.round(renderSize.width * renderSize.dpr))
  const height = Math.max(2, Math.round(renderSize.height * renderSize.dpr))
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

function applyRenderSize() {
  if (!runtimeReady) {
    return
  }
  const bounds = previewPanel.getBoundingClientRect()
  const renderSize = getRenderTargetSize(bounds.width, bounds.height)
  player.resize(renderSize.width, renderSize.height, renderSize.dpr)
  resizeApCanvas()
}

function stopApPlayback(resetTrigger: boolean) {
  apVideo.pause()
  apVideo.currentTime = 0
  apLastDrawMs = 0
  apPlaybackActive = false
  apLayer.hidden = true
  previewPanel.classList.remove('ap-active')
  clearApCanvas()
  if (resetTrigger) {
    apSequenceTriggered = false
  }
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
  apVideo.currentTime = 0
  apVideo.playbackRate = Number(speedSelect.value)
  void apVideo.play().catch(() => {
    sessionWarningMessage = 'AP 视频播放失败，已跳过。'
    stopApPlayback(false)
    updateUi(true)
  })
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

function updateUi(force = false) {
  const nowMs = performance.now()
  if (!force && nowMs - lastUiRefreshMs < UI_REFRESH_INTERVAL_MS) {
    return
  }
  lastUiRefreshMs = nowMs

  const playState = currentSnapshot.transportState === 'playing' ? 'playing' : 'paused'
  progressInput.max = String(currentSnapshot.durationSec || 0)
  progressInput.value = String(Math.min(currentSnapshot.currentTimeSec, currentSnapshot.durationSec || currentSnapshot.currentTimeSec))
  timeReadout.textContent = `${formatTime(currentSnapshot.currentTimeSec)} / ${formatTime(currentSnapshot.durationSec)}`

  if (playToggle.dataset.state !== playState) {
    const playLabel = playState === 'playing' ? '暂停' : '播放'
    playToggle.innerHTML = renderTextIconButton(playState === 'playing' ? ICON_PAUSE : ICON_PLAY, playLabel)
    playToggle.title = playLabel
    playToggle.setAttribute('aria-label', playLabel)
    playToggle.dataset.state = playState
  }

  playToggle.disabled = !previewReady
  unlockLayer.hidden = !currentSnapshot.requiresGesture
  bgmLoadingLayer.hidden = true
  warningText.textContent = composeWarningText()
}

async function loadPreparedPreview(params: UrlPreviewParams, susText: string, bgmBytes: Uint8Array | null, coverBytes: Uint8Array | null) {
  previewReady = false
  pendingPlayAfterUnlock = false
  sessionWarningMessage = ''
  stopApPlayback(true)

  const normalizedOffsetMs = normalizeOffsetMs(params.rawOffsetMs, susText)
  const sourceOffsetMs = -normalizedOffsetMs
  const effectiveLeadInMs = Math.max(sourceOffsetMs, MIN_CHART_LEAD_IN_MS)

  setStatus('正在初始化谱面', '正在把 SUS、背景、HUD 和音频交给 wasm。')
  await player.loadSession({
    susText,
    sourceOffsetMs,
    effectiveLeadInMs,
    bgmBytes,
    coverBytes,
    metadata: getSessionMetadata(params),
  })
  player.setPreviewConfig(currentConfig)
  player.seek(0)
  player.pause()
  player.renderFrame()
  currentSnapshot = player.getStateSnapshot()
  previewReady = true
  clearStatus()
  updateUi(true)
}

async function loadPreviewFromUrlParams(params: UrlPreviewParams) {
  const bgmPromise = params.bgm
    ? fetchArrayBuffer(params.bgm, FETCH_TIMEOUT_MS)
        .then(toBytes)
        .catch((error: unknown) => {
          sessionWarningMessage = error instanceof Error ? `${error.message}，已切换为静音预览。` : 'BGM 加载失败，已切换为静音预览。'
          return null
        })
    : Promise.resolve<Uint8Array | null>(null)

  const coverPromise = params.cover
    ? fetchArrayBuffer(params.cover, FETCH_TIMEOUT_MS)
        .then(toBytes)
        .catch((error: unknown) => {
          sessionWarningMessage = error instanceof Error ? `${error.message}，已使用默认背景。` : '曲绘加载失败，已使用默认背景。'
          return null
        })
    : Promise.resolve<Uint8Array | null>(null)

  const [susText, bgmBytes, coverBytes] = await Promise.all([fetchText(params.sus), bgmPromise, coverPromise])
  await loadPreparedPreview(params, susText, bgmBytes, coverBytes)
}

async function loadPreviewFromLocalInput(input: LocalPreviewInput) {
  const [susText, bgmBytes, coverBytes] = await Promise.all([
    input.susFile.text(),
    input.bgmFile ? input.bgmFile.arrayBuffer().then(toBytes) : Promise.resolve<Uint8Array | null>(null),
    input.coverFile ? input.coverFile.arrayBuffer().then(toBytes) : Promise.resolve<Uint8Array | null>(null),
  ])

  if (typeof input.showLockControlsButton === 'boolean') {
    localShowLockInput.checked = input.showLockControlsButton
    setLockControlsButtonVisibility(input.showLockControlsButton)
  }

  const params: UrlPreviewParams = {
    sus: `local:///${encodeURIComponent(input.susFile.name || 'chart.sus')}`,
    bgm: input.bgmFile ? `local:///${encodeURIComponent(input.bgmFile.name || 'song')}` : null,
    cover: input.coverFile ? `local:///${encodeURIComponent(input.coverFile.name || 'cover')}` : null,
    rawOffsetMs: input.rawOffsetMs,
    title: input.title,
    lyricist: input.lyricist,
    composer: input.composer,
    arranger: input.arranger,
    vocal: input.vocal,
    difficulty: input.difficulty,
    description1: null,
    description2: null,
    extra: null,
  }

  await loadPreparedPreview(params, susText, bgmBytes, coverBytes)
}

async function handleLocalLoaderSubmit(event: SubmitEvent) {
  event.preventDefault()
  const susFile = localSusInput.files?.[0]
  if (!susFile) {
    setStatus('缺少 SUS 文件', '请选择本地 SUS 谱面文件。')
    return
  }

  setLocalLoaderBusy(true)
  try {
    await loadPreviewFromLocalInput({
      susFile,
      bgmFile: localBgmInput.files?.[0] ?? null,
      coverFile: localCoverInput.files?.[0] ?? null,
      rawOffsetMs: readOptionalOffsetMsInput(localOffsetInput),
      title: readOptionalTextInput(localTitleInput),
      lyricist: readOptionalTextInput(localLyricistInput),
      composer: readOptionalTextInput(localComposerInput),
      arranger: readOptionalTextInput(localArrangerInput),
      vocal: readOptionalTextInput(localVocalInput),
      difficulty: readOptionalTextInput(localDifficultyInput),
      showLockControlsButton: localShowLockInput.checked,
    })
    setLocalLoaderVisible(false)
  } catch (error) {
    pushDebugError(error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    currentSnapshot = { ...EMPTY_SNAPSHOT, transportState: 'error', warnings: message }
    setStatus('本地预览加载失败', message)
    updateUi(true)
  } finally {
    setLocalLoaderBusy(false)
  }
}

function clearControlsHideTimer() {
  if (controlsHideTimer !== null) {
    window.clearTimeout(controlsHideTimer)
    controlsHideTimer = null
  }
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

function syncBodyScrollLock() {
  const lockScroll = isFullscreen && !isNativeFullscreen
  document.body.style.overflow = lockScroll ? 'hidden' : ''
  document.documentElement.style.overflow = lockScroll ? 'hidden' : ''
  document.body.style.overscrollBehavior = lockScroll ? 'none' : ''
  document.documentElement.style.overscrollBehavior = lockScroll ? 'none' : ''
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
    if (event.touches.length !== 1 || isInteractiveTarget(event.target)) {
      return
    }
    if (appShell.scrollTop <= 0) {
      appShell.scrollTop = 1
    }
    if (appShell.scrollTop + appShell.clientHeight >= appShell.scrollHeight) {
      appShell.scrollTop = Math.max(1, appShell.scrollHeight - appShell.clientHeight - 1)
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

function isRecordingControlsMode() {
  return isFullscreen && !showLockControlsButton
}

function applyFullscreenUi() {
  const recordingControlsMode = isRecordingControlsMode()
  appShell.classList.toggle('fullscreen-mode', isFullscreen)
  appShell.classList.toggle('pseudo-fullscreen-mode', isFullscreen && !isNativeFullscreen)
  exitFullscreenButton.hidden = !isFullscreen || recordingControlsMode
  lockControlsButton.hidden = !isFullscreen || !showLockControlsButton
  webFullscreenToggle.hidden = !isIOS || isFullscreen
  iosHint.hidden = !isIPad || isFullscreen
  exitFullscreenButton.innerHTML = ICON_EXIT_FULLSCREEN
  lockControlsButton.innerHTML = controlsLocked ? ICON_LOCKED : ICON_UNLOCKED
  lockControlsButton.title = controlsLocked ? '解锁控制栏' : '锁定控制栏'
  lockControlsButton.setAttribute('aria-label', controlsLocked ? '解锁控制栏' : '锁定控制栏')
  const shouldHideControls = isFullscreen && (recordingControlsMode ? !controlsVisible : controlsLocked || !controlsVisible)
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
  controlsVisible = showLockControlsButton
  controlsLocked = false
  syncPseudoFullscreenViewport()
  applyFullscreenUi()
  clearControlsHideTimer()
  if (showLockControlsButton) {
    resetControlsAutoHide()
  }
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
    controlsVisible = showLockControlsButton
    applyFullscreenUi()
    clearControlsHideTimer()
    if (showLockControlsButton) {
      resetControlsAutoHide()
    }
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
    await (screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> }).lock?.('landscape')
  } catch {
    // Ignore unsupported orientation lock.
  }

  controlsVisible = showLockControlsButton
  controlsLocked = false
  applyFullscreenUi()
  clearControlsHideTimer()
  if (showLockControlsButton) {
    resetControlsAutoHide()
  }
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
      // Ignore native fullscreen exit error and fall back to local state reset.
    }
  }

  exitPseudoFullscreen()
  applyRenderSize()
}

function onFullscreenInteraction(event: Event) {
  if (!isFullscreen) {
    return
  }
  if (isRecordingControlsMode() && event.type === 'mousemove') {
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

function setLockControlsButtonVisibility(visible: boolean) {
  showLockControlsButton = visible
  if (!showLockControlsButton) {
    controlsLocked = false
    controlsVisible = false
    clearControlsHideTimer()
  } else if (isFullscreen) {
    controlsVisible = true
  }
  applyFullscreenUi()
  if (isFullscreen && showLockControlsButton) {
    resetControlsAutoHide()
  }
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

document.addEventListener(
  'touchend',
  (event) => {
    const now = performance.now()
    if (now - lastTouchEndMs < 320) {
      if (event.cancelable) {
        event.preventDefault()
      }
    }
    lastTouchEndMs = now
  },
  { passive: false },
)

function applyNoteSpeed(nextValue: number) {
  const snapped = Math.round(nextValue * 10) / 10
  const clamped = Math.min(12, Math.max(1, snapped))
  currentConfig = {
    ...currentConfig,
    noteSpeed: clamped,
  }
  noteSpeedOutput.value = clamped.toFixed(1)
  if (runtimeReady) {
    player.setPreviewConfig(currentConfig)
  }
}

function adjustNoteSpeed(delta: number) {
  applyNoteSpeed(currentConfig.noteSpeed + delta)
}

function applyBackgroundBrightness(percent: number) {
  const clampedPercent = Math.min(100, Math.max(60, Math.round(percent)))
  currentConfig = {
    ...currentConfig,
    backgroundBrightness: clampedPercent / 100,
  }
  backgroundBrightnessInput.value = String(clampedPercent)
  backgroundBrightnessOutput.value = `${clampedPercent}%`
  if (runtimeReady) {
    player.setPreviewConfig(currentConfig)
  }
}

async function bootstrap() {
  try {
    setStatus(
      '正在加载 MMW 资源',
      shouldShowInitialFontHint
        ? '初始化 wasm 播放器与原生 Overlay 贴图、字体、音效中。首次加载字体文件很大（约 20MB），请耐心等待。'
        : '初始化 wasm 播放器与原生 Overlay 贴图、字体、音效中。',
    )
    const bounds = previewPanel.getBoundingClientRect()
    const width = bounds.width || 1280
    const height = bounds.height || 720
    const renderSize = getRenderTargetSize(width, height)
    await player.init(canvas, renderSize.width, renderSize.height, renderSize.dpr)
    await ensureStaticResourcesLoaded()
    try {
      window.localStorage.setItem(FONT_HINT_SEEN_STORAGE_KEY, '1')
    } catch {
      // ignore storage failures
    }
    player.setPreviewConfig(currentConfig)
    runtimeReady = true
    resizeObserver.observe(previewPanel)
    applyRenderSize()

    const bootLocalPayload = takeBootLocalPayload()
    if (bootLocalPayload) {
      setLocalLoaderVisible(false)
      await loadPreviewFromLocalInput(bootLocalPayload)
      return
    }

    const currentUrl = new URL(window.location.href)
    if ([...currentUrl.searchParams.keys()].length === 0) {
      clearStatus()
      setLocalLoaderVisible(true)
      sessionWarningMessage = '未检测到 URL 参数，请在下方上传本地文件。'
      updateUi(true)
      return
    }

    setLocalLoaderVisible(false)
    const params = parseUrlPreviewParams(currentUrl)
    await loadPreviewFromUrlParams(params)
  } catch (error) {
    pushDebugError(error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    currentSnapshot = { ...EMPTY_SNAPSHOT, transportState: 'error', warnings: message }
    setStatus('预览加载失败', message)
    updateUi(true)
  }
}

function frameLoop() {
  if (runtimeReady && previewReady) {
    try {
      player.renderFrame()
      currentSnapshot = player.getStateSnapshot()
      if (!apSequenceTriggered && Number.isFinite(currentSnapshot.apStartSec) && currentSnapshot.currentTimeSec >= currentSnapshot.apStartSec - 0.01) {
        startApPlayback()
      }
      if (currentSnapshot.transportState === 'error') {
        previewReady = false
        setStatus('预览运行失败', currentSnapshot.warnings || 'Wasm preview entered error state.')
      }
    } catch (error) {
      pushDebugError(error)
      const message = error instanceof Error ? error.message : 'Unknown render error'
      previewReady = false
      currentSnapshot = { ...EMPTY_SNAPSHOT, transportState: 'error', warnings: message }
      setStatus('预览运行失败', message)
    }
  }

  drawApFrame(performance.now())
  updateUi()
  window.requestAnimationFrame(frameLoop)
}

apVideo.src = AP_VIDEO_URL
apVideo.loop = false
apVideo.preload = 'auto'
apVideo.playsInline = true
apVideo.addEventListener('ended', () => {
  apPlaybackActive = false
  apLayer.hidden = true
  previewPanel.classList.remove('ap-active')
})
apVideo.addEventListener('error', () => {
  sessionWarningMessage = 'AP 视频加载失败，已跳过。'
  stopApPlayback(false)
  updateUi(true)
})

bindTapAction(playToggle, () => {
  void (async () => {
    if (!previewReady) {
      return
    }
    if (currentSnapshot.transportState === 'playing') {
      player.pause()
      currentSnapshot = player.getStateSnapshot()
      updateUi(true)
      return
    }
    if (currentSnapshot.durationSec > 0 && currentSnapshot.currentTimeSec >= currentSnapshot.durationSec - 0.01) {
      stopApPlayback(true)
      player.seek(0)
      player.renderFrame()
      currentSnapshot = player.getStateSnapshot()
    }
    const ok = await player.play()
    pendingPlayAfterUnlock = !ok
    currentSnapshot = player.getStateSnapshot()
    updateUi(true)
  })()
})

unlockButton.addEventListener('click', () => {
  void (async () => {
    const unlocked = await player.unlockAudio()
    if (unlocked && pendingPlayAfterUnlock) {
      await player.play()
      pendingPlayAfterUnlock = false
    }
    currentSnapshot = player.getStateSnapshot()
    updateUi(true)
  })()
})

progressInput.addEventListener('input', () => {
  if (!previewReady) {
    return
  }
  stopApPlayback(true)
  player.seek(Number(progressInput.value))
  player.renderFrame()
  currentSnapshot = player.getStateSnapshot()
  updateUi(true)
})

speedSelect.addEventListener('change', () => {
  if (!runtimeReady) {
    return
  }
  const rate = Number(speedSelect.value)
  player.setPlaybackRate(rate)
  apVideo.playbackRate = rate
  currentSnapshot = player.getStateSnapshot()
  updateUi(true)
})

bindTapAction(noteSpeedMinusOneButton, () => {
  adjustNoteSpeed(-1)
})
bindTapAction(noteSpeedMinusPointOneButton, () => {
  adjustNoteSpeed(-0.1)
})
bindTapAction(noteSpeedPlusPointOneButton, () => {
  adjustNoteSpeed(0.1)
})
bindTapAction(noteSpeedPlusOneButton, () => {
  adjustNoteSpeed(1)
})

backgroundBrightnessInput.addEventListener('input', () => {
  applyBackgroundBrightness(Number(backgroundBrightnessInput.value))
})

lowEffectsInput.addEventListener('change', () => {
  currentConfig = {
    ...currentConfig,
    effectOpacity: lowEffectsInput.checked ? 0.3 : 1,
  }
  if (runtimeReady) {
    player.setPreviewConfig(currentConfig)
  }
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

localLoaderForm.addEventListener('submit', (event) => {
  void handleLocalLoaderSubmit(event)
})

localShowLockInput.addEventListener('change', () => {
  setLockControlsButtonVisibility(localShowLockInput.checked)
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
  if (event.key === 'Escape' && isFullscreen && !isNativeFullscreen) {
    event.preventDefault()
    void exitFullscreen()
  }
})
window.addEventListener('beforeunload', () => {
  resizeObserver.disconnect()
  player.dispose()
})

isIOS = detectIosDevice()
isIPad = detectIpadDevice()
appShell.classList.toggle('ios-device', isIOS)
showLockControlsButton = localShowLockInput.checked
try {
  lowResolutionEnabled = window.localStorage.getItem(LOW_RESOLUTION_STORAGE_KEY) === '1'
} catch {
  lowResolutionEnabled = false
}
lowResolutionInput.checked = lowResolutionEnabled

try {
  shouldShowInitialFontHint = window.localStorage.getItem(FONT_HINT_SEEN_STORAGE_KEY) !== '1'
} catch {
  shouldShowInitialFontHint = true
}
applyNoteSpeed(currentConfig.noteSpeed)
applyBackgroundBrightness(100)
playToggle.innerHTML = renderTextIconButton(ICON_PLAY, '播放')
playToggle.dataset.state = 'paused'
applyFullscreenUi()
updateUi(true)
void bootstrap()
window.requestAnimationFrame(frameLoop)
