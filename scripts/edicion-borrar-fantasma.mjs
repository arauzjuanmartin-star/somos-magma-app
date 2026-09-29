// Borra del tablero de Edición filas puntuales, por ID, cuando el sync no las saca solo.
//
// Por qué hace falta: el sync borra las huérfanas solo si no tienen "trabajo encima",
// y cuenta como trabajo la nota que deja la propia app al represupuestar ("Era el
// #2328…") y el link al crudo que copia de PROYECTOS. Entonces una fila que pasó por
// un represupuesto y quedó sin proyecto no se va nunca. Pasó con Nespresso el 29/9/2026:
// #2303 → #2328 → #2340, se volvió a aprobar el #2303 y quedaron 2340-1 y 2340-3.
//
// Se niega si el N° todavía existe en PROYECTOS o si la fila ya salió de "Sin material":
// eso no es un fantasma. Antes de borrar guarda la fila entera en LOG.
//
//   node scripts/edicion-borrar-fantasma.mjs 2340-1 2340-3              → preview
//   node scripts/edicion-borrar-fantasma.mjs 2340-1 2340-3 --escribir   → borra

import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const ids = process.argv.slice(2).filter(a => !a.startsWith('--'))
if (!ids.length) { console.log('Uso: node scripts/edicion-borrar-fantasma.mjs <ID> [más IDs] [--escribir]'); process.exit(1) }

const R = await sheets.spreadsheets.values.batchGet({ spreadsheetId: ID, ranges: ['PROYECTOS!A:ET', 'EDICION!A:AZ'] })
const [PRO, ED] = R.data.valueRanges.map(v => v.values || [])
const hP = PRO[0], hE = ED[0]
const t = (r, h, k) => String(r[h.indexOf(k)] ?? '').trim()
const vivos = new Set(PRO.slice(1).map(r => t(r, hP, 'N° presupuesto')).filter(Boolean))

const borrar = []
console.log(`\nEDICION: ${ED.length - 1} filas`)
for (const id of ids) {
  const i = ED.findIndex((r, n) => n > 0 && String(r[0] || '').trim() === id)
  if (i < 0) { console.log(`\n  ${id}: no está en EDICION`); continue }
  const r = ED[i], num = t(r, hE, 'N° presupuesto'), estado = t(r, hE, 'Estado')
  console.log(`\n  ${id}  fila ${i + 1}  ${t(r, hE, 'Cliente')} · ${t(r, hE, 'Proyecto')} · ${t(r, hE, 'Entregable')} · ${estado || '(sin estado)'}`)
  hE.forEach((c, j) => { if (String(r[j] ?? '').trim() && !['ID', 'Cliente', 'Proyecto', 'Entregable', 'Estado'].includes(c)) console.log(`      ${c}: ${String(r[j]).replace(/\n/g, ' ⏎ ').slice(0, 150)}`) })
  if (vivos.has(num)) { console.log(`    ✗ NO se borra: el #${num} existe en PROYECTOS, no es un fantasma`); continue }
  if (!['Sin material', ''].includes(estado)) { console.log(`    ✗ NO se borra: está en "${estado}", alguien trabajó sobre esta fila`); continue }
  console.log(`    → se borra (el #${num} no existe en PROYECTOS)`)
  borrar.push({ id, fila: i + 1, contenido: Object.fromEntries(hE.map((c, j) => [c, r[j]]).filter(([, v]) => String(v ?? '').trim())) })
}
if (!borrar.length) { console.log('\nNada para borrar.'); process.exit(0) }
if (!ESCRIBIR) { console.log(`\n(preview — ${borrar.length} para borrar. Con --escribir las borra.)`); process.exit(0) }

// La fila entera va al LOG antes de borrar: si hiciera falta, se rearma desde ahí.
await sheets.spreadsheets.values.append({
  spreadsheetId: ID, range: 'LOG!A:F', valueInputOption: 'RAW',
  requestBody: { values: borrar.map(b => [new Date().toISOString(), 'script', 'edicion-borrar-fantasma', 'EDICION', b.id, `fila fantasma borrada: ${JSON.stringify(b.contenido)}`]) },
})
const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, fields: 'sheets(properties(title,sheetId))' })
const sid = meta.data.sheets.find(x => x.properties.title === 'EDICION')?.properties.sheetId
// De abajo hacia arriba: borrar de arriba corre las filas y el resto de los índices miente.
const requests = borrar.map(b => b.fila).sort((a, b) => b - a)
  .map(f => ({ deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: f - 1, endIndex: f } } }))
await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests } })

const V = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'EDICION!A:AZ' })).data.values || []
const siguen = borrar.filter(b => V.some((r, n) => n > 0 && String(r[0] || '').trim() === b.id))
const sinId = V.slice(1).filter(r => r.some(c => String(c ?? '').trim()) && !String(r[0] || '').trim()).length
console.log(`\n${siguen.length ? '✗ siguen estando: ' + siguen.map(b => b.id).join(', ') : `✓ borradas ${borrar.length}`} · EDICION quedó con ${V.length - 1} filas (antes ${ED.length - 1})${sinId ? ` · OJO: ${sinId} filas con datos y sin ID` : ''}`)
