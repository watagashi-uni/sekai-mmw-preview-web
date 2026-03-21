#!/usr/bin/env node
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const projectRoot = '/Users/watagashi/Documents/Code/sekai-mmw-preview-web'
const apVideoPath = path.join(projectRoot, 'public/assets/mmw/overlay/ap.mp4')
const defaultPort = Number(process.env.MMW_RENDER_PORT ?? 41731)
const chromiumGpuLaunchArgs = [
  '--disable-dev-shm-usage',
  '--ignore-gpu-blocklist',
  '--enable-webgl',
  '--enable-gpu-rasterization',
  '--enable-accelerated-2d-canvas',
  '--use-angle=metal',
]
const chromiumSwiftshaderLaunchArgs = [
  '--disable-dev-shm-usage',
  '--ignore-gpu-blocklist',
  '--enable-webgl',
  '--use-angle=swiftshader',
  '--use-gl=angle',
]

function parseArgs(argv) {
  const args = {
    config: '',
    out: '',
    fps: 60,
    width: 1920,
    height: 1080,
    crf: 17,
    preset: 'medium',
    videoCodec: 'auto',
    swiftshader: false,
    coreOnly: false,
    maxSeconds: null,
    skipBuild: false,
    keepTemp: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    const next = argv[index + 1]
    if (token === '--config' && next) {
      args.config = next
      index += 1
      continue
    }
    if (token === '--out' && next) {
      args.out = next
      index += 1
      continue
    }
    if (token === '--fps' && next) {
      args.fps = Number.parseInt(next, 10)
      index += 1
      continue
    }
    if (token === '--width' && next) {
      args.width = Number.parseInt(next, 10)
      index += 1
      continue
    }
    if (token === '--height' && next) {
      args.height = Number.parseInt(next, 10)
      index += 1
      continue
    }
    if (token === '--crf' && next) {
      args.crf = Number.parseInt(next, 10)
      index += 1
      continue
    }
    if (token === '--preset' && next) {
      args.preset = next
      index += 1
      continue
    }
    if (token === '--video-codec' && next) {
      args.videoCodec = next
      index += 1
      continue
    }
    if (token === '--swiftshader') {
      args.swiftshader = true
      continue
    }
    if (token === '--core-only') {
      args.coreOnly = true
      continue
    }
    if (token === '--max-seconds' && next) {
      args.maxSeconds = Number.parseFloat(next)
      index += 1
      continue
    }
    if (token === '--skip-build') {
      args.skipBuild = true
      continue
    }
    if (token === '--keep-temp') {
      args.keepTemp = true
      continue
    }
  }

  if (!args.config || !args.out) {
    throw new Error(
      'Usage: npm run render:video -- --config <json|path> --out <mp4> [--fps 60] [--width 1920] [--height 1080] [--crf 17] [--preset medium] [--video-codec auto|libx264|h264_videotoolbox] [--swiftshader] [--core-only] [--max-seconds N] [--skip-build] [--keep-temp]',
    )
  }
  if (!Number.isFinite(args.fps) || args.fps <= 0) {
    throw new Error('`--fps` must be a positive integer.')
  }
  if (!Number.isFinite(args.width) || args.width <= 0 || !Number.isFinite(args.height) || args.height <= 0) {
    throw new Error('`--width/--height` must be positive integers.')
  }
  if (!['auto', 'libx264', 'h264_videotoolbox'].includes(args.videoCodec)) {
    throw new Error('`--video-codec` must be one of: auto, libx264, h264_videotoolbox.')
  }
  if (args.maxSeconds !== null && (!Number.isFinite(args.maxSeconds) || args.maxSeconds <= 0)) {
    throw new Error('`--max-seconds` must be a positive number.')
  }
  return args
}

function parseObjectText(text) {
  try {
    return JSON.parse(text)
  } catch {
    // fall through
  }
  try {
    return vm.runInNewContext(`(${text})`, {}, { timeout: 300 })
  } catch {
    throw new Error('Failed to parse `--config`. Provide valid JSON or a JS object literal.')
  }
}

async function loadConfig(configArg) {
  const maybePath = path.isAbsolute(configArg)
    ? configArg
    : path.join(process.cwd(), configArg)
  let raw = configArg
  if (fs.existsSync(maybePath) && fs.statSync(maybePath).isFile()) {
    raw = await fsp.readFile(maybePath, 'utf8')
  }

  const parsed = parseObjectText(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('`--config` must resolve to an object.')
  }

  const config = {
    sus: String(parsed.sus ?? '').trim(),
    bgm: parsed.bgm == null ? null : String(parsed.bgm).trim(),
    cover: parsed.cover == null ? null : String(parsed.cover).trim(),
    offset: parsed.offset == null ? null : Number(parsed.offset),
    difficulty: parsed.difficulty == null ? null : String(parsed.difficulty),
    title: parsed.title == null ? null : String(parsed.title),
    lyricist: parsed.lyricist == null ? null : String(parsed.lyricist),
    composer: parsed.composer == null ? null : String(parsed.composer),
    arranger: parsed.arranger == null ? null : String(parsed.arranger),
    vocal: parsed.vocal == null ? null : String(parsed.vocal),
    description1: parsed.description1 == null ? null : String(parsed.description1),
    description2: parsed.description2 == null ? null : String(parsed.description2),
    extra: parsed.extra == null ? null : String(parsed.extra),
  }

  if (!config.sus) {
    throw new Error('Config requires `sus`.')
  }
  if (config.offset !== null && !Number.isFinite(config.offset)) {
    throw new Error('Config field `offset` must be a finite number.')
  }
  return config
}

function toBase64UrlUtf8(text) {
  return Buffer.from(text, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function makeCfgPayload(config) {
  const payload = {
    s: config.sus,
  }
  if (config.bgm) payload.b = config.bgm
  if (config.cover) payload.c = config.cover
  if (config.offset !== null) payload.o = config.offset
  if (config.difficulty) payload.d = config.difficulty
  if (config.title) payload.t = config.title
  if (config.lyricist) payload.ly = config.lyricist
  if (config.composer) payload.co = config.composer
  if (config.arranger) payload.ar = config.arranger
  if (config.vocal) payload.v = config.vocal
  if (config.description1) payload.d1 = config.description1
  if (config.description2) payload.d2 = config.description2
  if (config.extra) payload.e = config.extra
  return toBase64UrlUtf8(JSON.stringify(payload))
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      ...options,
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(' ')} failed with code ${code ?? -1}`))
      }
    })
  })
}

function runCommandCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(new Error(`${command} ${args.join(' ')} failed with code ${code ?? -1}\n${stderr}`))
      }
    })
  })
}

async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function resolveChromiumLaunchArgs(useSwiftshader) {
  return useSwiftshader ? chromiumSwiftshaderLaunchArgs : chromiumGpuLaunchArgs
}

async function ensurePlaywrightBrowser(chromiumLaunchArgs) {
  try {
    const browser = await chromium.launch({ headless: true, args: chromiumLaunchArgs })
    await browser.close()
    return
  } catch {
    await runCommand('npx', ['playwright', 'install', 'chromium'])
  }
}

function writeToStream(stream, chunk) {
  return new Promise((resolve, reject) => {
    const canWrite = stream.write(chunk, (error) => {
      if (error) {
        reject(error)
      }
    })
    if (canWrite) {
      resolve()
      return
    }
    stream.once('drain', resolve)
    stream.once('error', reject)
  })
}

async function waitProcess(child, name) {
  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${name} exited with code ${code ?? -1}`))
      }
    })
  })
}

async function probeDurationSec(mediaPathOrUrl) {
  const { stdout } = await runCommandCapture('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    mediaPathOrUrl,
  ])
  const parsed = Number.parseFloat(stdout.trim())
  return Number.isFinite(parsed) ? parsed : 0
}

async function hasAudioStream(mediaPath) {
  try {
    const { stdout } = await runCommandCapture('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=index',
      '-of',
      'csv=p=0',
      mediaPath,
    ])
    return stdout.trim() !== ''
  } catch {
    return false
  }
}

async function hasFfmpegEncoder(encoderName) {
  try {
    const { stdout } = await runCommandCapture('ffmpeg', ['-hide_banner', '-encoders'])
    return stdout.includes(encoderName)
  } catch {
    return false
  }
}

function resolveVideoCodec(preferredCodec, hasVideoToolbox) {
  if (preferredCodec === 'h264_videotoolbox') {
    if (!hasVideoToolbox) {
      throw new Error('Requested h264_videotoolbox, but ffmpeg does not support it on this machine.')
    }
    return 'h264_videotoolbox'
  }
  if (preferredCodec === 'libx264') {
    return 'libx264'
  }
  return hasVideoToolbox ? 'h264_videotoolbox' : 'libx264'
}

function estimateHardwareBitrateKbps(width, height, fps) {
  const scale = (Math.max(1, width) * Math.max(1, height) * Math.max(1, fps)) / (1920 * 1080 * 60)
  return Math.max(2000, Math.min(80000, Math.round(24000 * scale)))
}

function getVideoEncodeArgs(codec, options, width, height) {
  if (codec === 'h264_videotoolbox') {
    const bitrateKbps = estimateHardwareBitrateKbps(width, height, options.fps)
    const maxRateKbps = Math.round(bitrateKbps * 1.6)
    const bufferKbps = Math.round(bitrateKbps * 2)
    return [
      '-c:v',
      'h264_videotoolbox',
      '-profile:v',
      'high',
      '-allow_sw',
      '1',
      '-b:v',
      `${bitrateKbps}k`,
      '-maxrate',
      `${maxRateKbps}k`,
      '-bufsize',
      `${bufferKbps}k`,
      '-pix_fmt',
      'yuv420p',
    ]
  }

  return [
    '-c:v',
    'libx264',
    '-preset',
    options.preset,
    '-crf',
    String(options.crf),
    '-pix_fmt',
    'yuv420p',
  ]
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const config = await loadConfig(options.config)
  const chromiumLaunchArgs = resolveChromiumLaunchArgs(options.swiftshader)
  const hasVideoToolbox = await hasFfmpegEncoder('h264_videotoolbox')
  const videoCodec = resolveVideoCodec(options.videoCodec, hasVideoToolbox)
  console.log(`[render] browser renderer: ${options.swiftshader ? 'swiftshader' : 'gpu'}`)
  console.log(`[render] ffmpeg video codec: ${videoCodec}`)
  if (options.coreOnly) {
    console.log('[render] mode: core-only (wasm/gl core render only)')
  }
  const outPath = path.isAbsolute(options.out) ? options.out : path.join(process.cwd(), options.out)
  await fsp.mkdir(path.dirname(outPath), { recursive: true })

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mmw-render-'))
  const baseVideoPath = path.join(tempDir, 'base.mp4')
  const muxedVideoPath = path.join(tempDir, 'muxed.mp4')
  const keySoundWavPath = path.join(tempDir, 'keys.wav')
  const mixedAudioPath = path.join(tempDir, 'audio.m4a')
  const finalVideoPath = path.join(tempDir, 'final.mp4')
  let serverProcess = null

  try {
    if (!options.skipBuild) {
      console.log('[render] building web app...')
      await runCommand('npm', ['run', 'build'])
    }

    console.log('[render] ensuring Chromium...')
    await ensurePlaywrightBrowser(chromiumLaunchArgs)

    const previewArgs = ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(defaultPort), '--strictPort']
    console.log('[render] starting preview server...')
    serverProcess = spawn('npm', previewArgs, { cwd: projectRoot, stdio: 'inherit' })
    await waitForHttp(`http://127.0.0.1:${defaultPort}/`, 120000)

    const cfg = makeCfgPayload(config)
    const previewUrl = `http://127.0.0.1:${defaultPort}/preview?cfg=${cfg}&render=cli${options.coreOnly ? '&coreOnly=1' : ''}`
    console.log(`[render] opening ${previewUrl}`)

    const browser = await chromium.launch({
      headless: true,
      args: chromiumLaunchArgs,
    })
    try {
      const context = await browser.newContext({
        viewport: { width: options.width, height: options.height },
        deviceScaleFactor: 1,
      })
      const page = await context.newPage()
      await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 180000 })
      await page.evaluate(async () => {
        if (!window.__MMW_EXPORT__) {
          throw new Error('Missing __MMW_EXPORT__ bridge.')
        }
        await window.__MMW_EXPORT__.waitReady()
      })

      const renderInfo = await page.evaluate(() => {
        if (!window.__MMW_EXPORT__) {
          throw new Error('Missing __MMW_EXPORT__ bridge.')
        }
        return window.__MMW_EXPORT__.getRenderInfo()
      })
      const captureRectRaw = await page.evaluate(() => {
        if (!window.__MMW_EXPORT__) {
          throw new Error('Missing __MMW_EXPORT__ bridge.')
        }
        return window.__MMW_EXPORT__.getCaptureRect()
      })
      const clip = {
        x: Math.max(0, Math.floor(captureRectRaw.x)),
        y: Math.max(0, Math.floor(captureRectRaw.y)),
        width: Math.max(1, Math.round(captureRectRaw.width)),
        height: Math.max(1, Math.round(captureRectRaw.height)),
      }
      const renderWidth = clip.width
      const renderHeight = clip.height

      const targetDurationSec =
        options.maxSeconds == null
          ? renderInfo.durationSec
          : Math.min(renderInfo.durationSec, options.maxSeconds)
      const totalFrames = Math.max(1, Math.ceil(targetDurationSec * options.fps))
      const videoEncodeArgs = getVideoEncodeArgs(videoCodec, options, renderWidth, renderHeight)
      console.log(
        `[render] duration=${renderInfo.durationSec.toFixed(3)}s target=${targetDurationSec.toFixed(3)}s frames=${totalFrames} chartEnd=${renderInfo.chartEndSec.toFixed(3)} leadIn=${renderInfo.chartLeadInSec.toFixed(3)} audioDelay=${renderInfo.audioStartDelaySec.toFixed(3)} capture=${renderWidth}x${renderHeight}`,
      )

      const ffmpegFrames = spawn(
        'ffmpeg',
        [
          '-y',
          '-f',
          'image2pipe',
          '-vcodec',
          'png',
          '-framerate',
          String(options.fps),
          '-i',
          '-',
          '-an',
          ...videoEncodeArgs,
          baseVideoPath,
        ],
        { stdio: ['pipe', 'inherit', 'inherit'] },
      )
      ffmpegFrames.stdin.setMaxListeners(0)

      const frameEncodeStartMs = Date.now()
      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
        const timeSec = frameIndex / options.fps
        await page.evaluate((time) => {
          if (!window.__MMW_EXPORT__) {
            throw new Error('Missing __MMW_EXPORT__ bridge.')
          }
          window.__MMW_EXPORT__.renderAtTime(time)
        }, timeSec)
        const png = await page.screenshot({
          type: 'png',
          clip,
          captureBeyondViewport: false,
        })
        await writeToStream(ffmpegFrames.stdin, png)
        if ((frameIndex + 1) % (options.fps * 2) === 0 || frameIndex + 1 === totalFrames) {
          const progress = (((frameIndex + 1) / totalFrames) * 100).toFixed(1)
          console.log(`[render] frames ${frameIndex + 1}/${totalFrames} (${progress}%)`)
        }
      }

      ffmpegFrames.stdin.end()
      await waitProcess(ffmpegFrames, 'ffmpeg(frame encode)')
      const frameEncodeElapsedSec = (Date.now() - frameEncodeStartMs) / 1000
      const effectiveRenderFps = totalFrames / Math.max(frameEncodeElapsedSec, 0.001)
      console.log(`[render] frame pass elapsed=${frameEncodeElapsedSec.toFixed(2)}s effective=${effectiveRenderFps.toFixed(2)}fps`)

      let hasKeySoundTrack = false
      if (!options.coreOnly) {
        try {
        console.log('[render] rendering key-sound track...')
        const keyTrack = await page.evaluate(async () => {
          if (!window.__MMW_EXPORT__) {
            throw new Error('Missing __MMW_EXPORT__ bridge.')
          }
          return window.__MMW_EXPORT__.renderKeySoundWavBase64(44100)
        })
        if (keyTrack?.base64) {
          await fsp.writeFile(keySoundWavPath, Buffer.from(keyTrack.base64, 'base64'))
          hasKeySoundTrack = true
          console.log('[render] key-sound track ready.')
        } else {
          console.log('[render] key-sound track skipped (no hit events).')
        }
        } catch (error) {
          console.warn(`[render] key-sound rendering failed, continue without it: ${error instanceof Error ? error.message : String(error)}`)
        }
      } else {
        console.log('[render] core-only mode enabled: skip key-sound/audio/AP composite.')
      }

      let sourceForAp = baseVideoPath
      const hasBgmTrack = !options.coreOnly && Boolean(config.bgm)
      const hasAnyAudio = hasBgmTrack || hasKeySoundTrack
      if (hasAnyAudio) {
        if (hasBgmTrack && hasKeySoundTrack) {
          console.log('[render] mixing BGM + key-sound...')
          const ffmpegArgs = ['-y']
          const delaySec = Math.max(0, renderInfo.audioStartDelaySec)
          if (delaySec > 0.000001) {
            ffmpegArgs.push('-itsoffset', delaySec.toFixed(6))
          }
          ffmpegArgs.push(
            '-i',
            config.bgm,
            '-i',
            keySoundWavPath,
            '-filter_complex',
            '[0:a][1:a]amix=inputs=2:normalize=0:dropout_transition=0,alimiter=limit=0.95[aout]',
            '-map',
            '[aout]',
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            mixedAudioPath,
          )
          await runCommand('ffmpeg', ffmpegArgs)
        } else if (hasBgmTrack) {
          console.log('[render] encoding BGM track...')
          const ffmpegArgs = ['-y']
          const delaySec = Math.max(0, renderInfo.audioStartDelaySec)
          if (delaySec > 0.000001) {
            ffmpegArgs.push('-itsoffset', delaySec.toFixed(6))
          }
          ffmpegArgs.push(
            '-i',
            config.bgm,
            '-map',
            '0:a:0',
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            mixedAudioPath,
          )
          await runCommand('ffmpeg', ffmpegArgs)
        } else if (hasKeySoundTrack) {
          console.log('[render] encoding key-sound track...')
          await runCommand('ffmpeg', [
            '-y',
            '-i',
            keySoundWavPath,
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            mixedAudioPath,
          ])
        }

        console.log('[render] muxing video + audio...')
        await runCommand('ffmpeg', [
          '-y',
          '-i',
          baseVideoPath,
          '-i',
          mixedAudioPath,
          '-map',
          '0:v:0',
          '-map',
          '1:a:0',
          '-c:v',
          'copy',
          '-c:a',
          'copy',
          '-shortest',
          muxedVideoPath,
        ])
        sourceForAp = muxedVideoPath
      }

      if (!options.coreOnly && fs.existsSync(apVideoPath)) {
        const apDurationSec = await probeDurationSec(apVideoPath)
        const apStartSec = Math.max(0, renderInfo.chartLeadInSec + renderInfo.chartEndSec + 1)
        const apEndSec = apStartSec + Math.max(apDurationSec, 0.01)
        const sourceHasAudio = await hasAudioStream(sourceForAp)
        const apHasAudio = await hasAudioStream(apVideoPath)
        const apAudioDelayMs = Math.max(0, Math.round(apStartSec * 1000))
        const filterParts = [
          `[0:v]format=rgba,drawbox=x=0:y=0:w=iw:h=ih:color=black@0.5:t=fill:enable='gte(t,${apStartSec.toFixed(6)})'[dark]`,
          `[1:v]fps=${options.fps},scale=${renderWidth}:${renderHeight}:flags=lanczos,format=rgba,hue=s=0,curves=r='0/0 0.10/0 1/1':g='0/0 0.10/0 1/1':b='0/0 0.10/0 1/1',setpts=PTS-STARTPTS+${apStartSec.toFixed(6)}/TB[ap]`,
          `[dark][ap]blend=all_mode=addition:all_opacity=0.82:enable='between(t,${apStartSec.toFixed(6)},${apEndSec.toFixed(6)})'[outv]`,
        ]
        if (sourceHasAudio && apHasAudio) {
          filterParts.push(
            `[1:a]adelay=${apAudioDelayMs}|${apAudioDelayMs},volume=1[apa]`,
            `[0:a][apa]amix=inputs=2:normalize=0:dropout_transition=0,alimiter=limit=0.97[aout]`,
          )
        } else if (!sourceHasAudio && apHasAudio) {
          filterParts.push(`[1:a]adelay=${apAudioDelayMs}|${apAudioDelayMs}[aout]`)
        }
        const filter = filterParts.join(';')
        const ffmpegArgs = [
          '-y',
          '-i',
          sourceForAp,
          '-i',
          apVideoPath,
          '-filter_complex',
          filter,
          '-map',
          '[outv]',
          ...videoEncodeArgs,
        ]
        if (sourceHasAudio && apHasAudio) {
          ffmpegArgs.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k')
        } else if (!sourceHasAudio && apHasAudio) {
          ffmpegArgs.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k')
        } else if (sourceHasAudio) {
          ffmpegArgs.push('-map', '0:a:0', '-c:a', 'copy')
        }
        ffmpegArgs.push('-shortest', finalVideoPath)
        console.log('[render] applying AP blend...')
        await runCommand('ffmpeg', ffmpegArgs)
      } else {
        await fsp.copyFile(sourceForAp, finalVideoPath)
      }

      await fsp.copyFile(finalVideoPath, outPath)
      console.log(`[render] done: ${outPath}`)
    } finally {
      await browser.close()
    }
  } finally {
    if (serverProcess && serverProcess.pid) {
      serverProcess.kill('SIGTERM')
    }
    if (!options.keepTemp) {
      await fsp.rm(tempDir, { recursive: true, force: true })
    } else {
      console.log(`[render] kept temp dir: ${tempDir}`)
    }
  }
}

main().catch((error) => {
  console.error(`[render] failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
