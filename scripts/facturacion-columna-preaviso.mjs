/**
 * Crea en FACTURACION la columna "Preaviso enviado": la fecha en que Flor le avisó al cliente que la factura
 * está por vencer (lib/preaviso-cobro.js · pages/api/preaviso-cobro.js). Sin esa fecha el aviso saldría todos
 * los días.
 *
 * Va AL FINAL, pegada a "Prometió pagar" y "Nota cobranza" (las otras de cobranza): no corre ninguna columna,
 * así no se rompe nada que lea FACTURACION por posición. Extiende el filtro para que aparezca en el desplegable.
 *
 *       node scripts/facturacion-columna-preaviso.mjs              → preview, no escribe nada
 *       node scripts/facturacion-columna-preaviso.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('='); let v = l.slice(i + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    return [l.slice(0, i).trim(), v]
  })
)
const auth = new google.auth.GoogleAuth({
  credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const COL = 'Preaviso enviado'
const colLetra = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26 } return s }

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, ranges: ['FACTURACION'], fields: 'sheets(properties(title,sheetId,gridProperties),basicFilter,tables(tableId,name,range))' })
const hoja = meta.data.sheets.find(s => s.properties.title === 'FACTURACION')
const sheetId = hoja.properties.sheetId
// FACTURACION es una TABLA de Sheets ("Tabla_7"): el filtro es el de la tabla y se agranda la tabla, no el filtro
// (la API rechaza setBasicFilter sobre una tabla: "Filter can either be applied to a table or a range, not both")
const tabla = (hoja.tables || [])[0]

const r = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'FACTURACION!A:AZ' })
const filas = r.data.values || [], H = (filas[0] || []).map(h => String(h).trim())
if (H.includes(COL)) { console.log(`"${COL}" ya existe en la columna ${colLetra(H.indexOf(COL))}. Nada que hacer.`); process.exit(0) }
// La última columna con título: los datos de cobranza tienen que terminar ahí, si no algo escribe más a la derecha
const DESTINO = H.length
const masAncha = Math.max(...filas.map(f => f.length))
console.log(`FACTURACION · ${filas.length - 1} filas · ${H.length} títulos · grilla de ${hoja.properties.gridProperties.columnCount} columnas`)
console.log(`Últimas: ${H.slice(-4).map((h, i) => `${colLetra(H.length - 4 + i)}:${h}`).join(' · ')}`)
console.log(`Nueva:   ${colLetra(DESTINO)}:${COL}  (vacía; la llena la app al mandar cada preaviso)`)
if (masAncha > H.length) { console.error(`✗ Hay filas con datos hasta la columna ${colLetra(masAncha - 1)}, más allá del último título. Freno: revisar a mano.`); process.exit(1) }
console.log(tabla ? `Tabla "${tabla.name}": hasta ${colLetra(tabla.range.endColumnIndex - 1)} → se agranda a ${colLetra(DESTINO)}` : hoja.basicFilter ? `Filtro: hasta ${colLetra(hoja.basicFilter.range.endColumnIndex - 1)} → se extiende a ${colLetra(DESTINO)}` : 'Filtro: la solapa no tiene')

if (!ESCRIBIR) { console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---'); process.exit(0) }

const ctrl = filas[Math.floor(filas.length / 2)]
const reqs = []
if (hoja.properties.gridProperties.columnCount <= DESTINO) reqs.push({ appendDimension: { sheetId, dimension: 'COLUMNS', length: DESTINO + 1 - hoja.properties.gridProperties.columnCount } })
reqs.push({ copyPaste: {
  source: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: DESTINO - 1, endColumnIndex: DESTINO },
  destination: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: DESTINO, endColumnIndex: DESTINO + 1 },
  pasteType: 'PASTE_FORMAT' } })
reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: DESTINO, endIndex: DESTINO + 1 }, properties: { pixelSize: 120 }, fields: 'pixelSize' } })
if (tabla) {
  if (tabla.range.endColumnIndex < DESTINO + 1)
    reqs.push({ updateTable: { table: { tableId: tabla.tableId, range: { ...tabla.range, endColumnIndex: DESTINO + 1 } }, fields: 'range' } })
} else if (hoja.basicFilter && hoja.basicFilter.range.endColumnIndex < DESTINO + 1) {
  // Solo se agranda el rango: los criterios no se tocan porque ninguna columna se corrió
  const bf = JSON.parse(JSON.stringify(hoja.basicFilter))
  bf.range.endColumnIndex = DESTINO + 1
  reqs.push({ setBasicFilter: { filter: bf } })
}
await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests: reqs } })
await sheets.spreadsheets.values.update({ spreadsheetId: ID, range: `FACTURACION!${colLetra(DESTINO)}1`, valueInputOption: 'RAW', requestBody: { values: [[COL]] } })

// Verificación: el título quedó donde iba y los datos no se movieron
const v = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'FACTURACION!A:AZ' })
const F2 = v.data.values || [], H2 = (F2[0] || []).map(h => String(h).trim())
const ctrl2 = F2[Math.floor(filas.length / 2)]
const ok = H2[DESTINO] === COL && H.every((h, i) => H2[i] === h) && JSON.stringify(ctrl2.slice(0, H.length)) === JSON.stringify(ctrl.slice(0, H.length))
console.log(ok ? `✓ "${COL}" en ${colLetra(DESTINO)}, títulos y fila de control intactos` : '✗ algo no cerró: revisar FACTURACION')
if (!ok) process.exit(1)
try { await sheets.spreadsheets.values.append({ spreadsheetId: ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
  requestBody: { values: [[new Date().toISOString(), 'script', 'columna-nueva', 'FACTURACION', colLetra(DESTINO), COL]] } }) } catch (e) {}
