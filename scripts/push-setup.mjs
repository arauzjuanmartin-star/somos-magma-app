/**
 * Solapa "PUSH": un celular por fila. Cuando un freelancer toca "Activar avisos en este celular" en Mi Magma, el
 * navegador nos da una dirección única de ese celular y se guarda acá (ver lib/push.js). Con eso le llegan los avisos
 * (lo sumaron a un trabajo, se entregó lo que filmó) aunque la app esté cerrada.
 *
 * Es una solapa nueva y aparte: no toca ninguna columna de las que ya existen. Si ya existe, no hace nada.
 *
 * Uso:  node scripts/push-setup.mjs            (preview)
 *       node scripts/push-setup.mjs --escribir
 */
import { readFileSync } from 'fs'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const i = l.indexOf('='); if (i < 0) continue; let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); process.env[l.slice(0, i).trim()] = v }
process.removeAllListeners('warning')
const { getSheets } = await import('../lib/sheets.js')
const { HOJA_PUSH, HEADERS_PUSH, ESTADO_PUSH } = await import('../lib/push.js')

const ESCRIBIR = process.argv.includes('--escribir')
const FILAS = 1000
const COLS = [
  ['ID',            95, 'identifica el celular. No tocar'],
  ['Persona',      180, 'de quién es'],
  ['Mail',         220, 'con qué mail entró'],
  ['Creado el',    125, 'cuándo activó los avisos'],
  ['Navegador',    220, 'Android / iPhone, Chrome / Safari'],
  ['Endpoint',     320, 'la dirección única del celular (la da Google o Apple). No tocar'],
  ['Claves',       260, 'las claves de cifrado de esa dirección. No tocar'],
  ['Estado',       100, `${ESTADO_PUSH.activa} · ${ESTADO_PUSH.baja} (queda en Baja sola si el celular dejó de aceptar avisos)`],
  ['Último envío', 125, ''],
  ['Último error', 260, 'si un aviso no llegó, por qué'],
]
const HEADERS = COLS.map(c => c[0])
if (HEADERS.join('|') !== HEADERS_PUSH.join('|')) { console.error('Las columnas de este script no coinciden con las de lib/push.js. No hago nada.'); process.exit(1) }
const L = i => String.fromCharCode(65 + i), col = n => HEADERS.indexOf(n)

const { sheets, SHEET_ID } = await getSheets()
const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties(title,sheetId))' })
console.log(`\nSOLAPA "${HOJA_PUSH}" — ${ESCRIBIR ? 'ESCRIBIENDO' : 'PREVIEW (nada se toca)'}`)
if (meta.data.sheets.some(s => s.properties.title === HOJA_PUSH)) { console.log('\nLa solapa ya existe. No hago nada.\n'); process.exit(0) }
console.log(`\nLa solapa NO existe. Se crea vacía, con ${COLS.length} columnas:\n`)
COLS.forEach((c, i) => console.log(`  ${L(i)}  ${c[0].padEnd(14)} ${c[2]}`))
console.log('\nFormato: título negro con letra blanca, fila 1 congelada, filtro, "Baja" en gris. No toca ninguna otra solapa.')
if (!ESCRIBIR) { console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---\n'); process.exit(0) }

const add = await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: HOJA_PUSH, gridProperties: { rowCount: FILAS, columnCount: COLS.length, frozenRowCount: 1 } } } }] } })
const sid = add.data.replies[0].addSheet.properties.sheetId
await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${HOJA_PUSH}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values: [HEADERS] } })
const cuerpo = c => ({ sheetId: sid, startRowIndex: 1, endRowIndex: FILAS, startColumnIndex: c, endColumnIndex: c + 1 })
const todo = { sheetId: sid, startRowIndex: 1, endRowIndex: FILAS, startColumnIndex: 0, endColumnIndex: COLS.length }
const color = (r, g, b) => ({ red: r, green: g, blue: b })
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [
  { repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: color(.035, .035, .035), textFormat: { bold: true, foregroundColor: color(1, 1, 1) }, verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)' } },
  ...COLS.map((c, i) => ({ updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: c[1] }, fields: 'pixelSize' } })),
  ...['ID', 'Creado el', 'Endpoint', 'Claves', 'Último envío', 'Último error'].map(n => ({ repeatCell: { range: cuerpo(col(n)), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, wrapStrategy: 'CLIP' } }, fields: 'userEnteredFormat(numberFormat,wrapStrategy)' } })),
  { addConditionalFormatRule: { index: 0, rule: { ranges: [todo], booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=$${L(col('Estado'))}2="${ESTADO_PUSH.baja}"` }] }, format: { backgroundColor: color(.95, .95, .95), textFormat: { foregroundColor: color(.6, .6, .6) } } } } } },
  { setBasicFilter: { filter: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: FILAS, startColumnIndex: 0, endColumnIndex: COLS.length } } } },
] } })
const v = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${HOJA_PUSH}!1:1` })).data.values?.[0] || []
console.log(`\n✓ Solapa ${HOJA_PUSH} creada. Títulos: ${v.length} de ${COLS.length}${v.join('|') === HEADERS.join('|') ? ', en orden' : ' ⚠ NO coinciden'}.\n`)
