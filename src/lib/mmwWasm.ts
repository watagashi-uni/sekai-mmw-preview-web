import { mmwWasmFilename } from '../generated/mmwWasmAsset'
import type { PreviewRuntimeConfig, SessionMetadata, TransportState, WasmPlayerSnapshot } from './types'

type CcallOptions = {
  async?: boolean
}

type EmscriptenModule = {
  HEAPU8: Uint8Array
  ccall: (
    ident: string,
    returnType: string | null,
    argTypes: string[],
    args: unknown[],
    opts?: CcallOptions,
  ) => unknown
  _malloc: (size: number) => number
  _free: (ptr: number) => void
}

type EmscriptenModuleFactoryOptions = {
  locateFile: (file: string) => string
  print?: (...args: unknown[]) => void
  printErr?: (...args: unknown[]) => void
  onAbort?: (reason: unknown) => void
}

declare global {
  interface Window {
    __MMW_DEBUG_ERRORS__?: string[]
  }
}

function pushDebugError(message: unknown) {
  const text =
    typeof message === 'string'
      ? message
      : message instanceof Error
        ? message.stack || message.message
        : String(message)
  const bucket = (window.__MMW_DEBUG_ERRORS__ ??= [])
  bucket.push(text)
  if (bucket.length > 60) {
    bucket.splice(0, bucket.length - 60)
  }
  console.error('[MMW]', text)
}

type LoadSessionOptions = {
  susText: string
  sourceOffsetMs: number
  effectiveLeadInMs: number
  bgmBytes: Uint8Array | null
  coverBytes: Uint8Array | null
  metadata: SessionMetadata
}

let modulePromise: Promise<EmscriptenModule> | null = null

async function loadModule() {
  if (!modulePromise) {
    modulePromise = import('../generated/mmw-preview.js').then(async (module) =>
      (module as { default: (options: EmscriptenModuleFactoryOptions) => Promise<EmscriptenModule> }).default({
        locateFile: (file: string) => (file.endsWith('.wasm') ? `/wasm/${mmwWasmFilename}` : `/wasm/${file}`),
        print: (...args: unknown[]) => {
          if (args.length > 0) {
            pushDebugError(args.map((item) => String(item)).join(' '))
          }
        },
        printErr: (...args: unknown[]) => {
          if (args.length > 0) {
            pushDebugError(args.map((item) => String(item)).join(' '))
          }
        },
        onAbort: (reason: unknown) => {
          pushDebugError(`wasm abort: ${String(reason)}`)
        },
      }),
    )
  }
  return modulePromise
}

function decodeTransportState(code: number): TransportState {
  switch (code) {
    case 1:
      return 'loading'
    case 2:
      return 'ready'
    case 3:
      return 'playing'
    case 4:
      return 'paused'
    case 5:
      return 'error'
    case 0:
    default:
      return 'idle'
  }
}

export class MmwWasmPlayer {
  private module: EmscriptenModule | null = null

  private canvasSelector = '#preview-canvas'

  async init(canvas: HTMLCanvasElement, width: number, height: number, dpr: number) {
    if (!canvas.id) {
      canvas.id = 'preview-canvas'
    }
    this.canvasSelector = `#${canvas.id}`
    if (!this.module) {
      this.module = await loadModule()
    }

    const ok = Number(
      this.module.ccall('initPlayer', 'number', ['string', 'number', 'number', 'number'], [
        this.canvasSelector,
        Math.max(1, Math.round(width)),
        Math.max(1, Math.round(height)),
        Math.max(0.1, dpr),
      ]),
    )
    if (ok !== 1) {
      throw new Error(this.getWarningText() || 'Failed to initialize wasm player.')
    }
  }

  async preloadAsset(key: string, bytes: Uint8Array) {
    this.assertReady()
    await this.callWithBytes('preloadAssetData', key, bytes)
  }

  async preloadFont(key: string, bytes: Uint8Array) {
    this.assertReady()
    await this.callWithBytes('preloadFontData', key, bytes)
  }

  async preloadSound(key: string, bytes: Uint8Array) {
    this.assertReady()
    await this.callWithBytes('preloadSoundData', key, bytes, true)
  }

  async loadSession(options: LoadSessionOptions) {
    const module = this.assertReady()
    const susPtr = this.allocString(options.susText)
    const titlePtr = this.allocString(options.metadata.title ?? '')
    const lyricistPtr = this.allocString(options.metadata.lyricist ?? '')
    const composerPtr = this.allocString(options.metadata.composer ?? '')
    const arrangerPtr = this.allocString(options.metadata.arranger ?? '')
    const vocalPtr = this.allocString(options.metadata.vocal ?? '')
    const difficultyPtr = this.allocString(options.metadata.difficulty ?? '')
    const bgm = this.allocBytes(options.bgmBytes)
    const cover = this.allocBytes(options.coverBytes)

    try {
      const result = await this.call<number>(
        'loadSession',
        'number',
        [
          'number',
          'number',
          'number',
          'number',
          'number',
          'number',
          'number',
          'number',
          'number',
          'number',
          'number',
          'number',
          'number',
        ],
        [
          susPtr,
          options.sourceOffsetMs,
          options.effectiveLeadInMs,
          bgm.ptr,
          bgm.length,
          cover.ptr,
          cover.length,
          titlePtr,
          lyricistPtr,
          composerPtr,
          arrangerPtr,
          vocalPtr,
          difficultyPtr,
        ],
        true,
      )
      if (Number(result) !== 1) {
        throw new Error(this.getWarningText() || 'Failed to load preview session.')
      }
    } finally {
      this.freePtr(susPtr)
      this.freePtr(titlePtr)
      this.freePtr(lyricistPtr)
      this.freePtr(composerPtr)
      this.freePtr(arrangerPtr)
      this.freePtr(vocalPtr)
      this.freePtr(difficultyPtr)
      this.freePtr(bgm.ptr)
      this.freePtr(cover.ptr)
    }
  }

  async play() {
    const ok = await this.call<number>('playPlayer', 'number', [], [], true)
    return Number(ok) === 1
  }

  async unlockAudio() {
    const ok = await this.call<number>('unlockPlayerAudio', 'number', [], [], true)
    return Number(ok) === 1
  }

  pause() {
    this.assertReady().ccall('pausePlayer', null, [], [])
  }

  seek(outputTimeSec: number) {
    this.assertReady().ccall('seekPlayer', null, ['number'], [outputTimeSec])
  }

  setPlaybackRate(rate: number) {
    this.assertReady().ccall('setPlayerPlaybackRate', null, ['number'], [rate])
  }

  resize(width: number, height: number, dpr: number) {
    this.assertReady().ccall(
      'resizePlayer',
      null,
      ['number', 'number', 'number'],
      [Math.max(1, Math.round(width)), Math.max(1, Math.round(height)), Math.max(0.1, dpr)],
    )
  }

  setPreviewConfig(config: PreviewRuntimeConfig) {
    this.assertReady().ccall(
      'setPlayerPreviewConfig',
      null,
      ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [
        config.mirror ? 1 : 0,
        config.flickAnimation ? 1 : 0,
        config.holdAnimation ? 1 : 0,
        config.simultaneousLine ? 1 : 0,
        config.effectProfile,
        config.noteSkin,
        config.noteSpeed,
        config.holdAlpha,
        config.guideAlpha,
        config.stageCover,
        config.stageOpacity,
        config.backgroundBrightness,
        config.effectOpacity,
      ],
    )
  }

  renderFrame() {
    this.assertReady().ccall('renderPlayerFrame', null, [], [])
  }

  getStateSnapshot(): WasmPlayerSnapshot {
    const module = this.assertReady()
    const warningText = String(module.ccall('getPlayerWarningText', 'string', [], []))
    return {
      currentTimeSec: Number(module.ccall('getPlayerCurrentTimeSec', 'number', [], [])),
      durationSec: Number(module.ccall('getPlayerDurationSec', 'number', [], [])),
      chartEndSec: Number(module.ccall('getPlayerChartEndSec', 'number', [], [])),
      sourceOffsetSec: Number(module.ccall('getPlayerSourceOffsetSec', 'number', [], [])),
      effectiveLeadInSec: Number(module.ccall('getPlayerEffectiveLeadInSec', 'number', [], [])),
      audioStartDelaySec: Number(module.ccall('getPlayerAudioStartDelaySec', 'number', [], [])),
      apStartSec: Number(module.ccall('getPlayerApStartSec', 'number', [], [])),
      transportState: decodeTransportState(Number(module.ccall('getPlayerTransportState', 'number', [], []))),
      requiresGesture: Number(module.ccall('getPlayerRequiresGesture', 'number', [], [])) === 1,
      hasAudio: Number(module.ccall('getPlayerHasAudio', 'number', [], [])) === 1,
      warnings: warningText.trim(),
    }
  }

  dispose() {
    if (!this.module) {
      return
    }
    this.module.ccall('disposePlayer', null, [], [])
  }

  private getWarningText() {
    if (!this.module) {
      return ''
    }
    return String(this.module.ccall('getPlayerWarningText', 'string', [], []) || '')
  }

  private async callWithBytes(name: string, key: string, bytes: Uint8Array, async = false) {
    const keyPtr = this.allocString(key)
    const data = this.allocBytes(bytes)
    try {
      const result = await this.call<number>(
        name,
        'number',
        ['number', 'number', 'number'],
        [keyPtr, data.ptr, data.length],
        async,
      )
      if (Number(result) !== 1) {
        throw new Error(this.getWarningText() || `Failed to call ${name}.`)
      }
    } finally {
      this.freePtr(keyPtr)
      this.freePtr(data.ptr)
    }
  }

  private async call<T>(
    name: string,
    returnType: string | null,
    argTypes: string[],
    args: unknown[],
    async = false,
  ) {
    const module = this.assertReady()
    const value = module.ccall(name, returnType, argTypes, args, async ? { async: true } : undefined)
    return (async ? await (value as Promise<T>) : (value as T))
  }

  private allocString(value: string) {
    const module = this.assertReady()
    const encoded = new TextEncoder().encode(value)
    const ptr = module._malloc(encoded.length + 1)
    module.HEAPU8.set(encoded, ptr)
    module.HEAPU8[ptr + encoded.length] = 0
    return ptr
  }

  private allocBytes(bytes: Uint8Array | null) {
    const module = this.assertReady()
    if (!bytes || bytes.length === 0) {
      return { ptr: 0, length: 0 }
    }
    const ptr = module._malloc(bytes.length)
    module.HEAPU8.set(bytes, ptr)
    return { ptr, length: bytes.length }
  }

  private freePtr(ptr: number) {
    if (!this.module || !ptr) {
      return
    }
    this.module._free(ptr)
  }

  private assertReady() {
    if (!this.module) {
      throw new Error('Wasm module has not been initialized.')
    }
    return this.module
  }
}
