type Point = readonly [number, number]

type RgbaImage = {
  width: number
  height: number
  data: Uint8ClampedArray
}

type V3Assets = {
  base: RgbaImage
  bottom: RgbaImage
  centerCover: RgbaImage
  centerMask: RgbaImage
  sideCover: RgbaImage
  sideMask: RgbaImage
  windows: RgbaImage
}

const BGGEN_V3_BASE = '/assets/mmw/overlay/bggen/v3'

const MORPH_LEFT_NORMAL: readonly Point[] = [
  [566, 161],
  [1183, 134],
  [633, 731],
  [1226, 682],
]
const MORPH_RIGHT_NORMAL: readonly Point[] = [
  [966, 104],
  [1413, 72],
  [954, 525],
  [1390, 524],
]
const MORPH_LEFT_MIRROR: readonly Point[] = [
  [633, 1071],
  [1256, 1045],
  [598, 572],
  [1197, 569],
]
const MORPH_RIGHT_MIRROR: readonly Point[] = [
  [954, 1122],
  [1393, 1167],
  [942, 702],
  [1366, 717],
]

const MORPH_CENTER_NORMAL: readonly Point[] = [
  [824, 227],
  [1224, 227],
  [833, 608],
  [1216, 608],
]
const MORPH_CENTER_MIRROR: readonly Point[] = [
  [830, 1017],
  [1214, 1017],
  [833, 676],
  [1216, 676],
]

let v3AssetsPromise: Promise<V3Assets> | null = null

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function imageToCanvas(image: RgbaImage) {
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Failed to get canvas context.')
  }
  const data = new Uint8ClampedArray(image.data.length)
  data.set(image.data)
  context.putImageData(new ImageData(data, image.width, image.height), 0, 0)
  return canvas
}

function blankImage(width: number, height: number) {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  }
}

function cloneImage(source: RgbaImage): RgbaImage {
  return {
    width: source.width,
    height: source.height,
    data: new Uint8ClampedArray(source.data),
  }
}

async function loadImageData(url: string): Promise<RgbaImage> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load image: ${url}`)
  }
  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = createCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Failed to get canvas context.')
  }
  context.drawImage(bitmap, 0, 0)
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  bitmap.close()
  return {
    width: imageData.width,
    height: imageData.height,
    data: new Uint8ClampedArray(imageData.data),
  }
}

async function getV3Assets(): Promise<V3Assets> {
  if (!v3AssetsPromise) {
    v3AssetsPromise = Promise.all([
      loadImageData(`${BGGEN_V3_BASE}/base.png`),
      loadImageData(`${BGGEN_V3_BASE}/bottom.png`),
      loadImageData(`${BGGEN_V3_BASE}/center_cover.png`),
      loadImageData(`${BGGEN_V3_BASE}/center_mask.png`),
      loadImageData(`${BGGEN_V3_BASE}/side_cover.png`),
      loadImageData(`${BGGEN_V3_BASE}/side_mask.png`),
      loadImageData(`${BGGEN_V3_BASE}/windows.png`),
    ]).then(([base, bottom, centerCover, centerMask, sideCover, sideMask, windows]) => ({
      base,
      bottom,
      centerCover,
      centerMask,
      sideCover,
      sideMask,
      windows,
    }))
  }
  return v3AssetsPromise
}

function resizeNearest(source: RgbaImage, targetWidth: number, targetHeight: number): RgbaImage {
  const width = Math.max(1, targetWidth)
  const height = Math.max(1, targetHeight)
  const target = blankImage(width, height)

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor((y * source.height) / height))
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor((x * source.width) / width))
      const srcOffset = (sourceY * source.width + sourceX) * 4
      const dstOffset = (y * width + x) * 4
      target.data[dstOffset + 0] = source.data[srcOffset + 0]
      target.data[dstOffset + 1] = source.data[srcOffset + 1]
      target.data[dstOffset + 2] = source.data[srcOffset + 2]
      target.data[dstOffset + 3] = source.data[srcOffset + 3]
    }
  }

  return target
}

function overlayImage(base: RgbaImage, top: RgbaImage, offsetX: number, offsetY: number) {
  for (let y = 0; y < top.height; y += 1) {
    const targetY = y + offsetY
    if (targetY < 0 || targetY >= base.height) {
      continue
    }

    for (let x = 0; x < top.width; x += 1) {
      const targetX = x + offsetX
      if (targetX < 0 || targetX >= base.width) {
        continue
      }

      const srcIndex = (y * top.width + x) * 4
      const dstIndex = (targetY * base.width + targetX) * 4
      const srcA = top.data[srcIndex + 3]
      if (srcA === 0) {
        continue
      }

      const dstA = base.data[dstIndex + 3]
      if (dstA === 0 || srcA === 255) {
        base.data[dstIndex + 0] = top.data[srcIndex + 0]
        base.data[dstIndex + 1] = top.data[srcIndex + 1]
        base.data[dstIndex + 2] = top.data[srcIndex + 2]
        base.data[dstIndex + 3] = srcA
        continue
      }

      const srcAF = srcA / 255
      const dstAF = dstA / 255
      const outA = srcAF + dstAF * (1 - srcAF)

      const srcRF = top.data[srcIndex + 0] / 255
      const srcGF = top.data[srcIndex + 1] / 255
      const srcBF = top.data[srcIndex + 2] / 255

      const dstRF = base.data[dstIndex + 0] / 255
      const dstGF = base.data[dstIndex + 1] / 255
      const dstBF = base.data[dstIndex + 2] / 255

      const outR = (srcRF * srcAF + dstRF * dstAF * (1 - srcAF)) / outA
      const outG = (srcGF * srcAF + dstGF * dstAF * (1 - srcAF)) / outA
      const outB = (srcBF * srcAF + dstBF * dstAF * (1 - srcAF)) / outA

      base.data[dstIndex + 0] = Math.round(outR * 255)
      base.data[dstIndex + 1] = Math.round(outG * 255)
      base.data[dstIndex + 2] = Math.round(outB * 255)
      base.data[dstIndex + 3] = Math.round(outA * 255)
    }
  }
}

function applyAlphaMask(image: RgbaImage, mask: RgbaImage): RgbaImage {
  const masked = cloneImage(image)
  const length = Math.min(masked.data.length, mask.data.length)
  for (let index = 3; index < length; index += 4) {
    masked.data[index] = Math.min(masked.data[index], mask.data[index])
  }
  return masked
}

function solveLinear8(matrix: number[][], values: number[]) {
  const size = 8
  const left = matrix.map((row) => [...row])
  const right = [...values]

  for (let pivot = 0; pivot < size; pivot += 1) {
    let maxRow = pivot
    let maxValue = Math.abs(left[pivot][pivot])
    for (let row = pivot + 1; row < size; row += 1) {
      const value = Math.abs(left[row][pivot])
      if (value > maxValue) {
        maxValue = value
        maxRow = row
      }
    }

    if (maxValue < 1e-8) {
      return null
    }

    if (maxRow !== pivot) {
      const tempRow = left[pivot]
      left[pivot] = left[maxRow]
      left[maxRow] = tempRow
      const tempValue = right[pivot]
      right[pivot] = right[maxRow]
      right[maxRow] = tempValue
    }

    const pivotValue = left[pivot][pivot]
    for (let col = pivot; col < size; col += 1) {
      left[pivot][col] /= pivotValue
    }
    right[pivot] /= pivotValue

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) {
        continue
      }
      const factor = left[row][pivot]
      if (Math.abs(factor) < 1e-8) {
        continue
      }
      for (let col = pivot; col < size; col += 1) {
        left[row][col] -= factor * left[pivot][col]
      }
      right[row] -= factor * right[pivot]
    }
  }

  return right
}

function buildHomography(source: readonly Point[], target: readonly Point[]) {
  const matrix: number[][] = []
  const values: number[] = []

  for (let index = 0; index < 4; index += 1) {
    const [sx, sy] = source[index]
    const [tx, ty] = target[index]

    matrix.push([sx, sy, 1, 0, 0, 0, -sx * tx, -sy * tx])
    values.push(tx)

    matrix.push([0, 0, 0, sx, sy, 1, -sx * ty, -sy * ty])
    values.push(ty)
  }

  const solved = solveLinear8(matrix, values)
  if (!solved) {
    return null
  }

  return [
    solved[0],
    solved[1],
    solved[2],
    solved[3],
    solved[4],
    solved[5],
    solved[6],
    solved[7],
    1,
  ]
}

function invert3x3(matrix: readonly number[]) {
  const [a, b, c, d, e, f, g, h, i] = matrix

  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const D = -(b * i - c * h)
  const E = a * i - c * g
  const F = -(a * h - b * g)
  const G = b * f - c * e
  const H = -(a * f - c * d)
  const I = a * e - b * d

  const determinant = a * A + b * B + c * C
  if (Math.abs(determinant) < 1e-10) {
    return null
  }

  const reciprocal = 1 / determinant
  return [
    A * reciprocal,
    D * reciprocal,
    G * reciprocal,
    B * reciprocal,
    E * reciprocal,
    H * reciprocal,
    C * reciprocal,
    F * reciprocal,
    I * reciprocal,
  ]
}

function projectPoint(matrix: readonly number[], x: number, y: number): [number, number] | null {
  const denominator = matrix[6] * x + matrix[7] * y + matrix[8]
  if (Math.abs(denominator) < 1e-8) {
    return null
  }
  const mappedX = (matrix[0] * x + matrix[1] * y + matrix[2]) / denominator
  const mappedY = (matrix[3] * x + matrix[4] * y + matrix[5]) / denominator
  return [mappedX, mappedY]
}

function morph(sourceImage: RgbaImage, quad: readonly Point[], targetSize: readonly [number, number]) {
  const minX = Math.min(...quad.map((point) => point[0]))
  const minY = Math.min(...quad.map((point) => point[1]))
  const maxX = Math.max(...quad.map((point) => point[0]))
  const maxY = Math.max(...quad.map((point) => point[1]))

  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)

  const minImage = resizeNearest(sourceImage, width, height)

  const localQuad: Point[] = quad.map(([x, y]) => [x - minX, y - minY]) as Point[]
  const sourcePoints: readonly Point[] = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ]

  const projection = buildHomography(sourcePoints, localQuad)
  if (!projection) {
    return blankImage(targetSize[0], targetSize[1])
  }

  const inverseProjection = invert3x3(projection)
  if (!inverseProjection) {
    return blankImage(targetSize[0], targetSize[1])
  }

  const projected = blankImage(width, height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourcePoint = projectPoint(inverseProjection, x, y)
      if (!sourcePoint) {
        continue
      }
      const sampleX = Math.round(sourcePoint[0])
      const sampleY = Math.round(sourcePoint[1])
      if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) {
        continue
      }

      const srcOffset = (sampleY * width + sampleX) * 4
      const dstOffset = (y * width + x) * 4
      projected.data[dstOffset + 0] = minImage.data[srcOffset + 0]
      projected.data[dstOffset + 1] = minImage.data[srcOffset + 1]
      projected.data[dstOffset + 2] = minImage.data[srcOffset + 2]
      projected.data[dstOffset + 3] = minImage.data[srcOffset + 3]
    }
  }

  const target = blankImage(targetSize[0], targetSize[1])
  overlayImage(target, projected, minX, minY)
  return target
}

function renderV3(cover: RgbaImage, assets: V3Assets): RgbaImage {
  const base = cloneImage(assets.base)
  const sideJackets = blankImage(base.width, base.height)

  overlayImage(sideJackets, morph(cover, MORPH_LEFT_NORMAL, [base.width, base.height]), 0, 0)
  overlayImage(sideJackets, morph(cover, MORPH_RIGHT_NORMAL, [base.width, base.height]), 0, 0)
  overlayImage(sideJackets, morph(cover, MORPH_LEFT_MIRROR, [base.width, base.height]), 0, 0)
  overlayImage(sideJackets, morph(cover, MORPH_RIGHT_MIRROR, [base.width, base.height]), 0, 0)
  overlayImage(sideJackets, assets.sideCover, 0, 0)

  const center = blankImage(base.width, base.height)
  overlayImage(center, morph(cover, MORPH_CENTER_NORMAL, [base.width, base.height]), 0, 0)
  overlayImage(center, morph(cover, MORPH_CENTER_MIRROR, [base.width, base.height]), 0, 0)
  overlayImage(center, assets.centerCover, 0, 0)

  const maskedSide = applyAlphaMask(sideJackets, assets.sideMask)
  const maskedCenter = applyAlphaMask(center, assets.centerMask)

  overlayImage(base, maskedSide, 0, 0)
  overlayImage(base, assets.sideCover, 0, 0)
  overlayImage(base, assets.windows, 0, 0)
  overlayImage(base, maskedCenter, 0, 0)
  overlayImage(base, assets.bottom, 0, 0)

  return base
}

function renderToSquareBackground(rendered: RgbaImage, size: number): RgbaImage {
  const sourceCanvas = imageToCanvas(rendered)
  const targetCanvas = createCanvas(size, size)
  const context = targetCanvas.getContext('2d')
  if (!context) {
    throw new Error('Failed to get canvas context.')
  }

  const centerX = (size - sourceCanvas.width) / 2
  const centerY = (size - sourceCanvas.height) / 2

  const pattern = context.createPattern(sourceCanvas, 'repeat')
  if (pattern) {
    if ('setTransform' in pattern) {
      pattern.setTransform(new DOMMatrix().translate(centerX, centerY))
    }
    context.fillStyle = pattern
    context.fillRect(0, 0, size, size)
  }

  context.drawImage(sourceCanvas, centerX, centerY, sourceCanvas.width, sourceCanvas.height)

  const output = context.getImageData(0, 0, size, size)
  return {
    width: size,
    height: size,
    data: new Uint8ClampedArray(output.data),
  }
}

async function rgbaToObjectUrl(image: RgbaImage) {
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Failed to get canvas context.')
  }
  const outputData = new Uint8ClampedArray(image.data.length)
  outputData.set(image.data)
  const output = new ImageData(outputData, image.width, image.height)
  context.putImageData(output, 0, 0)

  return new Promise<string>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to encode image.'))
        return
      }
      resolve(URL.createObjectURL(blob))
    }, 'image/png')
  })
}

export async function generateOverlayV3BackgroundObjectUrl(coverUrl: string) {
  const [cover, assets] = await Promise.all([loadImageData(coverUrl), getV3Assets()])
  const rendered = renderV3(cover, assets)
  const square = renderToSquareBackground(rendered, assets.base.width)
  return rgbaToObjectUrl(square)
}
