/**
 * Agrega a PRESUPUESTOS las 3 columnas del resguardo del cobro (DU a DW):
 *   Resguardo · Resguardo detalle · Resguardo fecha
 *
 * Por qué: desde el 08/10/2026 un presupuesto no se aprueba (ni entra a PROYECTOS ni al
 * Calendar) sin la seña del 30 % cobrada o la orden de compra del cliente. La app lo pide
 * al aprobar y lo deja escrito acá. Decisión de Juan y Sofi después de CeraVe #2355:
 * 4 presupuestos, 11 piezas por 8 cotizadas, $0 de seña, cobro a 30 días con el staff
 * pagándose el 15. La seña era obligatoria desde el 18/08 y se cobró 0 veces en 164
 * facturas: escrita en el PDF no alcanzó.
 *
 * Van al final (después de "PDF Config") y NO en el medio, a propósito: mover una
 * columna de PRESUPUESTOS corre los 40 slots de servicios y rompe todo lo que lee
 * por posición (lib/slots.js, marketing.mjs, brief.mjs…).
 *
 * Deja "Resguardo fecha" con formato dd/mm/yyyy y extiende el basicFilter, si no la
 * columna existe pero no aparece en el desplegable del filtro. Al terminar relee la
 * fila 1 y verifica que los tres títulos quedaron donde dice lib/slots.js.
 *
 * Uso:  node scripts/presupuestos-columnas-resguardo.mjs             (preview)
 *       node scripts/presupuestos-columnas-resguardo.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { HEADERS_RESGUARDO, COL_RESGUARDO } from '../lib/slots.js'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const ES_FECHA = ['Resguardo fecha']

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, fields: 'sheets(properties(title,sheetId,gridProperties),basicFilter)' })
const hoja = meta.data.sheets.find(x => x.properties.title === 'PRESUPUESTOS')
const sid = hoja.properties.sheetId
const anchoActual = hoja.properties.gridProperties.columnCount
const R = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PRESUPUESTOS!A1:ZZ1' })
const h = (R.data.values || [])[0] || []

console.log(`\nPRESUPUESTOS: ${h.length} headers · la hoja tiene ${anchoActual} columnas · el filtro llega hasta ${colLetra((hoja.basicFilter?.range?.endColumnIndex || 0) - 1)}`)
console.log(`Última columna con nombre: ${colLetra(h.length - 1)} "${h[h.length - 1]}"`)
const faltan = HEADERS_RESGUARDO.filter(x => h.indexOf(x) === -1)
const yaEstan = HEADERS_RESGUARDO.filter(x => h.indexOf(x) > -1)
if (yaEstan.length) console.log('Ya existen:', yaEstan.map(x => `${x} (${colLetra(h.indexOf(x))})`).join(' · '))
if (!faltan.length) { console.log('\nNo falta ninguna columna.\n'); process.exit(0) }
// Las tres van juntas y en el lugar que dice lib/slots.js; si el sheet ya tiene algo ahí, frenar.
const ocupadas = HEADERS_RESGUARDO.map((_, i) => h[COL_RESGUARDO + i]).filter(Boolean).filter(x => !HEADERS_RESGUARDO.includes(x))
if (ocupadas.length) { console.log(`\n✗ En ${colLetra(COL_RESGUARDO)}-${colLetra(COL_RESGUARDO + 2)} ya hay otra cosa: ${ocupadas.join(' | ')}. Revisar lib/slots.js antes de escribir.\n`); process.exit(1) }
if (h.length !== COL_RESGUARDO) { console.log(`\n✗ La última columna con nombre es la ${h.length} y lib/slots.js espera que el resguardo arranque en la ${COL_RESGUARDO + 1} (${colLetra(COL_RESGUARDO)}). Hay una columna de más o de menos: revisar antes de escribir.\n`); process.exit(1) }

console.log('\nA crear:')
HEADERS_RESGUARDO.forEach((x, i) => console.log(`   ${colLetra(COL_RESGUARDO + i)}1  ${x.padEnd(18)} ${ES_FECHA.includes(x) ? '(fecha dd/mm/yyyy)' : x === 'Resguardo' ? '("Seña" u "OC")' : '(monto de la seña o N° de OC)'}`))
console.log(`\nEl filtro de la solapa se extiende hasta ${colLetra(COL_RESGUARDO + HEADERS_RESGUARDO.length - 1)}. No se toca ninguna fila de datos.`)
if (!ESCRIBIR) { console.log('\n(preview — corré con --escribir para aplicar)\n'); process.exit(0) }

const ultima = COL_RESGUARDO + HEADERS_RESGUARDO.length
const requests = []
if (anchoActual < ultima) requests.push({ appendDimension: { sheetId: sid, dimension: 'COLUMNS', length: ultima - anchoActual } })
HEADERS_RESGUARDO.forEach((x, i) => {
  if (!ES_FECHA.includes(x)) return
  requests.push({ repeatCell: {
    range: { sheetId: sid, startRowIndex: 1, startColumnIndex: COL_RESGUARDO + i, endColumnIndex: COL_RESGUARDO + i + 1 },
    cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' } } },
    fields: 'userEnteredFormat.numberFormat',
  } })
})
requests.push({ setBasicFilter: { filter: { range: { sheetId: sid, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: ultima } } } })
await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests } })
await sheets.spreadsheets.values.update({
  spreadsheetId: ID, range: `PRESUPUESTOS!${colLetra(COL_RESGUARDO)}1:${colLetra(ultima - 1)}1`,
  valueInputOption: 'USER_ENTERED', requestBody: { values: [HEADERS_RESGUARDO] },
})

// Verificar: releer la fila 1 y que los títulos estén exactamente donde dice lib/slots.js
const R2 = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PRESUPUESTOS!A1:ZZ1' })
const h2 = (R2.data.values || [])[0] || []
const mal = HEADERS_RESGUARDO.filter((x, i) => h2[COL_RESGUARDO + i] !== x)
if (mal.length) { console.log(`\n✗ Después de escribir, no coinciden: ${mal.join(', ')}. Revisar la fila 1 a mano.\n`); process.exit(1) }
console.log(`\n✓ Listo: ${HEADERS_RESGUARDO.map((x, i) => `${colLetra(COL_RESGUARDO + i)} ${x}`).join(' · ')} · filtro hasta ${colLetra(ultima - 1)} · ${h2.length} columnas con nombre.\n`)
