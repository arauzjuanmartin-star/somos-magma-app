/**
 * Filas del tablero de Edición cuyo proyecto ya no existe en PROYECTOS.
 *
 * Por qué pasa: cuando un presupuesto se elimina o se represupuesta, la app borra
 * la fila de PROYECTOS y el evento del Calendar, pero nunca tocó EDICION. La tarea
 * queda colgada para siempre y encima no se puede borrar desde la app (el botón de
 * borrar solo funciona con las tareas cargadas a mano).
 *
 * Solo propone borrar lo que NO tiene trabajo encima: sin material, sin notas y sin
 * link. Si una huérfana tiene algo cargado, se lista pero no se toca — eso lo mira
 * una persona.
 *
 * Uso:  node scripts/edicion-huerfanas.mjs             (preview)
 *       node scripts/edicion-huerfanas.mjs --escribir  (borra las vacías)
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')

const R = await sheets.spreadsheets.values.batchGet({ spreadsheetId: ID, ranges: ['PROYECTOS!A:ET', 'EDICION!A:AM'] })
const [PRO, ED] = R.data.valueRanges.map(v => v.values || [])
const hP = PRO[0], hE = ED[0]
const t = (r, h, k) => String(r[h.indexOf(k)] ?? '').trim()
const vivos = new Set(PRO.slice(1).map(r => t(r, hP, 'N° presupuesto')).filter(Boolean))

const vacias = [], conTrabajo = []
ED.slice(1).forEach((r, i) => {
  const num = t(r, hE, 'N° presupuesto')
  if (!num || vivos.has(num)) return
  const info = {
    fila: i + 2, id: t(r, hE, 'ID'), num,
    quien: t(r, hE, 'Cliente') || t(r, hE, 'Agencia'),
    que: t(r, hE, 'Entregable'), estado: t(r, hE, 'Estado'),
    editor: t(r, hE, 'Editor'), notas: t(r, hE, 'Notas'),
    links: ['Link crudo', 'Link pre-entrega', 'Link entrega'].map(k => t(r, hE, k)).filter(Boolean).length,
  }
  const tieneTrabajo = info.notas || info.links || !['Sin material', ''].includes(info.estado)
  ;(tieneTrabajo ? conTrabajo : vacias).push(info)
})

console.log(`\nEDICION: ${ED.length - 1} filas · huérfanas: ${vacias.length + conTrabajo.length}`)
if (conTrabajo.length) {
  console.log(`\nCON TRABAJO ENCIMA — NO se tocan, miralas vos (${conTrabajo.length}):`)
  conTrabajo.forEach(x => console.log(`   fila ${x.fila}  ${x.id.padEnd(9)} ${x.quien.padEnd(16)} ${x.que.slice(0, 20).padEnd(22)} ${x.estado.padEnd(14)} notas:${x.notas ? 'sí' : 'no'} links:${x.links}`))
}
console.log(`\nA BORRAR — sin material, sin notas y sin links (${vacias.length}):`)
vacias.forEach(x => console.log(`   fila ${x.fila}  ${x.id.padEnd(9)} ${x.quien.padEnd(16)} ${x.que.slice(0, 20).padEnd(22)} ${x.estado.padEnd(14)} editor: ${x.editor || '(sin)'}`))

if (!ESCRIBIR) { console.log('\n(preview — corré con --escribir para borrarlas)\n'); process.exit(0) }
if (!vacias.length) { console.log('\nNada para borrar.\n'); process.exit(0) }

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, fields: 'sheets(properties(title,sheetId))' })
const sid = meta.data.sheets.find(x => x.properties.title === 'EDICION')?.properties.sheetId
// De abajo hacia arriba: borrar de arriba corre las filas y el resto de los índices miente.
const requests = vacias.map(x => x.fila).sort((a, b) => b - a)
  .map(f => ({ deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: f - 1, endIndex: f } } }))
await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests } })

const V = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'EDICION!A:AM' })).data.values || []
const quedan = V.slice(1).filter(r => { const n = String(r[hE.indexOf('N° presupuesto')] || '').trim(); return n && !vivos.has(n) }).length
console.log(`\n✓ borradas ${vacias.length}. EDICION quedó con ${V.length - 1} filas · huérfanas restantes: ${quedan} (las que tienen trabajo)\n`)
