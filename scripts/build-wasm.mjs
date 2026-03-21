import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'

const projectRoot = '/Users/watagashi/Documents/Code/sekai-mmw-preview-web'
const generatedDir = path.join(projectRoot, 'src/generated')
const publicWasmDir = path.join(projectRoot, 'public/wasm')
const wasmManifestFile = path.join(generatedDir, 'mmwWasmAsset.ts')

function hasExecutable(name) {
  try {
    execFileSync('which', [name], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

if (!hasExecutable('emcc')) {
  throw new Error('Missing `emcc`. Install Emscripten first, then rerun the build.')
}

fs.mkdirSync(generatedDir, { recursive: true })
fs.mkdirSync(publicWasmDir, { recursive: true })

const outputFile = path.join(generatedDir, 'mmw-preview.js')
const sourceFiles = [
  path.join(projectRoot, 'native/src/mmw_preview.cpp'),
  path.join(projectRoot, 'native/src/mmw_overlay_player.cpp'),
  path.join(projectRoot, 'native/mmw_port/Math.cpp'),
  path.join(projectRoot, 'native/mmw_port/MinMax.cpp'),
  path.join(projectRoot, 'native/mmw_port/Utilities.cpp'),
  path.join(projectRoot, 'native/mmw_port/Tempo.cpp'),
  path.join(projectRoot, 'native/mmw_port/Score.cpp'),
  path.join(projectRoot, 'native/mmw_port/Note.cpp'),
  path.join(projectRoot, 'native/mmw_port/Particle.cpp'),
  path.join(projectRoot, 'native/mmw_port/EffectView.cpp'),
  path.join(projectRoot, 'native/mmw_port/ResourceManager.cpp'),
  path.join(projectRoot, 'native/mmw_port/Rendering/Camera.cpp'),
  path.join(projectRoot, 'native/vendor/imgui/imgui.cpp'),
  path.join(projectRoot, 'native/vendor/imgui/imgui_draw.cpp'),
  path.join(projectRoot, 'native/vendor/imgui/imgui_tables.cpp'),
  path.join(projectRoot, 'native/vendor/imgui/imgui_widgets.cpp'),
  path.join(projectRoot, 'native/vendor/imgui/imgui_impl_opengl3.cpp'),
]

execFileSync(
  'emcc',
  [
    ...sourceFiles,
    '-std=c++20',
    '-O3',
    '-fexceptions',
    '-D_XM_NO_INTRINSICS_=1',
    '-I',
    path.join(projectRoot, 'native/include'),
    '-I',
    path.join(projectRoot, 'native/generated'),
    '-I',
    path.join(projectRoot, 'native/vendor'),
    '-I',
    path.join(projectRoot, 'native/vendor/imgui'),
    '-I',
    path.join(projectRoot, 'native/vendor/DirectXMath/Inc'),
    '-DIMGUI_IMPL_OPENGL_ES3',
    '-s',
    'WASM=1',
    '-s',
    'ASYNCIFY=1',
    '-s',
    'MODULARIZE=1',
    '-s',
    'EXPORT_ES6=1',
    '-s',
    'ENVIRONMENT=web',
    '-s',
    'FILESYSTEM=1',
    '-s',
    'USE_WEBGL2=1',
    '-s',
    'MIN_WEBGL_VERSION=2',
    '-s',
    'MAX_WEBGL_VERSION=2',
    '-s',
    'FULL_ES3=1',
    '-s',
    'ALLOW_MEMORY_GROWTH=1',
    '-s',
    'INITIAL_MEMORY=268435456',
    '-s',
    'MAXIMUM_MEMORY=1073741824',
    '-s',
    'STACK_SIZE=1048576',
    '-s',
    'NO_EXIT_RUNTIME=1',
    '-s',
    'DISABLE_EXCEPTION_CATCHING=0',
    '-s',
    'ASSERTIONS=2',
    '-s',
    'STACK_OVERFLOW_CHECK=2',
    '-s',
    "EXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString','HEAPF32','HEAP32','HEAPU8']",
    '-s',
    "EXPORTED_FUNCTIONS=['_malloc','_free']",
    '-o',
    outputFile,
  ],
  {
    cwd: projectRoot,
    stdio: 'inherit',
  },
)

const generatedJs = fs.readFileSync(outputFile, 'utf8')
const patchedJs = generatedJs
  .replaceAll(
    'var registerPreMainLoop=f=>{typeof MainLoop!="undefined"&&MainLoop.preMainLoop.push(f)};',
    'var registerPreMainLoop=f=>{typeof MainLoop!="undefined"&&MainLoop&&MainLoop.preMainLoop&&MainLoop.preMainLoop.push(f)};',
  )
  .replace(/typeof MainLoop!="undefined"&&MainLoop\.func/g, 'typeof MainLoop!="undefined"&&MainLoop&&MainLoop.func')
  .replace(/typeof MainLoop<"u"&&MainLoop\.func/g, 'typeof MainLoop<"u"&&MainLoop&&MainLoop.func')

if (patchedJs !== generatedJs) {
  fs.writeFileSync(outputFile, patchedJs)
}

fs.copyFileSync(
  path.join(generatedDir, 'mmw-preview.wasm'),
  path.join(publicWasmDir, 'mmw-preview.wasm'),
)

const wasmBuffer = fs.readFileSync(path.join(generatedDir, 'mmw-preview.wasm'))
const wasmHash = crypto.createHash('sha256').update(wasmBuffer).digest('hex').slice(0, 12)
const hashedWasmName = `mmw-preview.${wasmHash}.wasm`

for (const file of fs.readdirSync(publicWasmDir)) {
  if (/^mmw-preview\.[0-9a-f]{12}\.wasm$/.test(file)) {
    fs.rmSync(path.join(publicWasmDir, file), { force: true })
  }
}

fs.copyFileSync(
  path.join(generatedDir, 'mmw-preview.wasm'),
  path.join(publicWasmDir, hashedWasmName),
)

fs.writeFileSync(
  wasmManifestFile,
  `export const mmwWasmFilename = '${hashedWasmName}'\nexport const mmwWasmHash = '${wasmHash}'\n`,
)
