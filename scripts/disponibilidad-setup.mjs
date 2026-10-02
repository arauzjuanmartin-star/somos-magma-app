/**
 * Solapa "DISPONIBILIDAD": lo que cada freelancer contesta desde Mi Magma sobre sus fechas (ver lib/disponibilidad.mjs).
 *   · "Confirmó" / "No puede" a un trabajo que tiene cargado
 *   · "Día no disponible": un día suelto en el que avisa que no cuenten con él
 * El cargador de staff lo muestra al lado de cada persona, y un "No puede" le llega por mail al PM.
 *
 * Es una solapa nueva y aparte: no toca ninguna columna de las que ya existen. Si la solapa ya existe, no hace nada.
 *
 * Uso:  node scripts/disponibilidad-setup.mjs            (preview)
 *       node scripts/disponibilidad-setup.mjs --escribir
 */
import { readFileSync } from 'fs'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const i = l.indexOf('='); if (i < 0) continue; let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); process.env[l.slice(0, i).trim()] = v }
process.removeAllListeners('warning')
const { getSheets } = await import('../lib/sheets.js')
const { HOJA_DISPONIBILIDAD, HEADERS_DISPONIBILIDAD, QUE, ESTADO } = await import('../lib/disponibilidad.mjs')

const ESCRIBIR = process.argv.includes('--escribir')
const FILAS = 3000
// [título, ancho, qué va]. El orden es el de lib/disponibilidad.mjs; la app lee y escribe por nombre de título.
const COLS = [
  ['ID',          95, 'identifica la fila. No tocar'],
  ['Cargado el', 125, 'cuándo lo avisó'],
  ['Persona',    180, 'quién avisa'],
  ['Fecha',      105, 'el día del que habla (el del trabajo, o el día que no puede)'],
  ['Día',         95, 'lunes, martes… para leerlo de un vistazo'],
  ['Qué',        150, `${QUE.confirmo} · ${QUE.nopuedo} · ${QUE.dia}`],
  ['N° trabajo',  85, 'el N° de presupuesto (vacío si es un día suelto)'],
  ['Trabajo',    260, 'cliente y proyecto'],
  ['Servicio',   120, 'la línea de esa persona en el trabajo'],
  ['Motivo',     260, 'lo que escribió la persona'],
  ['Estado',     100, `${ESTADO.vigente} · ${ESTADO.anulado} (se anula sola cuando la persona contesta otra cosa)`],
  ['PM',         110, 'el PM del trabajo'],
  ['Avisado a',  230, 'a quién le llegó el mail'],
]
const HEADERS = COLS.map(c => c[0])
if (HEADERS.join('|') !== HEADERS_DISPONIBILIDAD.join('|')) { console.error('Las columnas de este script no coinciden con las de lib/disponibilidad.mjs. No hago nada.'); process.exit(1) }
const L = i => String.fromCharCode(65 + i), col = n => HEADERS.indexOf(n)

const { sheets, SHEET_ID } = await getSheets()
const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties(title,sheetId))' })
console.log(`\nSOLAPA "${HOJA_DISPONIBILIDAD}" — ${ESCRIBIR ? 'ESCRIBIENDO' : 'PREVIEW (nada se toca)'}`)
if (meta.data.sheets.some(s => s.properties.title === HOJA_DISPONIBILIDAD)) { console.log('\nLa solapa ya existe. No hago nada.\n'); process.exit(0) }
console.log(`\nLa solapa NO existe. Se crea vacía, con ${COLS.length} columnas:\n`)
COLS.forEach((c, i) => console.log(`  ${L(i)}  ${c[0].padEnd(12)} ${c[2]}`))
console.log(`\nFormato: título negro con letra blanca, fila 1 congelada, filtro, desplegable en "Qué" y en "Estado",`)
console.log(`"${QUE.confirmo}" en verde, "${QUE.nopuedo}" en rojo, "${QUE.dia}" en amarillo, y lo "${ESTADO.anulado}" en gris tachado.`)
console.log('No toca ninguna otra solapa.')
if (!ESCRIBIR) { console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---\n'); process.exit(0) }

const add = await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: HOJA_DISPONIBILIDAD, gridProperties: { rowCount: FILAS, columnCount: COLS.length, frozenRowCount: 1 } } } }] } })
const sid = add.data.replies[0].addSheet.properties.sheetId
await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${HOJA_DISPONIBILIDAD}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values: [HEADERS] } })

const cuerpo = c => ({ sheetId: sid, startRowIndex: 1, endRowIndex: FILAS, startColumnIndex: c, endColumnIndex: c + 1 })
const todo = { sheetId: sid, startRowIndex: 1, endRowIndex: FILAS, startColumnIndex: 0, endColumnIndex: COLS.length }
const color = (r, g, b) => ({ red: r, green: g, blue: b })
const Q = L(col('Qué')), E = L(col('Estado'))
const regla = (formula, formato, i) => ({ addConditionalFormatRule: { index: i, rule: { ranges: [todo], booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] }, format: formato } } } })
const lista = (c, valores) => ({ setDataValidation: { range: cuerpo(c), rule: { condition: { type: 'ONE_OF_LIST', values: valores.map(v => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false } } })
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [
  { repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: color(.035, .035, .035), textFormat: { bold: true, foregroundColor: color(1, 1, 1) }, verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)' } },
  ...COLS.map((c, i) => ({ updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: c[1] }, fields: 'pixelSize' } })),
  ...['ID', 'Cargado el', 'Persona', 'N° trabajo', 'Servicio', 'Motivo'].map(n => ({ repeatCell: { range: cuerpo(col(n)), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } }, fields: 'userEnteredFormat.numberFormat' } })),
  { repeatCell: { range: cuerpo(col('Fecha')), cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } },
  ...['Qué', 'Estado'].map(n => ({ repeatCell: { range: cuerpo(col(n)), cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { bold: true } } }, fields: 'userEnteredFormat(horizontalAlignment,textFormat)' } })),
  lista(col('Qué'), Object.values(QUE)),
  lista(col('Estado'), Object.values(ESTADO)),
  // Lo anulado primero: tapa al color de lo que decía.
  regla(`=$${E}2="${ESTADO.anulado}"`, { backgroundColor: color(.95, .95, .95), textFormat: { foregroundColor: color(.6, .6, .6), strikethrough: true } }, 0),
  regla(`=$${Q}2="${QUE.confirmo}"`, { backgroundColor: color(.85, .94, .85) }, 1),
  regla(`=$${Q}2="${QUE.nopuedo}"`, { backgroundColor: color(.96, .80, .80) }, 2),
  regla(`=$${Q}2="${QUE.dia}"`, { backgroundColor: color(1, .95, .76) }, 3),
  { setBasicFilter: { filter: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: FILAS, startColumnIndex: 0, endColumnIndex: COLS.length } } } },
] } })

const v = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${HOJA_DISPONIBILIDAD}!1:1` })).data.values?.[0] || []
console.log(`\n✓ Solapa ${HOJA_DISPONIBILIDAD} creada. Títulos: ${v.length} de ${COLS.length}${v.join('|') === HEADERS.join('|') ? ', en orden' : ' ⚠ NO coinciden'}.\n`)
