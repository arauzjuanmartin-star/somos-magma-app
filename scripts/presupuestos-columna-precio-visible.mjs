/**
 * Agrega a PRESUPUESTOS la columna "Precio visible" (DX).
 *
 * Por qué: "Mostrar precio por ítem" (DJ) abre TODOS los renglones del PDF. El equipo pidió el
 * 08/10/2026 poder abrir el precio de UN ítem (los viáticos, el rental) y dejar el resto
 * cerrado. La app lo guarda acá como CSV por slot alineado con "Fee Servicios"
 * (1 = esa línea sale con precio). Con el "$" puesto, el Valor total no se mueve.
 *
 * Va al final (después de "Resguardo fecha") y NO en el medio, a propósito: mover una
 * columna de PRESUPUESTOS corre los 40 slots de servicios y rompe todo lo que lee por
 * posición (lib/slots.js, marketing.mjs, brief.mjs…).
 *
 * Extiende el basicFilter (si no, la columna existe pero no aparece en el desplegable del
 * filtro) y al terminar relee la fila 1 y verifica que el título quedó donde dice lib/slots.js.
 *
 * Uso:  node scripts/presupuestos-columna-precio-visible.mjs             (preview)
 *       node scripts/presupuestos-columna-precio-visible.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { COL_PRECIO_VISIBLE, HEADER_PRECIO_VISIBLE } from '../lib/slots.js'

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
const R = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PRESUPUESTOS!A1:ZZ1' })
const h = (R.data.values || [])[0] || []

console.log(`\nPRESUPUESTOS: ${h.length} headers · la hoja tiene ${anchoActual} columnas · el filtro llega hasta ${colLetra((hoja.basicFilter?.range?.endColumnIndex || 0) - 1)}`)
console.log(`Última columna con nombre: ${colLetra(h.length - 1)} "${h[h.length - 1]}"`)
if (h.indexOf(HEADER_PRECIO_VISIBLE) > -1) { console.log(`\n"${HEADER_PRECIO_VISIBLE}" ya existe en ${colLetra(h.indexOf(HEADER_PRECIO_VISIBLE))}. No hago nada.\n`); process.exit(0) }
if (h[COL_PRECIO_VISIBLE]) { console.log(`\n✗ En ${colLetra(COL_PRECIO_VISIBLE)}1 ya hay otra cosa: "${h[COL_PRECIO_VISIBLE]}". Revisar lib/slots.js antes de escribir.\n`); process.exit(1) }
if (h.length !== COL_PRECIO_VISIBLE) { console.log(`\n✗ La última columna con nombre es la ${h.length} y lib/slots.js espera que "${HEADER_PRECIO_VISIBLE}" vaya en la ${COL_PRECIO_VISIBLE + 1} (${colLetra(COL_PRECIO_VISIBLE)}). Hay una columna de más o de menos (¿faltan las del resguardo? scripts/presupuestos-columnas-resguardo.mjs): revisar antes de escribir.\n`); process.exit(1) }

console.log(`\nA crear:\n   ${colLetra(COL_PRECIO_VISIBLE)}1  ${HEADER_PRECIO_VISIBLE}   (CSV por slot, 0|1|0 — qué líneas salen con precio en el PDF)`)
console.log(`\nEl filtro de la solapa se extiende hasta ${colLetra(COL_PRECIO_VISIBLE)}. No se toca ninguna fila de datos.`)
if (!ESCRIBIR) { console.log('\n(preview — corré con --escribir para aplicar)\n'); process.exit(0) }

const ultima = COL_PRECIO_VISIBLE + 1
const requests = []
if (anchoActual < ultima) requests.push({ appendDimension: { sheetId: sid, dimension: 'COLUMNS', length: ultima - anchoActual } })
requests.push({ updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: COL_PRECIO_VISIBLE, endIndex: ultima }, properties: { pixelSize: 90 }, fields: 'pixelSize' } })
requests.push({ setBasicFilter: { filter: { range: { sheetId: sid, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: ultima } } } })
await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests } })
await sheets.spreadsheets.values.update({ spreadsheetId: ID, range: `PRESUPUESTOS!${colLetra(COL_PRECIO_VISIBLE)}1`, valueInputOption: 'RAW', requestBody: { values: [[HEADER_PRECIO_VISIBLE]] } })

const R2 = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PRESUPUESTOS!A1:ZZ1' })
const h2 = (R2.data.values || [])[0] || []
if (h2[COL_PRECIO_VISIBLE] !== HEADER_PRECIO_VISIBLE) { console.log(`\n✗ Después de escribir, en ${colLetra(COL_PRECIO_VISIBLE)}1 hay "${h2[COL_PRECIO_VISIBLE]}". Revisar la fila 1 a mano.\n`); process.exit(1) }
console.log(`\n✓ Listo: ${colLetra(COL_PRECIO_VISIBLE)} ${HEADER_PRECIO_VISIBLE} · filtro hasta ${colLetra(ultima - 1)} · ${h2.length} columnas con nombre.\n`)
try { await sheets.spreadsheets.values.append({ spreadsheetId: ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), 'juan (script)', 'presupuestos-columna-precio-visible', 'PRESUPUESTOS', '', `columna ${colLetra(COL_PRECIO_VISIBLE)} "${HEADER_PRECIO_VISIBLE}"`]] } }) } catch (e) {}
