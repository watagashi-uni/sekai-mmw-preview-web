type SusToJsonModule = {
  UTF8ToString: (ptr: number) => string
  stringToNewUTF8: (text: string) => number
  _sus_to_json: (susPtr: number, needCombo: number) => number
  _sus_combo_count: (susPtr: number) => number
  _sus_free: (ptr: number) => void
  _free: (ptr: number) => void
}

type SusToJsonFactory = (options: {
  locateFile: (file: string, prefix?: string) => string
  print?: (...args: unknown[]) => void
  printErr?: (...args: unknown[]) => void
}) => Promise<SusToJsonModule>

let modulePromise: Promise<SusToJsonModule> | null = null

function publicAssetUrl(path: string) {
  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  return new URL(`${normalizedBase}${path.replace(/^\/+/, '')}`, window.location.href).toString()
}

async function loadSusToJsonModule() {
  if (!modulePromise) {
    const moduleUrl = publicAssetUrl('wasm/sus-to-json/sus_to_json_wasm.js')
    modulePromise = import(/* @vite-ignore */ moduleUrl).then((module) =>
      (module as { default: SusToJsonFactory }).default({
        locateFile: (file: string) => publicAssetUrl(`wasm/sus-to-json/${file}`),
      }),
    )
  }
  return modulePromise
}

function throwIfConverterError(jsonText: string) {
  if (!jsonText.startsWith('{"error":')) {
    return
  }
  try {
    const parsed = JSON.parse(jsonText) as { error?: unknown }
    if (typeof parsed.error === 'string' && parsed.error) {
      throw new Error(`SUS 转 JSON 失败：${parsed.error}`)
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('SUS 转 JSON 失败：')) {
      throw error
    }
    throw new Error(`SUS 转 JSON 失败：${jsonText}`)
  }
}

export async function convertSusToCustomScoreJson(susText: string, needCombo = false) {
  const module = await loadSusToJsonModule()
  const inputPtr = module.stringToNewUTF8(susText)
  let outputPtr = 0
  try {
    outputPtr = module._sus_to_json(inputPtr, needCombo ? 1 : 0)
    if (!outputPtr) {
      throw new Error('SUS 转 JSON 失败：wasm 没有返回结果')
    }
    const jsonText = module.UTF8ToString(outputPtr)
    throwIfConverterError(jsonText)
    return jsonText
  } finally {
    if (outputPtr) {
      module._sus_free(outputPtr)
    }
    module._free(inputPtr)
  }
}

export async function calculateSusComboCount(susText: string) {
  const module = await loadSusToJsonModule()
  const inputPtr = module.stringToNewUTF8(susText)
  try {
    return module._sus_combo_count(inputPtr)
  } finally {
    module._free(inputPtr)
  }
}
