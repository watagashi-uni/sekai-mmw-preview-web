import type { UrlPreviewParams } from './types'

function pickFirstNonEmptyParam(url: URL, keys: readonly string[]) {
  for (const key of keys) {
    const value = url.searchParams.get(key)
    if (value !== null && value.trim() !== '') {
      return value
    }
  }
  return null
}

type ConfigPayload = Record<string, unknown>

function asNonEmptyString(value: unknown) {
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'number' && Number.isFinite(value)
        ? String(value)
        : typeof value === 'bigint'
          ? String(value)
          : null
  if (text === null) {
    return null
  }
  const trimmed = text.trim()
  return trimmed === '' ? null : trimmed
}

function pickFirstNonEmptyFromConfig(config: ConfigPayload, keys: readonly string[]) {
  for (const key of keys) {
    const value = asNonEmptyString(config[key])
    if (value !== null) {
      return value
    }
  }
  return null
}

function decodeBase64UrlText(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4)
  if (typeof atob === 'function') {
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder('utf-8').decode(bytes)
  }
  throw new Error('Base64 decoder unavailable.')
}

function parseConfigPayload(url: URL): ConfigPayload | null {
  const raw = pickFirstNonEmptyParam(url, ['config', 'cfg'])
  if (!raw) {
    return null
  }

  const candidates: string[] = [raw]
  try {
    candidates.push(decodeURIComponent(raw))
  } catch {
    // ignore malformed URI components, fall back to original
  }
  try {
    candidates.push(decodeBase64UrlText(raw))
  } catch {
    // ignore non-base64 payloads
  }
  try {
    candidates.push(decodeURIComponent(decodeBase64UrlText(raw)))
  } catch {
    // ignore double-encoded payloads
  }

  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as ConfigPayload
      }
    } catch {
      // try next candidate
    }
  }

  throw new Error('Invalid `config` query parameter.')
}

export function parseUrlPreviewParams(url: URL): UrlPreviewParams {
  const config = parseConfigPayload(url)
  const sus =
    (config ? pickFirstNonEmptyFromConfig(config, ['s', 'sus']) : null) ??
    url.searchParams.get('sus')
  if (!sus) {
    throw new Error('Missing required `sus` (or `config.s`) query parameter.')
  }

  const offsetText =
    (config ? pickFirstNonEmptyFromConfig(config, ['o', 'offset']) : null) ??
    url.searchParams.get('offset')
  const rawOffsetMs =
    offsetText === null || offsetText.trim() === ''
      ? null
      : Number.parseFloat(offsetText.trim())

  if (rawOffsetMs !== null && Number.isNaN(rawOffsetMs)) {
    throw new Error('Invalid `offset` query parameter.')
  }

  return {
    sus,
    bgm:
      (config ? pickFirstNonEmptyFromConfig(config, ['b', 'bgm']) : null) ??
      url.searchParams.get('bgm'),
    cover:
      (config ? pickFirstNonEmptyFromConfig(config, ['c', 'cover']) : null) ??
      url.searchParams.get('cover'),
    rawOffsetMs,
    title:
      (config ? pickFirstNonEmptyFromConfig(config, ['t', 'title', 'songTitle', 'musicTitle']) : null) ??
      pickFirstNonEmptyParam(url, ['title', 'songTitle', 'musicTitle']),
    lyricist:
      (config ? pickFirstNonEmptyFromConfig(config, ['ly', 'lyricist', 'lyrics', 'lyric', 'songwriter']) : null) ??
      pickFirstNonEmptyParam(url, ['lyricist', 'lyrics', 'lyric', 'songwriter']),
    composer:
      (config ? pickFirstNonEmptyFromConfig(config, ['co', 'composer', 'music']) : null) ??
      pickFirstNonEmptyParam(url, ['composer', 'music']),
    arranger:
      (config ? pickFirstNonEmptyFromConfig(config, ['ar', 'arranger', 'arrangement', 'arrange']) : null) ??
      pickFirstNonEmptyParam(url, ['arranger', 'arrangement', 'arrange']),
    vocal:
      (config ? pickFirstNonEmptyFromConfig(config, ['v', 'vocal', 'vocals', 'vo', 'singer']) : null) ??
      pickFirstNonEmptyParam(url, ['vocal', 'vocals', 'vo', 'singer']),
    difficulty:
      (config ? pickFirstNonEmptyFromConfig(config, ['d', 'difficulty', 'diff', 'level']) : null) ??
      pickFirstNonEmptyParam(url, ['difficulty', 'diff', 'level']),
    description1:
      (config ? pickFirstNonEmptyFromConfig(config, ['d1', 'description1', 'desc1', 'introDesc1', 'meta1', 'info1']) : null) ??
      pickFirstNonEmptyParam(url, ['description1', 'desc1', 'introDesc1', 'meta1', 'info1']),
    description2:
      (config ? pickFirstNonEmptyFromConfig(config, ['d2', 'description2', 'desc2', 'introDesc2', 'meta2', 'info2']) : null) ??
      pickFirstNonEmptyParam(url, ['description2', 'desc2', 'introDesc2', 'meta2', 'info2']),
    extra:
      (config ? pickFirstNonEmptyFromConfig(config, ['e', 'extra', 'subtitle', 'tag', 'introExtra']) : null) ??
      pickFirstNonEmptyParam(url, ['extra', 'subtitle', 'tag', 'introExtra']),
  }
}

export function extractSusWaveOffsetMs(susText: string) {
  const match = susText.match(/^#WAVEOFFSET\s+([+-]?\d+(?:\.\d+)?)/im)
  if (!match) {
    return 0
  }

  const seconds = Number.parseFloat(match[1])
  return Number.isFinite(seconds) ? seconds * 1000 : 0
}

export function normalizeOffsetMs(rawOffsetMs: number | null, susText: string) {
  if (rawOffsetMs !== null) {
    return -rawOffsetMs
  }

  return extractSusWaveOffsetMs(susText)
}
