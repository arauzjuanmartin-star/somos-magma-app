/**
 * Agrega a PRESUPUESTOS las columnas del paquete de eventos: "Paquete" (EA), "Desc. paquete" (EB)
 * y "Precio lista" (EC).
 *
 * Por qué (Juan, 27/10/2026): Sofi cotiza varios eventos al mismo cliente y quiere mandar un
 * solo PDF con el precio de cada uno y un descuento si cierra todos. Cada evento sigue siendo
 * su propio presupuesto; estas columnas los agrupan (ver lib/slots.js, COL_PAQUETE).
 *
 * Van al final (después de "Tipo de trabajo") y no al lado del N°: mover columnas de
 * PRESUPUESTOS corre los 40 slots y rompe todo lo que lee por posición.
 * Extiende el basicFilter y al terminar relee la fila 1.
 *
 * Uso:  node scripts/presupuestos-columnas-paquete.mjs             (preview)
 *       node scripts/presupuestos-columnas-paquete.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { COL_PAQUETE, HEADERS_PAQUETE } from '../lib/slots.js'

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
if (h[COL_PAQUETE] === HEADERS_PAQUETE[0]) { console.log(`\n"${HEADERS_PAQUETE[0]}" ya existe en ${colLetra(COL_PAQUETE)}. No hago nada.\n`); process.exit(0) }
if (h.length !== COL_PAQUETE) { console.log(`\n✗ La última columna con nombre es la ${h.length} y lib/slots.js espera arrancar en la ${COL_PAQUETE + 1} (${colLetra(COL_PAQUETE)}). Revisar antes de escribir.\n`); process.exit(1) }

console.log('\nA crear:')
HEADERS_PAQUETE.forEach((t, i) => console.log(`   ${colLetra(COL_PAQUETE + i)}1  ${t}`))
console.log(`\nEl filtro de la solapa se extiende hasta ${colLetra(COL_PAQUETE + HEADERS_PAQUETE.length - 1)}. No se toca ninguna fila de datos.`)
if (!ESCRIBIR) { console.log('\n(preview — corré con --escribir para aplicar)\n'); process.exit(0) }

const ultima = COL_PAQUETE + HEADERS_PAQUETE.length
const requests = []
if (anchoActual < ultima) requests.push({ appendDimension: { sheetId: sid, dimension: 'COLUMNS', length: ultima - anchoActual } })
requests.push({ updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: COL_PAQUETE, endIndex: ultima }, properties: { pixelSize: 100 }, fields: 'pixelSize' } })
requests.push({ setBasicFilter: { filter: { range: { sheetId: sid, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: ultima } } } })
await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests } })
await sheets.spreadsheets.values.update({ spreadsheetId: ID, range: `PRESUPUESTOS!${colLetra(COL_PAQUETE)}1`, valueInputOption: 'RAW', requestBody: { values: [HEADERS_PAQUETE] } })

const R2 = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PRESUPUESTOS!A1:ZZ1' })
const h2 = (R2.data.values || [])[0] || []
const mal = HEADERS_PAQUETE.filter((t, i) => h2[COL_PAQUETE + i] !== t)
if (mal.length) { console.log(`\n✗ Después de escribir no quedaron bien: ${mal.join(', ')}. Revisar la fila 1 a mano.\n`); process.exit(1) }
console.log(`\n✓ Listo: ${HEADERS_PAQUETE.map((t, i) => colLetra(COL_PAQUETE + i) + ' ' + t).join(' · ')} · filtro hasta ${colLetra(ultima - 1)}.\n`)
try { await sheets.spreadsheets.values.append({ spreadsheetId: ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), 'juan (script)', 'presupuestos-columnas-paquete', 'PRESUPUESTOS', '', `columnas ${colLetra(COL_PAQUETE)}-${colLetra(ultima - 1)} paquete`]] } }) } catch (e) {}
