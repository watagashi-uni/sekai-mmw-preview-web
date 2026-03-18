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
            <div class="hud-score-plus" id="hud-score-plus" hidden></div>
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
          <img class="hud-auto-badge" id="hud-auto-badge" src="/assets/mmw/overlay/autolive.png" alt="" hidden />
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

const menuToggle = app.querySelector('#mobile-menu-toggle')
if (menuToggle) {
  menuToggle.addEventListener('click', () => {
    const nav = app.querySelector('#sidebar-nav')
    if (nav) {
      nav.classList.toggle('is-open')
    }
  })
}

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
const hudScorePlus = app.querySelector<HTMLDivElement>('#hud-score-plus')!
const hudLifeFillClip = app.querySelector<HTMLDivElement>('#hud-life-fill-clip')!
const hudLifeDigits = app.querySelector<HTMLDivElement>('#hud-life-digits')!
const hudComboRoot = app.querySelector<HTMLDivElement>('#hud-combo-root')!
const hudComboDigits = app.querySelector<HTMLDivElement>('#hud-combo-digits')!
const hudJudgeLayer = app.querySelector<HTMLDivElement>('#hud-judge-layer')!
const hudAutoBadge = app.querySelector<HTMLImageElement>('#hud-auto-badge')!
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
const backgroundBrightnessInput = app.querySelector<HTMLInputElement>('#background-brightness-input')!
const backgroundBrightnessOutput = app.querySelector<HTMLOutputElement>('#background-brightness-output')!
const noteSpeedMinusOneButton = app.querySelector<HTMLButtonElement>('#note-speed-minus-one-button')!
const noteSpeedMinusPointOneButton = app.querySelector<HTMLButtonElement>('#note-speed-minus-point-one-button')!
const noteSpeedPlusPointOneButton = app.querySelector<HTMLButtonElement>('#note-speed-plus-point-one-button')!
const noteSpeedPlusOneButton = app.querySelector<HTMLButtonElement>('#note-speed-plus-one-button')!
const lowEffectsInput = app.querySelector<HTMLInputElement>('#low-effects-input')!
const lowResolutionInput = app.querySelector<HTMLInputElement>('#low-resolution-input')!
const timeReadout = app.querySelector<HTMLDivElement>('#time-readout')!
const warningText = app.querySelector<HTMLDivElement>('#warning-text')!
const iosHint = app.querySelector<HTMLDivElement>('#ios-hint')!
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

function takeBootLocalPayload() {
  const payload = window.__MMW_BOOT_LOCAL_PAYLOAD ?? null
  delete window.__MMW_BOOT_LOCAL_PAYLOAD
  return payload
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
let lastHudScorePlusText = ''
let lastHudScorePlusEventIndex = -1
let lastHudScoreForPlusTrigger = 0
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
const HUD_INTRO_DURATION_SEC = 4
const INTRO_CLEAN_BG_DURATION_SEC = 1
const INTRO_PLAYFIELD_FADE_IN_SEC = 0.62
const MIN_CHART_LEAD_IN_SEC = 9
const JUDGE_ANIMATION_TOTAL_FRAMES = 20
const JUDGE_ANIMATION_FPS = 60
const FIXED_BACKGROUND_URL = '/assets/mmw/background_overlay.png'
const COMBO_DIGIT_STEP = 92
const COMBO_BASE_SCALE = 0.85
const LIFE_MAX_VALUE = 1000
const SCORE_BAR_FULL_WIDTH = 354
const SCORE_PLUS_VISIBLE_SEC = 0.5
const SCORE_PLUS_FLOAT_PX = 2
const SCORE_PLUS_SLIDE_IN_PX = 32
const CONTROLS_AUTO_HIDE_MS = 3000
let lastUiRefreshMs = 0
let isFullscreen = false
let isNativeFullscreen = false
let controlsVisible = true
let controlsLocked = false
let showLockControlsButton = true
let controlsHideTimer: number | null = null
let isIOS = false
let isIPad = false
let lowResolutionEnabled = false
let iosTouchGuardsCleanup: (() => void) | null = null
let hudJudgeImage: HTMLImageElement | null = null
let backgroundObjectUrl: string | null = null
let localCoverObjectUrl: string | null = null
let backgroundApplySequence = 0
let chartPlayableEndSec = Number.POSITIVE_INFINITY
let apSequenceTriggered = false
let apPlaybackActive = false
let apStartDelayTimer: number | null = null
let apLastDrawMs = 0
let scorePlusTriggerChartSec = Number.NEGATIVE_INFINITY
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
const AUTO_BADGE_SHOW_AFTER_SEC = HUD_INTRO_DURATION_SEC + INTRO_CLEAN_BG_DURATION_SEC + INTRO_PLAYFIELD_FADE_IN_SEC
const AUTO_BADGE_ANIM_PERIOD_SEC = 1.25
const AUTO_BADGE_ANIM_SPAN = 1.2

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
  const shouldHideControls = isFullscreen && (recordingControlsMode ? !controlsVisible : (controlsLocked || !controlsVisible))
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
    await (screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> }).lock?.(
      'landscape',
    )
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
      // Ignore native fullscreen exit error and fallback to local state reset.
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

function revokeLocalCoverObjectUrl() {
  if (!localCoverObjectUrl) {
    return
  }
  URL.revokeObjectURL(localCoverObjectUrl)
  localCoverObjectUrl = null
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
  return String(Math.max(0, Math.round(value))).padStart(8, ' ').replace(/ /g, 'n')
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

function setScorePlusDigits(scoreDelta: number) {
  const text = `+${Math.max(0, Math.round(scoreDelta))}`
  if (text === lastHudScorePlusText) {
    return
  }
  lastHudScorePlusText = text

  const fragment = document.createDocumentFragment()
  for (const char of text) {
    const stack = document.createElement('span')
    stack.className = 'hud-score-plus-stack'
    if (char === '+') {
      stack.classList.add('hud-score-plus-stack-sign')
    }

    const key = char === '+' ? '+' : char
    stack.append(
      createHudImage(`/assets/mmw/overlay/score/digit/s${key}.png`, 'hud-score-plus-shadow'),
      createHudImage(`/assets/mmw/overlay/score/digit/${key}.png`, 'hud-score-plus-main'),
    )
    fragment.append(stack)
  }
  hudScorePlus.replaceChildren(fragment)
}

function hideScorePlus() {
  hudScorePlus.hidden = true
  hudScorePlus.style.opacity = '0'
  hudScorePlus.style.transform = `translate(${(-SCORE_PLUS_SLIDE_IN_PX).toFixed(2)}px, 0px)`
}

function triggerScorePlus(scoreDelta: number, eventIndex: number, chartTimeSec: number) {
  setScorePlusDigits(scoreDelta)
  lastHudScorePlusEventIndex = eventIndex
  scorePlusTriggerChartSec = chartTimeSec
  hudScorePlus.hidden = false
}

function updateScorePlusAnimation(chartTimeSec: number, transportState: TransportState, hidden: boolean) {
  if (
    hidden ||
    transportState !== 'playing' ||
    !Number.isFinite(scorePlusTriggerChartSec)
  ) {
    hideScorePlus()
    return
  }

  const elapsed = chartTimeSec - scorePlusTriggerChartSec
  if (elapsed < 0 || elapsed > SCORE_PLUS_VISIBLE_SEC) {
    hideScorePlus()
    return
  }

  const progress = Math.min(1, Math.max(0, elapsed / SCORE_PLUS_VISIBLE_SEC))
  const entryProgress = Math.min(1, progress / 0.42)
  const eased = 1 - (0.9 ** (entryProgress * 12))
  const fadeStart = 0.88
  const baseAlpha = Math.min(1, 1.3 * eased)
  const alpha = progress <= fadeStart ? baseAlpha : Math.max(0, baseAlpha * (1 - (progress - fadeStart) / (1 - fadeStart)))
  const offsetX = -SCORE_PLUS_SLIDE_IN_PX * (1 - eased)
  const offsetY = -SCORE_PLUS_FLOAT_PX * eased

  hudScorePlus.hidden = false
  hudScorePlus.style.opacity = alpha.toFixed(3)
  hudScorePlus.style.transform = `translate(${offsetX.toFixed(2)}px, ${offsetY.toFixed(2)}px)`
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
    case '0':
      return 'EASY'
    case '1':
      return 'NORMAL'
    case '2':
      return 'HARD'
    case '3':
      return 'EXPERT'
    case '4':
      return 'MASTER'
    case '5':
      return 'APPEND'
    case '6':
      return 'ETERNAL'
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

function inferDifficultyFromSusUrl(susUrl: string) {
  let decoded = susUrl
  try {
    decoded = decodeURIComponent(susUrl)
  } catch {
    // Keep original string when decode fails.
  }
  const normalized = decoded.toUpperCase()
  const orderedCandidates = ['ETERNAL', 'APPEND', 'MASTER', 'EXPERT', 'HARD', 'NORMAL', 'EASY'] as const
  for (const candidate of orderedCandidates) {
    if (normalized.includes(candidate)) {
      return candidate
    }
  }
  return ''
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
  const difficultyText = sanitizeIntroText(params.difficulty) || inferDifficultyFromSusUrl(params.sus)

  return {
    title,
    description1:
      sanitizeIntroText(params.description1) || `作詞：${lyricist}　作曲：${composer}　編曲：${arranger}`,
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

function getPlayfieldVisibility(currentTimeSec: number, transportState: TransportState) {
  if (!hasIntroCardContent() || transportState !== 'playing' || currentTimeSec < 0) {
    return 1
  }
  const revealStartSec = HUD_INTRO_DURATION_SEC + INTRO_CLEAN_BG_DURATION_SEC
  if (currentTimeSec < revealStartSec) {
    return 0
  }
  return Math.min(1, Math.max(0, (currentTimeSec - revealStartSec) / INTRO_PLAYFIELD_FADE_IN_SEC))
}

function applyPlayfieldVisibility(visibility: number) {
  const alpha = Math.min(1, Math.max(0, visibility))
  const alphaText = alpha.toFixed(3)
  effectsCanvas.style.opacity = alphaText
  hudScoreRoot.style.opacity = alphaText
  hudLifeRoot.style.opacity = alphaText
  hudComboRoot.style.opacity = alphaText
  hudJudgeLayer.style.opacity = alphaText
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
  playfieldVisibility: number,
) {
  hudLayer.hidden = !previewReady
  if (!previewReady) {
    previewPanel.classList.remove('intro-active')
    applyPlayfieldVisibility(1)
    lastHudScoreForPlusTrigger = 0
    hideScorePlus()
    hudAutoBadge.hidden = true
    return
  }

  const hasIntroContent = hasIntroCardContent()
  const introVisible = isIntroVisible(currentTimeSec, transportState)
  const hudSuppressed = introVisible || playfieldVisibility <= 0.001
  applyPlayfieldVisibility(playfieldVisibility)
  if (introVisible) {
    renderIntroBackdrop(currentTimeSec)
  }
  previewPanel.classList.toggle('intro-active', introVisible)
  hudScoreRoot.hidden = false
  hudLifeRoot.hidden = false
  hudComboRoot.hidden = hudSuppressed || state.combo <= 0
  hudAutoBadge.hidden = false
  if (currentTimeSec < AUTO_BADGE_SHOW_AFTER_SEC) {
    hudAutoBadge.style.opacity = '0'
  } else {
    const phase = ((currentTimeSec - AUTO_BADGE_SHOW_AFTER_SEC) / AUTO_BADGE_ANIM_PERIOD_SEC) % AUTO_BADGE_ANIM_SPAN
    const alpha = Math.max(0, Math.sin(phase * Math.PI))
    hudAutoBadge.style.opacity = alpha.toFixed(3)
  }
  hudIntroCard.hidden = !hasIntroContent
  hudIntroCard.classList.toggle('visible', introVisible)

  setRankSprites(state.rank)
  setScoreDigits(state.score)
  if (
    transportState !== 'playing' ||
    chartTimeSec < previousTimeSec - 0.001 ||
    chartTimeSec - previousTimeSec > 0.25
  ) {
    lastHudScoreForPlusTrigger = state.score
  }
  const scoreIncrease = Math.max(0, state.score - lastHudScoreForPlusTrigger)
  if (
    !hudSuppressed &&
    transportState === 'playing' &&
    scoreIncrease > 0
  ) {
    const eventIndex = Math.max(state.latestScoreEventIndex, lastHudScorePlusEventIndex + 1)
    triggerScorePlus(scoreIncrease, eventIndex, chartTimeSec)
  }
  lastHudScoreForPlusTrigger = state.score
  updateScorePlusAnimation(chartTimeSec, transportState, hudSuppressed)
  setLifeDigits(state.lifeRatio)
  setComboDigits(state.combo)
  updateComboAnimation(chartTimeSec, state.combo, hudSuppressed)
  hudScoreBarClip.style.width = `${Math.round(SCORE_BAR_FULL_WIDTH * Math.min(1, Math.max(0, state.scoreBarRatio)))}px`
  hudLifeFillClip.style.width = `${Math.min(100, Math.max(0, state.lifeRatio * 100))}%`
  renderJudgeBursts(chartTimeSec, hudSuppressed)
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

function setLocalLoaderVisible(visible: boolean) {
  localLoaderPanel.hidden = !visible
}

function setLocalLoaderBusy(busy: boolean) {
  localLoaderSubmit.disabled = busy
  localLoaderSubmit.textContent = busy ? '正在加载…' : '加载本地预览'
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
  playToggle.disabled = bgmLoading || !previewReady
  unlockLayer.hidden = !snapshot.requiresGesture
  bgmLoadingLayer.hidden = !bgmLoading
  warningText.textContent = warningMessage
}

async function loadPreparedPreview(
  params: UrlPreviewParams,
  susText: string,
  bgmDataPromise: Promise<ArrayBuffer | null> | null,
) {
  transport.pause()
  transport.seek(0)
  await transport.setAudioData(null)
  stopApPlayback(true)
  hideScorePlus()
  effects.reset()
  judgementSounds.stopAll()
  previewReady = false
  hudLayer.hidden = true
  previewPanel.classList.remove('intro-active')
  applyPlayfieldVisibility(1)

  coverUrl = params.cover
  void applyBackground(coverUrl).catch(() => {
    // Ignore background texture failures and keep default background.
  })
  bgmExpected = !!bgmDataPromise
  bgmLoaded = !bgmDataPromise
  bgmLoadingActive = false
  warningMessage = ''

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
  lastHudScorePlusText = ''
  lastHudScorePlusEventIndex = -1
  lastHudScoreForPlusTrigger = 0
  scorePlusTriggerChartSec = Number.NEGATIVE_INFINITY
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

  if (!bgmDataPromise) {
    return
  }

  bgmLoadingActive = true
  warningMessage = '正在加载 BGM…'
  updateUi()
  void (async () => {
    try {
      const bgmData = await bgmDataPromise
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

async function loadPreviewFromUrlParams(params: UrlPreviewParams) {
  revokeLocalCoverObjectUrl()
  const susTextPromise = fetchText(params.sus)
  const bgmDataPromise = params.bgm
    ? fetchArrayBuffer(params.bgm, BGM_FETCH_TIMEOUT_MS)
    : null
  const susText = await susTextPromise
  await loadPreparedPreview(params, susText, bgmDataPromise)
}

async function loadPreviewFromLocalInput(input: LocalPreviewInput) {
  const [susText, bgmData] = await Promise.all([
    input.susFile.text(),
    input.bgmFile ? input.bgmFile.arrayBuffer() : Promise.resolve<ArrayBuffer | null>(null),
  ])

  if (typeof input.showLockControlsButton === 'boolean') {
    localShowLockInput.checked = input.showLockControlsButton
    setLockControlsButtonVisibility(input.showLockControlsButton)
  }

  revokeLocalCoverObjectUrl()
  const cover = input.coverFile ? URL.createObjectURL(input.coverFile) : null
  localCoverObjectUrl = cover

  const params: UrlPreviewParams = {
    sus: `local:///${encodeURIComponent(input.susFile.name || 'chart.sus')}`,
    bgm: input.bgmFile ? `local:///${encodeURIComponent(input.bgmFile.name || 'song')}` : null,
    cover,
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
  await loadPreparedPreview(params, susText, bgmData ? Promise.resolve(bgmData) : null)
}

async function handleLocalLoaderSubmit(event: SubmitEvent) {
  event.preventDefault()
  if (bgmLoadingActive) {
    warningMessage = '当前 BGM 仍在加载中，请稍后再加载新的谱面。'
    updateUi()
    return
  }

  const susFile = localSusInput.files?.[0]
  if (!susFile) {
    setStatus('缺少 SUS 文件', '请选择本地 SUS 谱面文件。')
    return
  }

  setLocalLoaderBusy(true)
  try {
    setStatus('正在读取本地文件', '读取 SUS/BGM 并初始化预览中。')
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
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    hudTimeline = null
    hudEvents = []
    hudJudgeTimes = []
    hudComboTimes = []
    chartPlayableEndSec = Number.POSITIVE_INFINITY
    stopApPlayback(true)
    hideScorePlus()
    lastHudLifeText = ''
    hudLayer.hidden = true
    previewPanel.classList.remove('intro-active')
    setStatus('本地预览加载失败', message)
    transport.setError()
    updateUi()
  } finally {
    setLocalLoaderBusy(false)
  }
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

    const bootLocalPayload = takeBootLocalPayload()
    if (bootLocalPayload) {
      setLocalLoaderVisible(false)
      setStatus('正在读取本地文件', '读取 SUS/BGM 并初始化预览中。')
      await loadPreviewFromLocalInput(bootLocalPayload)
      return
    }

    const currentUrl = new URL(window.location.href)
    if ([...currentUrl.searchParams.keys()].length === 0) {
      setLocalLoaderVisible(true)
      revokeLocalCoverObjectUrl()
      coverUrl = null
      void applyBackground(null).catch(() => {
        // Keep default renderer background if generation fails.
      })
      previewReady = false
      clearStatus()
      warningMessage = '未检测到 URL 参数，请在下方上传本地文件。'
      transport.setReady()
      updateUi()
      return
    }

    setLocalLoaderVisible(false)
    setStatus('正在加载谱面', '正在通过 URL 参数拉取 SUS 文件。')
    const params = parseUrlPreviewParams(currentUrl)
    await loadPreviewFromUrlParams(params)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    hudTimeline = null
    hudEvents = []
    hudJudgeTimes = []
    hudComboTimes = []
    chartPlayableEndSec = Number.POSITIVE_INFINITY
    stopApPlayback(true)
    hideScorePlus()
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

backgroundBrightnessInput.addEventListener('input', () => {
  applyBackgroundBrightness(Number(backgroundBrightnessInput.value))
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

function applyBackgroundBrightness(percent: number) {
  const clampedPercent = Math.min(100, Math.max(60, Math.round(percent)))
  const normalized = clampedPercent / 100
  currentConfig = {
    ...currentConfig,
    backgroundBrightness: normalized,
  }
  backgroundBrightnessInput.value = String(clampedPercent)
  backgroundBrightnessOutput.value = `${clampedPercent}%`
  if (rendererReady) {
    wasm.setPreviewConfig(currentConfig)
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

localLoaderForm.addEventListener('submit', (event) => {
  void handleLocalLoaderSubmit(event)
})

localShowLockInput.addEventListener('change', () => {
  setLockControlsButtonVisibility(localShowLockInput.checked)
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
    const playfieldVisibility = getPlayfieldVisibility(currentTimeSec, snapshot.state)
    const gameplaySuppressed = playfieldVisibility <= 0.001
    const chartTimeSec = toChartTimeSec(currentTimeSec)
    const rawFrame = previewReady ? wasm.render(chartTimeSec) : { count: 0, floats: emptyFrame }
    const frame = gameplaySuppressed ? { count: 0, floats: emptyFrame } : rawFrame
    const renderConfig = {
      ...currentConfig,
      stageOpacity: currentConfig.stageOpacity * playfieldVisibility,
    }
    renderer.render(frame.floats, frame.count, renderConfig, playfieldVisibility)

    const reachedChartEnd =
      previewReady &&
      Number.isFinite(chartPlayableEndSec) &&
      chartTimeSec >= chartPlayableEndSec - 0.0001 &&
      (snapshot.state === 'playing' || previousTransportState === 'playing')
    if (reachedChartEnd) {
      queueApPlayback()
    }

    if (previewReady) {
      if (gameplaySuppressed) {
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
      renderHud(hudTimeline.snapshotAt(chartTimeSec), currentTimeSec, snapshot.state, chartTimeSec, playfieldVisibility)
    } else {
      hudLayer.hidden = true
      previewPanel.classList.remove('intro-active')
      applyPlayfieldVisibility(1)
      hideScorePlus()
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
showLockControlsButton = localShowLockInput.checked
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
hideScorePlus()
setLifeDigits(1)
setComboDigits(0)
hudScoreBarClip.style.width = '0px'
hudLifeFillClip.style.width = '100%'
hudIntroBgCanvas.width = INTRO_BG_WIDTH
hudIntroBgCanvas.height = INTRO_BG_HEIGHT
renderIntroBackdrop(0)
hudLayer.hidden = true
stopApPlayback(true)
window.addEventListener('beforeunload', () => {
  stopApPlayback(false)
  revokeBackgroundObjectUrl()
  revokeLocalCoverObjectUrl()
})
updateUi()
void bootstrap()
