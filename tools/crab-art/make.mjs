// Makes the pictures a Windows notification shows: the crab in each pose as a
// PNG, 144 pixels square, its background clear. Windows takes no SVG, so the
// mod's own drawings are filled in block by block, at rest.
//
//   node tools/crab-art/make.mjs
//
// Run it again after a pose changes in hooks/crab.ts; it writes assets/crab/.
import { registerHooks } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch {
      return next(`${specifier}.ts`, context)
    }
  },
})

// The mod's folder: two up from here, unless TOKEN_USAGE_ROOT names another.
const root = process.env.TOKEN_USAGE_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const out = process.argv[2] ?? join(root, 'assets', 'crab')
const { crabSvg } = await import(pathToFileURL(join(root, 'hooks', 'crab.ts')).href)
const POSES = ['done', 'ask', 'allow', 'sleep', 'half', 'near', 'jail', 'pace', 'back', 'context']
const SIZE = 144
const ROOM = 136

// An affine matrix [a b c d e f]: x' = a x + c y + e, y' = b x + d y + f.
const times = ([a, b, c, d, e, f], [g, h, i, j, k, l]) => [
  a * g + c * h,
  b * g + d * h,
  a * i + c * j,
  b * i + d * j,
  a * k + c * l + e,
  b * k + d * l + f,
]
const parse = transform => {
  let matrix = [1, 0, 0, 1, 0, 0]

  for (const [, name, values] of transform.matchAll(/(\w+)\(([^)]*)\)/g)) {
    const [p = 0, q] = values.split(/[\s,]+/).map(Number)
    const step = {
      translate: [1, 0, 0, 1, p, q ?? 0],
      scale: [p, 0, 0, q ?? p, 0, 0],
      skewX: [1, 0, Math.tan((p * Math.PI) / 180), 1, 0, 0],
    }[name]

    if (step === undefined) {
      throw new Error(`no ${name} in a picture`)
    }

    matrix = times(matrix, step)
  }

  return matrix
}
const invert = ([a, b, c, d, e, f]) => {
  const det = a * d - b * c

  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}
const apply = ([a, b, c, d, e, f], x, y) => [a * x + c * y + e, b * x + d * y + f]
const colour = hex => {
  const long = hex.length === 4 ? `#${[...hex.slice(1)].map(digit => digit + digit).join('')}` : hex

  return [1, 3, 5].map(at => Number.parseInt(long.slice(at, at + 2), 16))
}

// The blocks of a drawing, each with the inverse of where it was put.
const blocks = source => {
  const stack = [[1, 0, 0, 1, 0, 0]]
  const found = []

  for (const [tag, group, rect] of source.matchAll(/<g([^>]*)>|<\/g>|<rect ([^>]*)\/>/g)) {
    if (tag === '</g>') {
      stack.pop()
    } else if (group !== undefined) {
      const transform = /transform="([^"]+)"/.exec(group)

      stack.push(transform === null ? stack.at(-1) : times(stack.at(-1), parse(transform[1])))
    } else {
      const field = name => new RegExp(`(?:^|\\s)${name}="([^"]+)"`).exec(rect)?.[1]

      if (field('opacity') === '0') {
        continue
      }

      found.push({
        x: Number(field('x') ?? 0),
        y: Number(field('y') ?? 0),
        wide: Number(field('width')),
        tall: Number(field('height')),
        fill: colour(field('fill')),
        inverse: invert(stack.at(-1)),
      })
    }
  }

  return found
}

const png = (pixels, side) => {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    const sum = Buffer.alloc(4)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])

    length.writeUInt32BE(data.length)
    sum.writeUInt32BE(crc32(body))

    return Buffer.concat([length, body, sum])
  }
  const head = Buffer.alloc(13)
  const rows = Buffer.alloc((side * 4 + 1) * side)

  head.writeUInt32BE(side, 0)
  head.writeUInt32BE(side, 4)
  head.set([8, 6, 0, 0, 0], 8)

  for (let y = 0; y < side; y += 1) {
    pixels.copy(rows, y * (side * 4 + 1) + 1, y * side * 4, (y + 1) * side * 4)
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(out, { recursive: true })

for (const pose of POSES) {
  const { source } = crabSvg(pose, pose)
  const [minX, minY, wide, tall] = /viewBox="([^"]+)"/.exec(source)[1].split(' ').map(Number)
  const scale = Math.floor(ROOM / Math.max(wide, tall))
  const left = Math.floor((SIZE - wide * scale) / 2)
  const top = Math.floor((SIZE - tall * scale) / 2)
  const pixels = Buffer.alloc(SIZE * SIZE * 4)
  const found = blocks(source)

  for (let py = 0; py < SIZE; py += 1) {
    for (let px = 0; px < SIZE; px += 1) {
      const ux = (px + 0.5 - left) / scale + minX
      const uy = (py + 0.5 - top) / scale + minY

      // The last block drawn over a pixel is the one seen.
      for (let index = found.length - 1; index >= 0; index -= 1) {
        const { x, y, wide: w, tall: h, fill, inverse } = found[index]
        const [lx, ly] = apply(inverse, ux, uy)

        if (lx >= x && lx < x + w && ly >= y && ly < y + h) {
          pixels.set([...fill, 255], (py * SIZE + px) * 4)
          break
        }
      }
    }
  }

  writeFileSync(join(out, `${pose}.png`), png(pixels, SIZE))
  console.log(`${pose}.png`)
}
