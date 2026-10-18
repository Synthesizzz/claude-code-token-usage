import type { Palette } from '../types'

// The small picture of a palette in the style picker: its three levels as
// bars, calm to full, above its name. A Box spaces by rows, a row too much
// here, so the room between the bars and the name is the picture's own.
const ROOM_BELOW = 6

const picture = (width: number, height: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`

export const chipSvg = (palette: Palette, name: string) => ({
  source: picture(
    42,
    9 + ROOM_BELOW,
    [palette.success, palette.warning, palette.error]
      .map((color, index) => `<rect x="${index * 14}" y="1" width="13" height="8" rx="2" fill="${color}"/>`)
      .join(''),
  ),
  alt: `${name} palette`,
})
