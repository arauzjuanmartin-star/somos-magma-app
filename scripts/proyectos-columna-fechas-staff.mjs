/**
 * Agrega a PROYECTOS la columna "Fechas Staff" (EV).
 *
 * Para qué: en un trabajo de varias fechas —Popstars son 30 días— el staff se carga
 * por SERVICIO ("Video 1 → Lucho") y no dice qué día va cada uno. Con 12 jornadas
 * repartidas entre tres personas, eso no alcanza ni para avisarle a nadie ni para
 * saber cuánto pagarle.
 *
 * Formato: "1:08/09/2026|2:09/09/2026" — el número es el slot, igual que Pedido N /
 * Staff N / Precio N, así queda alineado con el resto de la fila.
 *
 * Uso:  node scripts/proyectos-columna-fechas-staff.mjs             (preview)
 *       node scripts/proyectos-columna-fechas-staff.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const COL = 'Fechas Staff'
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, fields: 'sheets(properties(title,sheetId,gridProperties))' })
const hoja = meta.data.sheets.find(x => x.properties.title === 'PROYECTOS')
const sid = hoja.properties.sheetId
const ancho = hoja.properties.gridProperties.columnCount
const h = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PROYECTOS!A1:ZZ1' })).data.values[0]

console.log(`\nPROYECTOS: ${h.length} headers · la hoja tiene ${ancho} columnas`)
const ya = h.indexOf(COL)
if (ya > -1) { console.log(`\n"${COL}" ya existe en ${colLetra(ya)}. Nada que hacer.\n`); process.exit(0) }
const destino = h.length
console.log(`\nA crear: ${colLetra(destino)}1 = "${COL}"`)
console.log(`El filtro de la solapa se extiende hasta ${colLetra(destino)}.`)
if (!ESCRIBIR) { console.log('\n(preview — corré con --escribir para aplicar)\n'); process.exit(0) }

const requests = []
if (ancho < destino + 1) requests.push({ appendDimension: { sheetId: sid, dimension: 'COLUMNS', length: destino + 1 - ancho } })
if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests } })
// El filtro se extiende aparte y sin frenar nada: PROYECTOS tiene una "tabla" de
// Sheets y el setBasicFilter falla si el rango la cruza a medias. Si no se puede,
// la columna igual queda creada y el filtro se estira a mano una vez.
try {
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests: [{ setBasicFilter: { filter: { range: { sheetId: sid, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: destino + 1 } } } }] } })
  console.log('   filtro extendido ✓')
} catch (e) { console.log(`   (el filtro no se pudo extender solo: ${e.message.split('\n')[0]})`) }
await sheets.spreadsheets.values.update({ spreadsheetId: ID, range: `PROYECTOS!${colLetra(destino)}1`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[COL]] } })

const v = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PROYECTOS!A1:ZZ1' })).data.values[0]
console.log(v[destino] === COL ? `\n✓ "${COL}" creada en ${colLetra(destino)}\n` : `\n✗ quedó "${v[destino]}"\n`)
