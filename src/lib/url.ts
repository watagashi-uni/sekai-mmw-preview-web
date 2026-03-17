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
    cover: url.searchParams.get('cover'),
    rawOffsetMs,
    title: pickFirstNonEmptyParam(url, ['title', 'songTitle', 'musicTitle']),
    lyricist: pickFirstNonEmptyParam(url, ['lyricist', 'lyrics', 'lyric', 'songwriter']),
    composer: pickFirstNonEmptyParam(url, ['composer', 'music']),
    arranger: pickFirstNonEmptyParam(url, ['arranger', 'arrangement', 'arrange']),
    vocal: pickFirstNonEmptyParam(url, ['vocal', 'vocals', 'vo', 'singer']),
    difficulty: pickFirstNonEmptyParam(url, ['difficulty', 'diff', 'level']),
    description1: pickFirstNonEmptyParam(url, ['description1', 'desc1', 'introDesc1', 'meta1', 'info1']),
    description2: pickFirstNonEmptyParam(url, ['description2', 'desc2', 'introDesc2', 'meta2', 'info2']),
    extra: pickFirstNonEmptyParam(url, ['extra', 'subtitle', 'tag', 'introExtra']),
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
