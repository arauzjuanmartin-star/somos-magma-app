/**
 * Agrega a la solapa "listado" la columna J "Descripción PDF", al lado del nombre (H)
 * y el precio (I) de cada servicio: cómo se llama ese servicio cuando lo ve el cliente.
 *
 * Por qué: el PDF del presupuesto reemplaza "🎬 Film ½" por "Media jornada filmmaker
 * (hasta 4 horas)". Hasta el 24/09/2026 ese mapeo vivía solo en el código
 * (lib/servicios-pdf.js) y cambiar un texto era pedirlo y esperar un deploy. Con la
 * columna, Juan y Sofi lo editan en el sheet y la app lo lee en cada carga; lo que
 * quede vacío sigue usando el texto del código, y lo que no esté en ninguno de los dos
 * sale en el PDF tal cual está escrito en el presupuesto.
 *
 * Siembra la columna con los textos del código. NUNCA pisa una celda de J que ya tenga
 * algo. Sin --escribir solo muestra la tabla: sirve también como "listado de lo que se
 * autocompleta" para revisar.
 *
 * Uso:  node scripts/listado-columna-descripcion-pdf.mjs             (preview / listado)
 *       node scripts/listado-columna-descripcion-pdf.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { SVC_LABELS, claveSvc, stripSvc } from '../lib/servicios-pdf.js'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const COL_NOMBRE = 7, COL_PRECIO = 8, COL_DESC = 9      // H, I, J
const HEADER = 'Descripción PDF'

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, fields: 'sheets(properties(title,sheetId,gridProperties))' })
const hoja = meta.data.sheets.find(x => x.properties.title === 'listado')
const sid = hoja.properties.sheetId
const R = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'listado!A:L' })
const filas = R.data.values || []

// La tabla de servicios arranca en la fila cuyo H dice "Servicio" (hoy la 3: la solapa
// no tiene una fila de headers única, cada tabla tiene la suya).
const iHeader = filas.findIndex(r => String(r[COL_NOMBRE] || '').trim().toLowerCase() === 'servicio')
if (iHeader === -1) { console.error('No encuentro la fila "Servicio" en la columna H de listado. Freno.'); process.exit(1) }
const ocupadas = filas.map((r, i) => [i, r[COL_DESC]]).filter(([i, v]) => v && i !== iHeader)
const labels = Object.fromEntries(Object.entries(SVC_LABELS).map(([k, v]) => [claveSvc(k), v]))

console.log(`\nlistado · servicios en H${iHeader + 2}:H… · header de la tabla en la fila ${iHeader + 1}`)
if (String(filas[iHeader][COL_DESC] || '').trim()) console.log(`J${iHeader + 1} ya dice "${filas[iHeader][COL_DESC]}"${filas[iHeader][COL_DESC] === HEADER ? ' ✓' : ' ✗ (esperaba "' + HEADER + '")'}`)
if (ocupadas.length) console.log(`⚠ La columna J ya tiene ${ocupadas.length} celda(s) con algo (se respetan, no se pisan): ${ocupadas.slice(0, 5).map(([i, v]) => `J${i + 1}="${String(v).slice(0, 30)}"`).join(' · ')}${ocupadas.length > 5 ? ' …' : ''}`)

const plan = []   // {fila (1-based), nombre, precio, actual, nuevo, origen}
for (let i = iHeader + 1; i < filas.length; i++) {
  const r = filas[i]
  const nombre = String(r[COL_NOMBRE] || '').trim()
  if (!nombre) continue
  const actual = String(r[COL_DESC] || '').trim()
  const delCodigo = labels[claveSvc(nombre)] || ''
  plan.push({ fila: i + 1, nombre, precio: String(r[COL_PRECIO] || '').trim(), actual, nuevo: actual || delCodigo, origen: actual ? 'sheet' : delCodigo ? 'código' : '—' })
}

const ancho = Math.max(...plan.map(p => stripSvc(p.nombre).length), 8)
console.log(`\n${'Servicio (col H)'.padEnd(ancho + 2)} ${'Precio'.padStart(11)}   En el PDF aparece (col J)`)
console.log('-'.repeat(ancho + 2 + 12 + 3 + 60))
for (const p of plan) {
  const txt = p.nuevo || `(sin descripción → sale "${stripSvc(p.nombre)}")`
  console.log(`${stripSvc(p.nombre).padEnd(ancho + 2)} ${p.precio.padStart(11)}   ${txt}${p.origen === 'sheet' ? '   [ya en el sheet]' : ''}`)
}
const sinDesc = plan.filter(p => !p.nuevo)
const aEscribir = plan.filter(p => !p.actual && p.nuevo)
// Textos del código que no tienen fila en el listado (nombres tipeados a mano en presus viejos)
const enListado = new Set(plan.map(p => claveSvc(p.nombre)))
const huerfanos = Object.entries(SVC_LABELS).filter(([k]) => !enListado.has(claveSvc(k)))
console.log(`\n${plan.length} servicios en el listado · ${aEscribir.length} a sembrar en J desde el código · ${sinDesc.length} sin descripción (salen tal cual): ${sinDesc.map(p => stripSvc(p.nombre)).join(', ') || '—'}`)
if (huerfanos.length) console.log(`${huerfanos.length} textos del código sin fila en el listado (siguen valiendo si alguien los tipea): ${[...new Set(huerfanos.map(([k]) => k))].join(', ')}`)
if (!ESCRIBIR) { console.log('\n(preview — corré con --escribir para escribir el header en J' + (iHeader + 1) + ' y las ' + aEscribir.length + ' descripciones)\n'); process.exit(0) }

const data = []
if (String(filas[iHeader][COL_DESC] || '').trim() !== HEADER) data.push({ range: `listado!J${iHeader + 1}`, values: [[HEADER]] })
for (const p of aEscribir) data.push({ range: `listado!J${p.fila}`, values: [[p.nuevo]] })
if (data.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: ID, requestBody: { valueInputOption: 'RAW', data } })
await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests: [
  { updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: COL_DESC, endIndex: COL_DESC + 1 }, properties: { pixelSize: 420 }, fields: 'pixelSize' } },
  { repeatCell: { range: { sheetId: sid, startRowIndex: iHeader, endRowIndex: iHeader + 1, startColumnIndex: COL_DESC, endColumnIndex: COL_DESC + 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } },
] } })

const V = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: `listado!H${iHeader + 1}:J${filas.length}` })).data.values || []
const mal = plan.filter(p => String(V[p.fila - iHeader - 1]?.[2] || '').trim() !== p.nuevo)
console.log(mal.length === 0 ? `\n✓ ${data.length} celdas escritas en J y verificadas: cada descripción quedó en la fila de su servicio\n`
                             : `\n✗ ${mal.length} filas no coinciden: ${mal.map(p => 'J' + p.fila).join(', ')}\n`)
