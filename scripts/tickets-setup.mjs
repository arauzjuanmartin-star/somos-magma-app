/**
 * Solapa "TICKETS": los gastos que adelantan los chicos en un trabajo (nafta, peaje, un taxi) y cargan desde Mi Magma
 * con la foto del ticket. Administración los aprueba desde Caja → Hoy, y al aprobarlos el monto se suma a los viáticos
 * de ese trabajo en Pagos Staff (ver lib/tickets.mjs).
 *
 * Es una solapa nueva y aparte: no toca ninguna columna de las que ya existen. Si la solapa ya existe, no hace nada.
 *
 * Uso:  node scripts/tickets-setup.mjs            (preview)
 *       node scripts/tickets-setup.mjs --escribir
 */
import { readFileSync } from 'fs'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const i = l.indexOf('='); if (i < 0) continue; let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); process.env[l.slice(0, i).trim()] = v }
process.removeAllListeners('warning')
const { getSheets } = await import('../lib/sheets.js')
const { HOJA_TICKETS, HEADERS_TICKETS } = await import('../lib/tickets.mjs')

const ESCRIBIR = process.argv.includes('--escribir')
const FILAS = 2000
// [título, ancho, qué va]. El orden es el de lib/tickets.mjs; la app lee y escribe por nombre de título.
const COLS = [
  ['ID',                 95, 'identifica el ticket. No tocar'],
  ['Cargado el',        125, 'cuándo lo mandó'],
  ['Persona',           170, 'quién adelantó la plata'],
  ['N° trabajo',         85, 'el N° de presupuesto del trabajo'],
  ['Trabajo',           260, 'cliente y proyecto'],
  ['Servicio',          120, 'la línea de esa persona en el trabajo (es la llave con Pagos Staff)'],
  ['Mes Referencia',    120, 'el mes del trabajo, como en Pagos Staff ("10 - octubre")'],
  ['Fecha del trabajo', 115, ''],
  ['Qué fue',           125, 'Nafta, Peaje, Estacionamiento, Taxi o remís, Comida, Otro'],
  ['Monto',             115, 'lo que hay que devolverle'],
  ['Foto',              230, 'el link a la foto del ticket en Drive'],
  ['Estado',            115, 'Pendiente · Aprobado · Rechazado · Pagado aparte'],
  ['Revisó',            180, 'quién de administración lo miró'],
  ['Revisado el',       105, ''],
  ['Motivo',            240, 'si se rechazó, por qué (lo lee la persona en Mi Magma)'],
  ['Nota',              240, 'lo que aclaró la persona al cargarlo'],
]
const HEADERS = COLS.map(c => c[0])
if (HEADERS.join('|') !== HEADERS_TICKETS.join('|')) { console.error('Las columnas de este script no coinciden con las de lib/tickets.mjs. No hago nada.'); process.exit(1) }
const L = i => String.fromCharCode(65 + i), col = n => HEADERS.indexOf(n)

const { sheets, SHEET_ID } = await getSheets()
const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties(title,sheetId))' })
console.log(`\nSOLAPA "${HOJA_TICKETS}" — ${ESCRIBIR ? 'ESCRIBIENDO' : 'PREVIEW (nada se toca)'}`)
if (meta.data.sheets.some(s => s.properties.title === HOJA_TICKETS)) { console.log('\nLa solapa ya existe. No hago nada.\n'); process.exit(0) }
console.log(`\nLa solapa NO existe. Se crea vacía, con ${COLS.length} columnas:\n`)
COLS.forEach((c, i) => console.log(`  ${L(i)}  ${c[0].padEnd(18)} ${c[2]}`))
console.log('\nFormato: título negro con letra blanca, fila 1 congelada, filtro, monto en pesos,')
console.log('"Pendiente" en amarillo, "Aprobado" y "Pagado aparte" en verde, "Rechazado" en rojo.')
console.log('No toca ninguna otra solapa.')
if (!ESCRIBIR) { console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---\n'); process.exit(0) }

const add = await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: HOJA_TICKETS, gridProperties: { rowCount: FILAS, columnCount: COLS.length, frozenRowCount: 1 } } } }] } })
const sid = add.data.replies[0].addSheet.properties.sheetId
await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${HOJA_TICKETS}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values: [HEADERS] } })

const cuerpo = c => ({ sheetId: sid, startRowIndex: 1, endRowIndex: FILAS, startColumnIndex: c, endColumnIndex: c + 1 })
const todo = { sheetId: sid, startRowIndex: 1, endRowIndex: FILAS, startColumnIndex: 0, endColumnIndex: COLS.length }
const color = (r, g, b) => ({ red: r, green: g, blue: b })
const E = L(col('Estado'))
const regla = (formula, fondo, i) => ({ addConditionalFormatRule: { index: i, rule: { ranges: [todo], booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] }, format: { backgroundColor: fondo } } } } })
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [
  { repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: color(.035, .035, .035), textFormat: { bold: true, foregroundColor: color(1, 1, 1) }, verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)' } },
  ...COLS.map((c, i) => ({ updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: c[1] }, fields: 'pixelSize' } })),
  { repeatCell: { range: cuerpo(col('Monto')), cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } },
  ...['ID', 'Cargado el', 'N° trabajo', 'Servicio', 'Mes Referencia', 'Persona'].map(n => ({ repeatCell: { range: cuerpo(col(n)), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } }, fields: 'userEnteredFormat.numberFormat' } })),
  ...['Fecha del trabajo', 'Revisado el'].map(n => ({ repeatCell: { range: cuerpo(col(n)), cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } })),
  { repeatCell: { range: cuerpo(col('Estado')), cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { bold: true } } }, fields: 'userEnteredFormat(horizontalAlignment,textFormat)' } },
  regla(`=$${E}2="Pendiente"`, color(1, .95, .76), 0),
  regla(`=OR($${E}2="Aprobado",$${E}2="Pagado aparte")`, color(.85, .94, .85), 1),
  regla(`=$${E}2="Rechazado"`, color(.96, .80, .80), 2),
  { setBasicFilter: { filter: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: FILAS, startColumnIndex: 0, endColumnIndex: COLS.length } } } },
] } })

const v = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${HOJA_TICKETS}!1:1` })).data.values?.[0] || []
console.log(`\n✓ Solapa ${HOJA_TICKETS} creada. Títulos: ${v.length} de ${COLS.length}${v.join('|') === HEADERS.join('|') ? ', en orden' : ' ⚠ NO coinciden'}.\n`)
