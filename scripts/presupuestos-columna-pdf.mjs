/**
 * Agrega a PRESUPUESTOS la columna "PDF Config" (DT): el PDF tal como se armó en el
 * generador (/presupuesto), guardado como JSON por presupuesto.
 *
 * Por qué: hasta el 24/09/2026 el generador de PDF armaba todo desde el sheet cada vez
 * que se abría. Lo que se escribía a mano (descripción, textos de los servicios,
 * cláusulas, plazo, descuento) vivía solo en esa pestaña del navegador: al reabrir el
 * presu —y peor, al represupuestar— el PDF salía de cero. Con esta columna la pantalla
 * arranca de lo guardado y el represupuesto la hereda.
 *
 * Va al final (después del seguimiento comercial DQ-DS) y NO en el medio: mover una
 * columna de PRESUPUESTOS corre los 40 slots de servicios y rompe lo que lee por posición.
 *
 * Deja la columna angosta y con el texto recortado (es JSON, nadie lo lee ahí) y extiende
 * el basicFilter; si no, la columna existe pero no aparece en el desplegable del filtro.
 *
 * La app la crea sola la primera vez que alguien guarda un PDF (/api/presupuesto-pdf),
 * pero sin formato ni filtro: este script deja la solapa prolija.
 *
 * Uso:  node scripts/presupuestos-columna-pdf.mjs             (preview)
 *       node scripts/presupuestos-columna-pdf.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { COL_PDF, HEADER_PDF } from '../lib/slots.js'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, fields: 'sheets(properties(title,sheetId,gridProperties),basicFilter)' })
const hoja = meta.data.sheets.find(x => x.properties.title === 'PRESUPUESTOS')
const sid = hoja.properties.sheetId
const anchoActual = hoja.properties.gridProperties.columnCount
const filtroHasta = hoja.basicFilter?.range?.endColumnIndex || 0
const R = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PRESUPUESTOS!A1:ZZ1' })
const h = (R.data.values || [])[0] || []
const letra = colLetra(COL_PDF)

console.log(`\nPRESUPUESTOS: ${h.length} headers · la hoja tiene ${anchoActual} columnas · el filtro llega hasta ${colLetra(filtroHasta - 1)}`)
console.log(`Última columna con nombre: ${colLetra(h.length - 1)} "${h[h.length - 1]}"`)
const yaEsta = h.indexOf(HEADER_PDF)
if (yaEsta > -1 && yaEsta !== COL_PDF) { console.log(`\n✗ "${HEADER_PDF}" ya existe pero en ${colLetra(yaEsta)}, no en ${letra}. Revisar lib/slots.js antes de tocar nada.\n`); process.exit(1) }
if (h[COL_PDF] && h[COL_PDF] !== HEADER_PDF) { console.log(`\n✗ En ${letra}1 ya hay otra cosa: "${h[COL_PDF]}". Revisar lib/slots.js antes de escribir.\n`); process.exit(1) }

const faltaHeader = yaEsta === -1
const faltaFiltro = filtroHasta < COL_PDF + 1
console.log('\nA hacer:')
console.log(`   ${letra}1  ${HEADER_PDF.padEnd(16)} ${faltaHeader ? '(crear — texto JSON, columna técnica)' : '(ya existe ✓)'}`)
console.log(`   ${letra}   ancho 90 px + texto recortado (CLIP): el JSON no ensancha las filas`)
console.log(`   filtro de la solapa → hasta ${letra} ${faltaFiltro ? '' : '(ya llega ✓)'}`)
if (!ESCRIBIR) { console.log('\n(preview — corré con --escribir para aplicar)\n'); process.exit(0) }

const requests = []
if (anchoActual < COL_PDF + 1) requests.push({ appendDimension: { sheetId: sid, dimension: 'COLUMNS', length: COL_PDF + 1 - anchoActual } })
requests.push({ updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: COL_PDF, endIndex: COL_PDF + 1 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } })
requests.push({ repeatCell: {
  range: { sheetId: sid, startRowIndex: 1, startColumnIndex: COL_PDF, endColumnIndex: COL_PDF + 1 },
  cell: { userEnteredFormat: { wrapStrategy: 'CLIP', textFormat: { foregroundColor: { red: 0.6, green: 0.6, blue: 0.6 }, fontSize: 8 } } },
  fields: 'userEnteredFormat(wrapStrategy,textFormat)',
} })
if (faltaFiltro) requests.push({ setBasicFilter: { filter: { range: { sheetId: sid, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: COL_PDF + 1 } } } })
await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests } })
if (faltaHeader) await sheets.spreadsheets.values.update({ spreadsheetId: ID, range: `PRESUPUESTOS!${letra}1`, valueInputOption: 'RAW', requestBody: { values: [[HEADER_PDF]] } })

const V = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PRESUPUESTOS!A1:ZZ1' })).data.values[0]
const meta2 = await sheets.spreadsheets.get({ spreadsheetId: ID, fields: 'sheets(properties(title),basicFilter)' })
const f2 = meta2.data.sheets.find(x => x.properties.title === 'PRESUPUESTOS').basicFilter?.range?.endColumnIndex || 0
const ok = V[COL_PDF] === HEADER_PDF && f2 >= COL_PDF + 1
console.log(ok ? `\n✓ "${HEADER_PDF}" en ${letra}, angosta, recortada y con el filtro hasta ${colLetra(f2 - 1)}\n`
               : `\n✗ quedó mal: ${letra}1="${V[COL_PDF]}", filtro hasta ${colLetra(f2 - 1)}\n`)
