import fs from 'node:fs'
import path from 'node:path'

const projectRoot = '/Users/watagashi/Documents/Code/sekai-mmw-preview-web'
const mmwRoot = '/Users/watagashi/Documents/Code/MikuMikuWorld/MikuMikuWorld'
const overlayRoot = '/Users/watagashi/Downloads/pjsekai-overlay-APPEND-main/assets'
const backgroundGenRoot = '/Users/watagashi/Documents/Code/pjsekai-background-gen-rust/crates/core/assets'
const overlayRendererAssetRoot = '/Users/watagashi/Documents/Code/MikuMikuWorld/tools/overlay_renderer/assets/mmw'

const assetCopies = [
  ['res/editor/default.png', 'public/assets/mmw/default.png'],
  ['res/editor/stage.png', 'public/assets/mmw/stage.png'],
  ['res/notes/01/notes.png', 'public/assets/mmw/notes.png'],
  ['res/notes/01/longNoteLine.png', 'public/assets/mmw/longNoteLine.png'],
  ['res/notes/01/touchLine_eff.png', 'public/assets/mmw/touchLine_eff.png'],
  ['res/effect/0/tex_note_common_all_v2.png', 'public/assets/mmw/effect.png'],
  ['res/sound/01/se_live_tap.mp3', 'public/assets/mmw/sound/se_live_tap.mp3'],
  ['res/sound/01/se_live_flick.mp3', 'public/assets/mmw/sound/se_live_flick.mp3'],
  ['res/sound/01/se_live_trace.mp3', 'public/assets/mmw/sound/se_live_trace.mp3'],
  ['res/sound/01/se_live_connect.mp3', 'public/assets/mmw/sound/se_live_connect.mp3'],
  ['res/sound/01/se_live_long.mp3', 'public/assets/mmw/sound/se_live_long.mp3'],
  ['res/sound/01/se_live_perfect.mp3', 'public/assets/mmw/sound/se_live_perfect.mp3'],
  ['res/sound/01/se_live_critical.mp3', 'public/assets/mmw/sound/se_live_critical.mp3'],
  ['res/sound/01/se_live_flick_critical.mp3', 'public/assets/mmw/sound/se_live_flick_critical.mp3'],
  ['res/sound/01/se_live_trace_critical.mp3', 'public/assets/mmw/sound/se_live_trace_critical.mp3'],
  ['res/sound/01/se_live_connect_critical.mp3', 'public/assets/mmw/sound/se_live_connect_critical.mp3'],
  ['res/sound/01/se_live_long_critical.mp3', 'public/assets/mmw/sound/se_live_long_critical.mp3'],
]

const overlayAssetCopies = [
  ['background_full.png', 'public/assets/mmw/background_overlay.png'],
  ['start_bg.png', 'public/assets/mmw/overlay/start_bg.png'],
  ['start_grad.png', 'public/assets/mmw/overlay/start_grad.png'],
  ['ap.mp4', 'public/assets/mmw/overlay/ap.mp4'],
  ['combo.png', 'public/assets/mmw/overlay/combo.png'],
  ['life.png', 'public/assets/mmw/overlay/life.png'],
]

const fontCopies = [
  ['font/FOT-RodinNTLGPro-DB.ttf', 'public/assets/mmw/font/FOT-RodinNTLGPro-DB.ttf'],
  ['font/FOT-RodinNTLG Pro EB.otf', 'public/assets/mmw/font/FOT-RodinNTLG Pro EB.otf'],
  ['font/NotoSansCJKSC-Black.ttf', 'public/assets/mmw/font/NotoSansCJKSC-Black.ttf'],
]

const overlayTopLevelPngCopies = fs
  .readdirSync(overlayRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
  .map((entry) => [entry.name, `public/assets/mmw/overlay/${entry.name}`])

const overlayDirCopies = [
  ['score', 'public/assets/mmw/overlay/score'],
  ['life', 'public/assets/mmw/overlay/life'],
  ['combo', 'public/assets/mmw/overlay/combo'],
  ['judge', 'public/assets/mmw/overlay/judge'],
]

const backgroundGenDirCopies = [
  ['v3', 'public/assets/mmw/overlay/bggen/v3'],
]

const atlasSources = {
  stage: 'res/editor/spr/stage.txt',
  notes: 'res/notes/01/spr/notes.txt',
  longNoteLine: 'res/notes/01/spr/longNoteLine.txt',
  touchLine: 'res/notes/01/spr/touchLine_eff.txt',
}

const effectNames = [
  'fx_lane_critical',
  'fx_lane_critical_flick',
  'fx_lane_default',
  'fx_note_normal_gen',
  'fx_note_normal_aura',
  'fx_note_critical_normal_gen',
  'fx_note_critical_normal_aura',
  'fx_note_flick_gen',
  'fx_note_flick_aura',
  'fx_note_critical_flick_gen',
  'fx_note_critical_flick_aura',
  'fx_note_long_gen',
  'fx_note_long_aura',
  'fx_note_critical_long_gen',
  'fx_note_critical_long_aura',
  'fx_note_flick_flash',
  'fx_note_critical_flick_flash',
  'fx_note_long_hold_via_aura',
  'fx_note_critical_long_hold_via_aura',
  'fx_note_trace_aura',
  'fx_note_critical_trace_aura',
  'fx_note_hold_aura',
  'fx_note_long_hold_gen',
  'fx_note_critical_long_hold_gen_aura',
  'fx_note_critical_long_hold_gen',
]

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function copyDirectoryRecursive(sourceDir, targetDir) {
  ensureDir(targetDir)
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, targetPath)
    } else if (entry.isFile()) {
      ensureDir(path.dirname(targetPath))
      fs.copyFileSync(sourcePath, targetPath)
    }
  }
}

function parseAtlas(text) {
  const lines = text.split(/\r?\n/)
  const sprites = []
  let pendingName = ''

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }

    if (line.startsWith('#')) {
      pendingName = line.slice(1).trim()
      continue
    }

    const [x, y, width, height] = line.split(',').map((value) => Number.parseFloat(value.trim()))
    sprites.push({
      name: pendingName,
      x1: x,
      y1: y,
      x2: x + width,
      y2: y + height,
      width,
      height,
    })
  }

  return sprites
}

function parseTransforms(text) {
  const stripped = text
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
  const values = stripped
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((value) => Number.parseFloat(value))

  if (values.length % 64 !== 0) {
    throw new Error(`Unexpected transform value count: ${values.length}`)
  }

  const transforms = []
  for (let offset = 0; offset < values.length; offset += 64) {
    transforms.push(values.slice(offset, offset + 64))
  }
  return transforms
}

function writeTextFile(target, content) {
  ensureDir(path.dirname(target))
  fs.writeFileSync(target, content)
}

function toCppFloat(value) {
  if (Number.isInteger(value)) {
    return `${value}.0f`
  }
  return `${value}f`
}

function emitCppArray(name, type, values) {
  const rows = values.map((entry) => {
    if (Array.isArray(entry)) {
      return `        ${type}{ ${entry.map(toCppFloat).join(', ')} }`
    }
    return `        ${type}{ ${[entry.x1, entry.y1, entry.x2, entry.y2].map(toCppFloat).join(', ')} }`
  })

  return `inline constexpr std::array<${type}, ${values.length}> ${name}{{\n${rows.join(',\n')}\n    }};`
}

function escapeCppString(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
}

for (const [from, to] of assetCopies) {
  const source = path.join(mmwRoot, from)
  const target = path.join(projectRoot, to)
  ensureDir(path.dirname(target))
  fs.copyFileSync(source, target)
}

for (const [from, to] of overlayAssetCopies) {
  const source = path.join(overlayRoot, from)
  const target = path.join(projectRoot, to)
  ensureDir(path.dirname(target))
  fs.copyFileSync(source, target)
}

for (const [from, to] of overlayTopLevelPngCopies) {
  const source = path.join(overlayRoot, from)
  const target = path.join(projectRoot, to)
  ensureDir(path.dirname(target))
  fs.copyFileSync(source, target)
}

for (const [from, to] of overlayDirCopies) {
  copyDirectoryRecursive(path.join(overlayRoot, from), path.join(projectRoot, to))
}

for (const [from, to] of fontCopies) {
  const source = path.join(overlayRendererAssetRoot, from)
  const target = path.join(projectRoot, to)
  ensureDir(path.dirname(target))
  fs.copyFileSync(source, target)
}

if (fs.existsSync(backgroundGenRoot)) {
  for (const [from, to] of backgroundGenDirCopies) {
    copyDirectoryRecursive(path.join(backgroundGenRoot, from), path.join(projectRoot, to))
  }
}

for (const profile of [0, 1]) {
  for (const effectName of effectNames) {
    const source = path.join(mmwRoot, `res/effect/${profile}`, `${effectName}.json`)
    const target = path.join(projectRoot, 'public/assets/mmw/effects', String(profile), `${effectName}.json`)
    ensureDir(path.dirname(target))
    fs.copyFileSync(source, target)
  }
}

const atlases = Object.fromEntries(
  Object.entries(atlasSources).map(([key, relativePath]) => {
    const source = path.join(mmwRoot, relativePath)
    return [key, parseAtlas(fs.readFileSync(source, 'utf8'))]
  }),
)

const transforms = parseTransforms(
  fs.readFileSync(path.join(mmwRoot, 'res/effect/transform.txt'), 'utf8'),
).slice(0, 18)

const embeddedEffectsByProfile = [0, 1].map((profile) =>
  effectNames.map((name) => ({
    name,
    json: fs.readFileSync(path.join(mmwRoot, `res/effect/${profile}`, `${name}.json`), 'utf8'),
  })),
)

writeTextFile(
  path.join(projectRoot, 'src/generated/mmwAssets.ts'),
  `export type SpriteRect = {
  name: string
  x1: number
  y1: number
  x2: number
  y2: number
  width: number
  height: number
}

export const mmwTextureUrls = {
  background: '/assets/mmw/background_overlay.png',
  stage: '/assets/mmw/stage.png',
  notes: '/assets/mmw/notes.png',
  longNoteLine: '/assets/mmw/longNoteLine.png',
  touchLine: '/assets/mmw/touchLine_eff.png',
  effect: '/assets/mmw/effect.png',
} as const

export const mmwAtlases = ${JSON.stringify(atlases, null, 2)} as const satisfies Record<string, readonly SpriteRect[]>
`,
)

writeTextFile(
  path.join(projectRoot, 'src/generated/mmwEffects.ts'),
  `export const mmwEffectNames = ${JSON.stringify(effectNames, null, 2)} as const

export const mmwEffectProfiles = [0, 1] as const

export const mmwEffectUrls = Object.fromEntries(
  mmwEffectNames.map((name) => [name, \`/assets/mmw/effects/0/\${name}.json\`]),
) as Record<(typeof mmwEffectNames)[number], string>

export const mmwEffectProfileUrls = Object.fromEntries(
  mmwEffectProfiles.map((profile) => [
    profile,
    Object.fromEntries(mmwEffectNames.map((name) => [name, \`/assets/mmw/effects/\${profile}/\${name}.json\`])),
  ]),
) as Record<(typeof mmwEffectProfiles)[number], Record<(typeof mmwEffectNames)[number], string>>
`,
)

writeTextFile(
  path.join(projectRoot, 'native/generated/generated_resources.h'),
  `#pragma once
#include <array>

namespace mmw_preview
{
    struct SpriteRect
    {
        float x1;
        float y1;
        float x2;
        float y2;
    };

${emitCppArray('kNoteSprites', 'SpriteRect', atlases.notes)}

${emitCppArray('kLongNoteSprites', 'SpriteRect', atlases.longNoteLine)}

${emitCppArray('kTouchLineSprites', 'SpriteRect', atlases.touchLine)}

${emitCppArray('kSpriteTransforms', 'std::array<float, 64>', transforms)}

    struct EmbeddedEffect
    {
        const char* name;
        const char* json;
    };

    inline constexpr std::array<EmbeddedEffect, ${embeddedEffectsByProfile[0].length}> kEmbeddedEffectsProfile0{{
${embeddedEffectsByProfile[0]
  .map(
    ({ name, json }) =>
      `        EmbeddedEffect{ "${escapeCppString(name)}", "${escapeCppString(json)}" }`,
  )
  .join(',\n')}
    }};

    inline constexpr std::array<EmbeddedEffect, ${embeddedEffectsByProfile[1].length}> kEmbeddedEffectsProfile1{{
${embeddedEffectsByProfile[1]
  .map(
    ({ name, json }) =>
      `        EmbeddedEffect{ "${escapeCppString(name)}", "${escapeCppString(json)}" }`,
  )
  .join(',\n')}
    }};
}
`,
)
