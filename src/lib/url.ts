import type { UrlPreviewParams } from './types'

export function parseUrlPreviewParams(url: URL): UrlPreviewParams {
  const sus = url.searchParams.get('sus')
  if (!sus) {
    throw new Error('Missing required `sus` query parameter.')
  }

  const offsetText = url.searchParams.get('offset')
  const rawOffsetMs =
    offsetText === null || offsetText.trim() === ''
      ? null
      : Number.parseFloat(offsetText.trim())

  if (rawOffsetMs !== null && Number.isNaN(rawOffsetMs)) {
    throw new Error('Invalid `offset` query parameter.')
  }

  return {
    sus,
    bgm: url.searchParams.get('bgm'),
    rawOffsetMs,
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
