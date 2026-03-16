# sekai-mmw-preview-web

A standalone, readonly browser preview for SUS charts with MMW-style stage,
notes, hold rendering, effects, and judgement sounds.

This project is adapted from [MikuMikuWorld](https://github.com/crash5band/MikuMikuWorld)
and focuses on preview playback only (no editor UI).

## Features

- Readonly chart preview at site root (`/`)
- URL-driven loading:
  - `sus` (required): SUS URL
  - `bgm` (optional): audio URL
  - `offset` (optional): milliseconds, positive input from URL side
- MMW-style rendering pipeline in WebAssembly
- Effects and judgement SE playback
- Runtime controls:
  - play/pause/stop
  - seek
  - playback rate
  - `noteSpeed` slider (`1.0..12.0`, default `10.5`)
  - low-effects toggle

## URL Format

```text
/?sus=<sus-url>&bgm=<bgm-url>&offset=<ms>
```

Example:

```text
/?sus=https%3A%2F%2Fassets.unipjsk.com%2Fstartapp%2Fmusic%2Fmusic_score%2F0703_01%2Fmaster&bgm=https%3A%2F%2Fassets.unipjsk.com%2Fondemand%2Fmusic%2Flong%2Fse_0703_01%2Fse_0703_01.mp3&offset=9000
```

Offset behavior:

- URL `offset` has higher priority than `#WAVEOFFSET` in SUS
- Internal rule is `internalOffsetMs = -offset`
- If URL `offset` is missing, fallback uses SUS `#WAVEOFFSET`

## Requirements

- Node.js 20+
- npm 10+
- Emscripten (`emcc`) in `PATH`

Check:

```bash
node -v
npm -v
emcc -v
```

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

This command will:

1. sync assets from local MMW source
2. build wasm
3. start Vite dev server

## Production Build

```bash
npm run build
```

Preview built output:

```bash
npm run preview
```

## Generate Key Audio

You can generate an audio file that contains only judgement/key sounds from a
SUS chart.

```bash
npm run render:key-audio -- --sus ./chart.sus --out ./chart-key.mp3 --offset 9000
```

It also supports SUS URLs:

```bash
npm run render:key-audio -- \
  --sus "https://assets.unipjsk.com/startapp/music/music_score/0703_01/master" \
  --out ./0703-key.mp3 \
  --offset 9000
```

Supported options:

- `--sus <path-or-url>`: required
- `--out <output-path>`: required
- `--offset <ms>`: optional, same external positive offset convention as preview URL
- `--format mp3|wav`: optional, defaults from output extension

## Project Structure

- `src/`: web app (UI, transport, wasm bridge, renderer)
- `native/src/mmw_preview.cpp`: wasm entry and chart/render pipeline
- `native/mmw_port/`: ported MMW runtime modules
- `scripts/build-wasm.mjs`: Emscripten build script
- `scripts/sync-mmw-assets.mjs`: asset sync script
- `public/`: static assets served directly

## Troubleshooting

- `memory access out of bounds`
  - usually caused by very large chart transfer/parsing stress
  - current bridge uses heap allocation for SUS input to avoid stack overflow
- stuck on `正在加载歌曲`
  - BGM loading and decode now have timeout fallback to silent preview
  - check browser console/network for CORS or blocked URL
- big SUS feels slow
  - parsing/rendering complexity depends on chart content, not only file size
  - for extreme charts, consider moving parsing to Web Worker in future

## License and Attribution

This project contains code modified from MikuMikuWorld by Crash5b and is
distributed under the MIT License.

- See [LICENSE](./LICENSE)
- Original project: [crash5band/MikuMikuWorld](https://github.com/crash5band/MikuMikuWorld)
