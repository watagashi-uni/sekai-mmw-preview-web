import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const TICKS_PER_BEAT_DEFAULT = 480
const MIN_LANE = 0
const MAX_LANE = 11
const TARGET_SAMPLE_RATE = 44100

const soundDefinitions = {
  tap: { file: 'se_live_perfect.mp3', volume: 0.75, loop: false },
  criticalTap: { file: 'se_live_critical.mp3', volume: 0.75, loop: false },
  flick: { file: 'se_live_flick.mp3', volume: 0.75, loop: false },
  flickCritical: { file: 'se_live_flick_critical.mp3', volume: 0.8, loop: false },
  trace: { file: 'se_live_trace.mp3', volume: 0.8, loop: false },
  traceCritical: { file: 'se_live_trace_critical.mp3', volume: 0.82, loop: false },
  tick: { file: 'se_live_connect.mp3', volume: 0.9, loop: false },
  tickCritical: { file: 'se_live_connect_critical.mp3', volume: 0.92, loop: false },
  holdLoop: { file: 'se_live_long.mp3', volume: 0.7, loop: true },
  holdLoopCritical: { file: 'se_live_long_critical.mp3', volume: 0.7, loop: true },
}

const soundRoot = path.resolve('/Users/watagashi/Documents/Code/sekai-mmw-preview-web/public/assets/mmw/sound')

function printUsage() {
  console.log(`Usage:
  node scripts/render-key-audio.mjs --sus <path-or-url> --out <output.mp3> [--offset <ms>] [--format mp3|wav]

Examples:
  node scripts/render-key-audio.mjs --sus ./chart.sus --out ./chart-key.mp3 --offset 9000
  node scripts/render-key-audio.mjs --sus "https://example.com/chart.sus" --out ./chart-key.wav
`)
}

function parseArgs(argv) {
  const result = {
    sus: '',
    out: '',
    offsetMs: null,
    format: '',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    const next = argv[index + 1]
    switch (token) {
      case '--sus':
        result.sus = next ?? ''
        index += 1
        break
      case '--out':
        result.out = next ?? ''
        index += 1
        break
      case '--offset':
        result.offsetMs = next === undefined ? null : Number.parseFloat(next)
        index += 1
        break
      case '--format':
        result.format = next ?? ''
        index += 1
        break
      case '--help':
      case '-h':
        printUsage()
        process.exit(0)
        break
      default:
        break
    }
  }

  if (!result.sus || !result.out) {
    printUsage()
    throw new Error('Missing required `--sus` or `--out`.')
  }
  if (result.offsetMs !== null && Number.isNaN(result.offsetMs)) {
    throw new Error('Invalid `--offset` value.')
  }
  if (result.format && result.format !== 'mp3' && result.format !== 'wav') {
    throw new Error('`--format` must be `mp3` or `wav`.')
  }

  return result
}

function trim(value) {
  return value.trim()
}

function startsWith(value, prefix) {
  return value.startsWith(prefix)
}

function endsWith(value, suffix) {
  return value.endsWith(suffix)
}

function splitWhitespace(value) {
  return value.trim().split(/\s+/).filter(Boolean)
}

function split(value, delimiter) {
  return value.split(delimiter)
}

function noteKey(note) {
  return `${note.tick}-${note.lane}`
}

function ticksToSec(ticks, beatTicks, bpm) {
  return ticks * (60 / bpm / beatTicks)
}

function accumulateDuration(tick, beatTicks, tempos) {
  if (tempos.length === 0) {
    return 0
  }

  let total = 0
  let accTicks = 0
  let lastTempo = 0
  for (let index = 0; index < tempos.length - 1; index += 1) {
    lastTempo = index
    const ticks = tempos[index + 1].tick - tempos[index].tick
    if (accTicks + ticks >= tick) {
      break
    }
    accTicks += ticks
    total += ticksToSec(ticks, beatTicks, tempos[index].bpm)
    lastTempo = index + 1
  }

  total += ticksToSec(tick - tempos[lastTempo].tick, beatTicks, tempos[lastTempo].bpm)
  return total
}

class SusDataLine {
  constructor(measureOffset, line) {
    const separatorIndex = line.indexOf(':')
    if (separatorIndex === -1) {
      throw new Error(`Invalid SUS line: ${line}`)
    }
    this.header = trim(line.slice(1, separatorIndex))
    this.data = line.slice(separatorIndex + 1)
    this.measureOffset = measureOffset
    const headerMeasure = this.header.slice(0, 3)
    this.measure = /^\d+$/.test(headerMeasure) ? Number.parseInt(headerMeasure, 10) : 0
  }

  getEffectiveMeasure() {
    return this.measure + this.measureOffset
  }
}

class SusParser {
  constructor() {
    this.ticksPerBeat = TICKS_PER_BEAT_DEFAULT
    this.measureOffset = 0
    this.waveOffset = 0
    this.title = ''
    this.artist = ''
    this.designer = ''
    this.bpmDefinitions = new Map()
    this.bars = []
  }

  parseText(text) {
    this.ticksPerBeat = TICKS_PER_BEAT_DEFAULT
    this.measureOffset = 0
    this.waveOffset = 0
    this.title = ''
    this.artist = ''
    this.designer = ''
    this.bpmDefinitions.clear()
    this.bars = []

    const sus = {
      metadata: { data: {}, waveOffset: 0 },
      taps: [],
      directionals: [],
      slides: [],
      guides: [],
      bpms: [],
      barlengths: [],
      hiSpeeds: [],
    }

    const noteLines = []
    const bpmLines = []
    const rawLines = text.split(/\r?\n/)
    for (const rawLine of rawLines) {
      const line = trim(rawLine)
      if (!startsWith(line, '#')) {
        continue
      }

      if (this.isCommand(line)) {
        this.processCommand(line)
      } else {
        const susLine = new SusDataLine(this.measureOffset, line)
        const header = susLine.header
        if (header.length !== 5 && header.length !== 6) {
          continue
        }
        if (endsWith(header, '02') && /^\d+$/.test(header)) {
          sus.barlengths.push({
            bar: susLine.getEffectiveMeasure(),
            length: Number.parseFloat(susLine.data),
          })
        } else if (startsWith(header, 'BPM')) {
          this.bpmDefinitions.set(header.slice(3), Number.parseFloat(susLine.data))
        } else if (endsWith(header, '08')) {
          bpmLines.push(susLine)
        } else {
          noteLines.push(susLine)
        }
      }
    }

    if (sus.barlengths.length === 0) {
      sus.barlengths.push({ bar: 0, length: 4 })
    }

    this.bars = this.getBars(sus.barlengths)
    sus.bpms = this.getBpms(bpmLines)

    const slideStreams = new Map()
    const guideStreams = new Map()
    for (const line of noteLines) {
      const header = line.header
      if (header.length === 5 && header[3] === '1') {
        sus.taps.push(...this.getNotes(line))
      } else if (header.length === 5 && header[3] === '5') {
        sus.directionals.push(...this.getNotes(line))
      } else if (header.length === 6 && header[3] === '3') {
        const channel = Number.parseInt(header.slice(5, 6), 36)
        const stream = slideStreams.get(channel) ?? []
        stream.push(...this.getNotes(line))
        slideStreams.set(channel, stream)
      } else if (header.length === 6 && header[3] === '9') {
        const channel = Number.parseInt(header.slice(5, 6), 36)
        const stream = guideStreams.get(channel) ?? []
        stream.push(...this.getNotes(line))
        guideStreams.set(channel, stream)
      }
    }

    for (const stream of slideStreams.values()) {
      sus.slides.push(...this.getNoteStream(stream))
    }
    for (const stream of guideStreams.values()) {
      sus.guides.push(...this.getNoteStream(stream))
    }

    sus.metadata.data.title = this.title
    sus.metadata.data.artist = this.artist
    sus.metadata.data.designer = this.designer
    sus.metadata.waveOffset = this.waveOffset
    return sus
  }

  isCommand(line) {
    if (line.length < 2) return false
    if (/\d/.test(line[1])) return false
    if (line.includes('"')) {
      const parts = splitWhitespace(line)
      if (parts.length < 2) return false
      if (parts[0].includes(':')) return false
      const firstQuote = line.indexOf('"')
      const lastQuote = line.lastIndexOf('"')
      return firstQuote !== lastQuote && lastQuote !== -1
    }
    return !line.includes(':')
  }

  processCommand(line) {
    const keyPos = line.indexOf(' ')
    if (keyPos === -1) return
    let key = line.slice(1, keyPos).toUpperCase()
    let value = line.slice(keyPos + 1)
    if (startsWith(value, '"') && endsWith(value, '"')) {
      value = value.slice(1, -1)
    }

    if (key === 'TITLE') this.title = value
    else if (key === 'ARTIST') this.artist = value
    else if (key === 'DESIGNER') this.designer = value
    else if (key === 'WAVEOFFSET') this.waveOffset = Number.parseFloat(value)
    else if (key === 'MEASUREBS') this.measureOffset = Number.parseInt(value, 10)
    else if (key === 'REQUEST') {
      const requestArgs = splitWhitespace(value)
      if (requestArgs.length === 2 && requestArgs[0] === 'ticks_per_beat') {
        this.ticksPerBeat = Number.parseInt(requestArgs[1], 10)
      }
    }
  }

  getBars(lengths) {
    const bars = []
    bars.push({
      measure: lengths[0].bar,
      ticksPerMeasure: Math.trunc(lengths[0].length * this.ticksPerBeat),
      ticks: 0,
    })
    for (let index = 1; index < lengths.length; index += 1) {
      const measure = lengths[index].bar
      const ticksPerMeasure = Math.trunc(lengths[index].length * this.ticksPerBeat)
      const ticks = Math.trunc((measure - lengths[index - 1].bar) * lengths[index - 1].length * this.ticksPerBeat)
      bars.push({ measure, ticksPerMeasure, ticks })
    }
    bars.sort((a, b) => a.measure - b.measure)
    return bars
  }

  getTicks(measure, index, total) {
    let barIndex = 0
    let accBarTicks = 0
    for (let idx = 0; idx < this.bars.length; idx += 1) {
      if (this.bars[idx].measure > measure) {
        break
      }
      barIndex = idx
      accBarTicks += this.bars[idx].ticks
    }
    return (
      accBarTicks +
      (measure - this.bars[barIndex].measure) * this.bars[barIndex].ticksPerMeasure +
      Math.trunc((index * this.bars[barIndex].ticksPerMeasure) / total)
    )
  }

  getNotes(line) {
    const notes = []
    for (let index = 0; index + 1 < line.data.length; index += 2) {
      if (line.data[index] === '0' && line.data[index + 1] === '0') continue
      notes.push({
        tick: this.getTicks(line.getEffectiveMeasure(), index, line.data.length),
        lane: Number.parseInt(line.header.slice(4, 5), 36),
        width: Number.parseInt(line.data.slice(index + 1, index + 2), 36),
        type: Number.parseInt(line.data.slice(index, index + 1), 36),
      })
    }
    return notes
  }

  getBpms(lines) {
    const bpms = []
    for (const line of lines) {
      for (let index = 0; index + 1 < line.data.length; index += 2) {
        if (line.data[index] === '0' && line.data[index + 1] === '0') continue
        const tick = this.getTicks(line.getEffectiveMeasure(), index, line.data.length)
        const key = line.data.slice(index, index + 2)
        const bpm = this.bpmDefinitions.get(key) ?? 120
        bpms.push({ tick, bpm })
      }
    }
    bpms.sort((a, b) => a.tick - b.tick)
    return bpms
  }

  getNoteStream(stream) {
    const sorted = [...stream].sort((a, b) => a.tick - b.tick)
    const result = []
    let current = []
    let newSlide = true
    for (const note of sorted) {
      if (newSlide) {
        current = []
        newSlide = false
      }
      current.push(note)
      if (note.type === 2) {
        result.push(current)
        newSlide = true
      }
    }
    return result
  }
}

function sortHoldSteps(score, hold) {
  hold.steps.sort((left, right) => {
    const leftNote = score.notes.get(left.ID)
    const rightNote = score.notes.get(right.ID)
    if (leftNote.tick === rightNote.tick) {
      return leftNote.lane - rightNote.lane
    }
    return leftNote.tick - rightNote.tick
  })
}

function susToScore(sus, normalizedOffsetMs) {
  let nextId = 1
  const score = {
    metadata: {
      title: sus.metadata.data.title ?? '',
      artist: sus.metadata.data.artist ?? '',
      author: sus.metadata.data.designer ?? '',
      musicOffset: normalizedOffsetMs,
    },
    notes: new Map(),
    holdNotes: new Map(),
    tempoChanges: [],
  }

  const flicks = new Map()
  const criticals = new Set()
  const stepIgnore = new Set()
  const easeIns = new Set()
  const easeOuts = new Set()
  const slideKeys = new Set()
  const frictions = new Set()
  const hiddenHolds = new Set()

  for (const slide of sus.slides) {
    for (const note of slide) {
      if ([1, 2, 3, 5].includes(note.type)) {
        slideKeys.add(noteKey(note))
      }
    }
  }

  for (const dir of sus.directionals) {
    const key = noteKey(dir)
    if (dir.type === 1) flicks.set(key, 'default')
    else if (dir.type === 3) flicks.set(key, 'left')
    else if (dir.type === 4) flicks.set(key, 'right')
    else if (dir.type === 2) easeIns.add(key)
    else if (dir.type === 5 || dir.type === 6) easeOuts.add(key)
  }

  for (const tap of sus.taps) {
    const key = noteKey(tap)
    if (tap.type === 2) criticals.add(key)
    else if (tap.type === 3) stepIgnore.add(key)
    else if (tap.type === 5) frictions.add(key)
    else if (tap.type === 6) {
      criticals.add(key)
      frictions.add(key)
    } else if (tap.type === 7) hiddenHolds.add(key)
    else if (tap.type === 8) {
      hiddenHolds.add(key)
      criticals.add(key)
    }
  }

  for (const tap of sus.taps) {
    if (tap.type === 7 || tap.type === 8) continue
    if (tap.lane - 2 < MIN_LANE || tap.lane - 2 > MAX_LANE) continue
    const key = noteKey(tap)
    if (slideKeys.has(key)) continue
    const note = {
      type: 'Tap',
      tick: tap.tick,
      lane: tap.lane - 2,
      width: tap.width,
      critical: criticals.has(key),
      friction: frictions.has(key),
      flick: flicks.get(key) ?? 'none',
      parentID: -1,
      ID: nextId++,
    }
    score.notes.set(note.ID, note)
  }

  const fillSlides = (slides, isGuide) => {
    for (const slide of slides) {
      if (slide.length < 2) continue
      const start = slide.find((note) => note.type === 1 || note.type === 2)
      if (!start) continue
      const critical = criticals.has(noteKey(slide[0]))
      const hold = { start: null, steps: [], end: 0, startType: 'Normal', endType: 'Normal' }
      const startID = nextId++

      for (const susNote of slide) {
        const key = noteKey(susNote)
        let ease = 'Linear'
        if (easeIns.has(key)) ease = 'EaseIn'
        else if (easeOuts.has(key)) ease = 'EaseOut'

        if (susNote.type === 1) {
          const note = {
            type: 'Hold',
            tick: susNote.tick,
            lane: susNote.lane - 2,
            width: susNote.width,
            critical,
            friction: false,
            flick: 'none',
            parentID: -1,
            ID: startID,
          }
          if (isGuide) {
            hold.startType = 'Guide'
          } else {
            note.friction = frictions.has(key)
            hold.startType = hiddenHolds.has(key) ? 'Hidden' : 'Normal'
          }
          score.notes.set(note.ID, note)
          hold.start = { ID: note.ID, type: 'Normal', ease }
        } else if (susNote.type === 2) {
          const note = {
            type: 'HoldEnd',
            tick: susNote.tick,
            lane: susNote.lane - 2,
            width: susNote.width,
            critical: critical ? true : criticals.has(key),
            friction: false,
            flick: 'none',
            parentID: startID,
            ID: nextId++,
          }
          if (isGuide) {
            hold.endType = 'Guide'
          } else {
            note.flick = flicks.get(key) ?? 'none'
            note.friction = frictions.has(key)
            hold.endType = hiddenHolds.has(key) ? 'Hidden' : 'Normal'
          }
          score.notes.set(note.ID, note)
          hold.end = note.ID
        } else if (susNote.type === 3 || susNote.type === 5) {
          const note = {
            type: 'HoldMid',
            tick: susNote.tick,
            lane: susNote.lane - 2,
            width: susNote.width,
            critical,
            friction: false,
            flick: 'none',
            parentID: startID,
            ID: nextId++,
          }
          let type = susNote.type === 3 ? 'Normal' : 'Hidden'
          if (stepIgnore.has(key)) type = 'Skip'
          score.notes.set(note.ID, note)
          hold.steps.push({ ID: note.ID, type, ease })
        }
      }

      if (!hold.start || hold.end === 0) {
        throw new Error('Invalid hold note in SUS')
      }
      sortHoldSteps(score, hold)
      score.holdNotes.set(startID, hold)
    }
  }

  fillSlides(sus.slides, false)
  fillSlides(sus.guides, true)

  for (const bpm of sus.bpms) {
    score.tempoChanges.push({ tick: bpm.tick, bpm: bpm.bpm })
  }
  if (score.tempoChanges.length === 0) {
    score.tempoChanges.push({ tick: 0, bpm: 120 })
  }
  score.tempoChanges.sort((a, b) => a.tick - b.tick)

  return score
}

function getNoteCenter(note) {
  return (note.lane - 6) + note.width / 2
}

function calculateHitEvents(score) {
  const events = []
  const holdStepTypesById = new Map()
  for (const hold of score.holdNotes.values()) {
    for (const step of hold.steps) {
      holdStepTypesById.set(step.ID, step.type)
    }
  }

  for (const note of score.notes.values()) {
    let kind = 'tap'
    let playEvent = true

    if (note.type === 'Hold') {
      const hold = score.holdNotes.get(note.ID)
      playEvent = hold.startType === 'Normal'
    } else if (note.type === 'HoldEnd') {
      const hold = score.holdNotes.get(note.parentID)
      playEvent = hold.endType === 'Normal'
    }

    if (playEvent && note.type === 'HoldMid') {
      const stepType = holdStepTypesById.get(note.ID)
      if (stepType === 'Hidden') {
        playEvent = false
      } else {
        kind = 'tick'
      }
    } else if (note.flick !== 'none') {
      kind = 'flick'
    } else if (note.friction) {
      kind = 'trace'
    } else if (note.critical && note.type === 'Tap') {
      kind = 'criticalTap'
    } else {
      kind = 'tap'
    }

    if (!playEvent) continue

    const timeSec = accumulateDuration(note.tick, TICKS_PER_BEAT_DEFAULT, score.tempoChanges)
    events.push({
      timeSec,
      center: getNoteCenter(note),
      width: note.width,
      kind,
      critical: note.critical,
      endTimeSec: undefined,
    })

    if (note.type === 'Hold') {
      const hold = score.holdNotes.get(note.ID)
      if (hold.startType === 'Normal' && hold.startType !== 'Guide') {
        const endNote = score.notes.get(hold.end)
        events.push({
          timeSec,
          center: getNoteCenter(note),
          width: note.width,
          kind: 'holdLoop',
          critical: note.critical,
          endTimeSec: accumulateDuration(endNote.tick, TICKS_PER_BEAT_DEFAULT, score.tempoChanges),
        })
      }
    }
  }

  events.sort((left, right) => {
    if (left.timeSec === right.timeSec) return left.center - right.center
    return left.timeSec - right.timeSec
  })
  return events
}

function normalizeOffsetMs(rawOffsetMs, susText) {
  if (rawOffsetMs !== null) {
    return -rawOffsetMs
  }
  const match = susText.match(/^#WAVEOFFSET\s+([+-]?\d+(?:\.\d+)?)/im)
  if (!match) return 0
  const seconds = Number.parseFloat(match[1])
  return Number.isFinite(seconds) ? seconds * 1000 : 0
}

function resolveSoundKey(event) {
  if (event.kind === 'criticalTap') return 'criticalTap'
  if (event.kind === 'flick') return event.critical ? 'flickCritical' : 'flick'
  if (event.kind === 'trace') return event.critical ? 'traceCritical' : 'trace'
  if (event.kind === 'tick') return event.critical ? 'tickCritical' : 'tick'
  if (event.kind === 'holdLoop') return event.critical ? 'holdLoopCritical' : 'holdLoop'
  return 'tap'
}

async function runCommand(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, options)
    const stdout = []
    const stderr = []

    if (child.stdout) child.stdout.on('data', (chunk) => stdout.push(chunk))
    if (child.stderr) child.stderr.on('data', (chunk) => stderr.push(chunk))

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout))
      } else {
        reject(new Error(`${command} exited with code ${code}\n${Buffer.concat(stderr).toString('utf8')}`))
      }
    })
  })
}

async function decodeSoundToMono(soundPath) {
  const raw = await runCommand('ffmpeg', [
    '-v', 'error',
    '-i', soundPath,
    '-f', 'f32le',
    '-acodec', 'pcm_f32le',
    '-ac', '1',
    '-ar', String(TARGET_SAMPLE_RATE),
    'pipe:1',
  ])
  return new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4)).slice()
}

function mixOneShot(target, startFrame, source, volume) {
  if (startFrame >= target.length) return
  for (let index = 0; index < source.length; index += 1) {
    const targetIndex = startFrame + index
    if (targetIndex >= target.length) break
    target[targetIndex] += source[index] * volume
  }
}

function mixHoldLoop(target, startFrame, endFrame, source, volume) {
  if (startFrame >= target.length || endFrame <= startFrame) return
  const safeEndFrame = Math.min(endFrame, target.length)
  const introFrames = Math.min(3000, source.length)
  const loopStart = Math.min(3000, source.length)
  const loopEnd = Math.max(loopStart + 1, source.length - 3000)
  const loopLength = Math.max(1, loopEnd - loopStart)

  let cursor = startFrame
  let sourceIndex = 0
  while (cursor < safeEndFrame && sourceIndex < introFrames) {
    target[cursor] += source[sourceIndex] * volume
    cursor += 1
    sourceIndex += 1
  }

  while (cursor < safeEndFrame) {
    const loopIndex = loopStart + ((cursor - startFrame - introFrames) % loopLength)
    target[cursor] += source[loopIndex] * volume
    cursor += 1
  }
}

function clampPcm(buffer) {
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] > 1) buffer[index] = 1
    else if (buffer[index] < -1) buffer[index] = -1
  }
}

async function encodeOutput(floatBuffer, outPath, format) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sus-key-audio-'))
  const rawPath = path.join(tempDir, 'mix.f32')
  await fs.writeFile(rawPath, Buffer.from(floatBuffer.buffer, floatBuffer.byteOffset, floatBuffer.byteLength))

  const extension = format || path.extname(outPath).slice(1).toLowerCase() || 'mp3'
  const args = [
    '-v', 'error',
    '-f', 'f32le',
    '-ar', String(TARGET_SAMPLE_RATE),
    '-ac', '1',
    '-i', rawPath,
  ]

  if (extension === 'wav') {
    args.push('-ac', '2', '-c:a', 'pcm_s16le', outPath)
  } else {
    args.push('-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k', outPath)
  }

  await runCommand('ffmpeg', args)
  await fs.rm(tempDir, { recursive: true, force: true })
}

async function readSusText(source) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source)
    if (!response.ok) {
      throw new Error(`Failed to fetch SUS: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  return fs.readFile(path.resolve(source), 'utf8')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const susText = await readSusText(args.sus)
  const normalizedOffsetMs = normalizeOffsetMs(args.offsetMs, susText)
  const parser = new SusParser()
  const sus = parser.parseText(susText)
  const score = susToScore(sus, normalizedOffsetMs)
  const hitEvents = calculateHitEvents(score).map((event) => ({
    ...event,
    timeSec: event.timeSec - normalizedOffsetMs / 1000,
    endTimeSec: event.endTimeSec === undefined ? undefined : event.endTimeSec - normalizedOffsetMs / 1000,
  }))

  const usedSoundKeys = [...new Set(hitEvents.map(resolveSoundKey))]
  const soundBuffers = new Map()
  for (const soundKey of usedSoundKeys) {
    const definition = soundDefinitions[soundKey]
    soundBuffers.set(soundKey, await decodeSoundToMono(path.join(soundRoot, definition.file)))
  }

  let maxTimeSec = 1
  for (const event of hitEvents) {
    const soundKey = resolveSoundKey(event)
    const soundBuffer = soundBuffers.get(soundKey)
    if (event.kind === 'holdLoop' && event.endTimeSec !== undefined) {
      maxTimeSec = Math.max(maxTimeSec, event.endTimeSec)
    } else {
      maxTimeSec = Math.max(maxTimeSec, event.timeSec + soundBuffer.length / TARGET_SAMPLE_RATE)
    }
  }

  const mix = new Float32Array(Math.ceil((maxTimeSec + 1) * TARGET_SAMPLE_RATE))
  for (const event of hitEvents) {
    const soundKey = resolveSoundKey(event)
    const definition = soundDefinitions[soundKey]
    const soundBuffer = soundBuffers.get(soundKey)
    const startFrame = Math.max(0, Math.round(event.timeSec * TARGET_SAMPLE_RATE))
    if (definition.loop && event.endTimeSec !== undefined) {
      mixHoldLoop(mix, startFrame, Math.round(event.endTimeSec * TARGET_SAMPLE_RATE), soundBuffer, definition.volume)
    } else {
      mixOneShot(mix, startFrame, soundBuffer, definition.volume)
    }
  }

  clampPcm(mix)
  await encodeOutput(mix, path.resolve(args.out), args.format)

  console.log(`Wrote key audio: ${path.resolve(args.out)}`)
  console.log(`Events: ${hitEvents.length}`)
  console.log(`Offset applied: ${Math.round(normalizedOffsetMs)} ms`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
