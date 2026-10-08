/**
 * Solapa "SEGUROS".
 *
 * SEGUROS es el registro de los pedidos de seguro de accidentes personales que salen desde la
 * app (botón "Pedir seguro" en la producción de un trabajo): una fila por persona y pedido,
 * con el trabajo, para cuándo se pidió, dónde, qué pidieron para ese lugar, a quién se le mandó
 * y quién lo mandó. Así se ve a quién se aseguró para qué rodaje sin buscar en el mail (Juan,
 * 08/10/2026: "podría tener un historial de los seguros o datos por cliente").
 *
 * Lo que piden para asegurar (cláusula de no repetición, monto, papeles) depende del lugar:
 * va en las columnas Lugar y Requisitos de cada pedido y la app lo precarga la próxima vez en
 * el mismo lugar. No hace falta otra solapa.
 *
 * Es una solapa nueva y aparte: no toca ninguna columna de las que ya existen. Si ya existe,
 * no hace nada.
 *
 * Uso:  node scripts/seguros-setup.mjs            (preview)
 *       node scripts/seguros-setup.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { HOJA_SEGUROS, COLS_SEGUROS, HEADERS_SEGUROS } from '../lib/seguros.js'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, fields: 'sheets(properties(title,sheetId))' })
const existe = meta.data.sheets.find(s => s.properties.title === HOJA_SEGUROS)

console.log(`\nSOLAPA "${HOJA_SEGUROS}" — ${ESCRIBIR ? 'ESCRIBIENDO' : 'PREVIEW (nada se toca)'}\n`)
if (existe) { console.log('La solapa ya existe. No hago nada.\n'); process.exit(0) }
console.log(`La solapa NO existe. Se crea vacía, con ${COLS_SEGUROS.length} columnas:\n`)
COLS_SEGUROS.forEach((c, i) => console.log(`  ${colLetra(i).padEnd(3)} ${c[0].padEnd(16)} ${c[2]}`))
console.log('\nFormato: título negro con letra blanca, fila 1 congelada, filtro, fechas como fecha. No toca ninguna otra solapa.')
if (!ESCRIBIR) { console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---\n'); process.exit(0) }

const add = await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests: [
  { addSheet: { properties: { title: HOJA_SEGUROS, gridProperties: { rowCount: 1000, columnCount: COLS_SEGUROS.length, frozenRowCount: 1 } } } } ] } })
const sid = add.data.replies[0].addSheet.properties.sheetId
await sheets.spreadsheets.values.update({ spreadsheetId: ID, range: `${HOJA_SEGUROS}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values: [HEADERS_SEGUROS] } })
const iFechas = ['Fecha pedido', 'Fecha evento', 'Nacimiento'].map(h => HEADERS_SEGUROS.indexOf(h))
await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests: [
  { repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1 },
      cell: { userEnteredFormat: { backgroundColor: { red: .035, green: .035, blue: .035 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 10 }, verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' } },
      fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)' } },
  ...iFechas.map(c => ({ repeatCell: { range: { sheetId: sid, startRowIndex: 1, startColumnIndex: c, endColumnIndex: c + 1 },
      cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'd/m/yyyy' } } }, fields: 'userEnteredFormat.numberFormat' } })),
  ...COLS_SEGUROS.map((c, i) => ({ updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: c[1] }, fields: 'pixelSize' } })),
  { setBasicFilter: { filter: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: COLS_SEGUROS.length } } } },
] } })

// ── verificación ──
const v = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: `${HOJA_SEGUROS}!1:1` })
const H2 = v.data.values?.[0] || []
const ok = HEADERS_SEGUROS.every((h, i) => H2[i] === h)
console.log(ok ? `\n✓ Solapa ${HOJA_SEGUROS} creada con sus ${H2.length} títulos en orden` : `\n✗ Los títulos no quedaron como se esperaba: ${H2.join(' | ')}`)
const m2 = await sheets.spreadsheets.get({ spreadsheetId: ID, fields: 'sheets(properties(title))' })
console.log(`✓ El archivo tiene ${m2.data.sheets.length} solapas (antes ${meta.data.sheets.length})\n`)
if (!ok) process.exit(1)
try { await sheets.spreadsheets.values.append({ spreadsheetId: ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), 'juan (script)', 'seguros-setup', HOJA_SEGUROS, '', `solapa nueva con ${COLS_SEGUROS.length} columnas`]] } }) } catch (e) {}
