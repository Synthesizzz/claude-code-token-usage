// Turns the trees the band really draws (printed by a test) into a page that
// lays them out with the same flex rules at each width, so a row that wraps
// or spills shows up without the desktop app.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const [, , dump, out, cellArg, fontArg] = process.argv
const CELL = Number(cellArg ?? 9.3)
const FONT = Number(fontArg ?? 14.5)
const trees = readFileSync(dump, 'utf8')
  .split(/\r?\n/)
  .filter(line => line.startsWith('TREE '))
  .map(line => JSON.parse(line.slice(5)))
  .filter(tree => !process.env.SCENE || process.env.SCENE.split(',').includes(tree.scene))
  .filter(tree => !process.env.COLUMNS || process.env.COLUMNS.split(',').includes(String(tree.columns)))

const esc = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch])
const cells = n => `${(n * CELL).toFixed(1)}px`

const pictures = new Map()
const html = node => {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return esc(node)
  if (Array.isArray(node)) return node.map(html).join('')

  const { type, props = {}, children = [] } = node

  if (type === 'Svg') {
    // One rule per distinct picture: a sweep repeats the same few hundreds of times.
    if (!pictures.has(props.source)) pictures.set(props.source, `p${pictures.size}`)
    return `<i class="img ${pictures.get(props.source)}" role="img" aria-label="${esc(props.alt)}" style="width:${props.width}px;height:${props.height}px"></i>`
  }
  if (type === 'Text') {
    const classes = [props.bold ? 'b' : '', props.dimColor ? 'd' : '', props.color === 'warning' ? 'w' : ''].join(' ')
    return `<span class="t ${classes}">${html(children)}</span>`
  }

  const style = [
    'display:flex',
    `flex-direction:${props.flexDirection ?? 'row'}`,
    props.gap !== undefined ? `gap:${cells(props.gap)}` : '',
    props.columnGap !== undefined ? `column-gap:${cells(props.columnGap)}` : '',
    props.rowGap !== undefined ? `row-gap:${cells(props.rowGap)}` : '',
    props.alignItems ? `align-items:${props.alignItems}` : '',
    props.flexWrap ? `flex-wrap:${props.flexWrap}` : '',
    // The squeeze seen in the app: a group may shrink below what it holds.
    `flex-shrink:${props.flexShrink ?? 1}`,
    'min-width:0',
    props.minWidth !== undefined ? `min-width:${cells(props.minWidth)}` : '',
    props.paddingX !== undefined ? `padding-inline:${cells(props.paddingX)}` : '',
    props.borderStyle ? 'border:1px solid var(--edge);border-radius:8px;padding-block:3px' : '',
  ]
    .filter(Boolean)
    .join(';')

  return `<div style="${style}">${html(children)}</div>`
}

const groups = new Map()
for (const tree of trees) {
  const key = `${tree.scene} / ${tree.layout}`
  groups.set(key, [...(groups.get(key) ?? []), tree])
}

const sections = [...groups]
  .map(
    ([key, list]) =>
      `<h2>${key}</h2>${list
        .map(
          tree =>
            `<div class="case"><span class="cols">${tree.columns}</span><div class="band" data-key="${key}" data-columns="${tree.columns}" style="width:${cells(tree.columns)}">${html(tree.root.children[0])}</div><span class="flag"></span></div>`,
        )
        .join('')}`,
  )
  .join('')

// preview/ is kept out of the repository, so a fresh clone has none yet.
mkdirSync(dirname(out), { recursive: true })
writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><title>Responsive check</title><style>
:root{--page:#17181a;--row:#232528;--text:#e8e9ec;--dim:#8b919c;--edge:#3a3f48;--amber:#e6b422}
body.light{--page:#ecebe6;--row:#faf9f5;--text:#1f1e1d;--dim:#5f636c;--edge:#cfcdc4;--amber:#7d5b00}
body{margin:0;padding:14px 18px 40px;background:var(--page);color:var(--text);font:${FONT}px/1.3 "Segoe UI","Leelawadee UI",system-ui,sans-serif}
h1{font-size:16px;margin:0 0 4px}h2{font-size:13px;font-weight:600;margin:18px 0 6px;color:var(--dim)}
#summary{font-size:13px;color:var(--dim);margin-bottom:8px;white-space:pre-wrap}
.case{display:flex;align-items:center;gap:10px;margin-bottom:5px}
.cols{width:28px;text-align:right;font-size:12px;color:var(--dim);flex:none}
.band{background:var(--row);border-radius:8px;outline:1px dashed var(--edge);flex:none;box-sizing:content-box}
.flag{font-size:12px;color:#ff6b80}
.t.b{font-weight:600}.t.d{color:var(--dim)}.t.w{color:var(--amber)}
i.img{display:block;flex:none;background-size:100% 100%}
${[...pictures].map(([source, name]) => `.${name}{background-image:url("data:image/svg+xml;utf8,${encodeURIComponent(source)}")}`).join(' ')}
</style><h1>Responsive check: cell ${CELL}px, text ${FONT}px</h1><div id="summary"></div>${sections}
<script>
const problems = []
for (const band of document.querySelectorAll('.band')) {
  const row = band.firstElementChild
  const kids = [...row.children]
  const tops = new Set(kids.map(kid => Math.round(kid.getBoundingClientRect().top + kid.getBoundingClientRect().height / 2)))
  const lines = (() => { const ys = kids.map(kid => kid.getBoundingClientRect()); let count = 0, bottom = -1; for (const r of ys.sort((a, b) => a.top - b.top)) { if (r.top >= bottom - 1) { count += 1; bottom = r.bottom } else bottom = Math.max(bottom, r.bottom) } return count })()
  const spills = band.scrollWidth > band.clientWidth + 1
  const squeezed = kids.some(kid => kid.scrollWidth > kid.clientWidth + 1)
  const issues = [lines > 1 ? 'wraps to ' + lines + ' lines' : '', spills ? 'spills' : '', squeezed ? 'squeezed' : ''].filter(Boolean)
  if (issues.length) { band.nextElementSibling.textContent = issues.join(', '); problems.push(band.dataset.key + ' @' + band.dataset.columns + ': ' + issues.join(', ')) }
  band.dataset.used = Math.round(row.scrollWidth) + '/' + band.clientWidth
}
document.getElementById('summary').textContent = document.querySelectorAll('.band').length + ' bands, ' + problems.length + ' with a problem' + (problems.length ? '\\n' + problems.join('\\n') : '')
window.problems = problems
</script>`,
)
console.log(out, trees.length)
