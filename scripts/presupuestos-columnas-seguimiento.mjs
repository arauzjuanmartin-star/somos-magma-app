/**
 * Agrega a PRESUPUESTOS las 3 columnas del seguimiento comercial (DQ a DS):
 *   Último contacto · Próximo paso · Seguir el
 *
 * Por qué: hasta hoy un presupuesto "en espera" solo tenía la fecha en que se armó.
 * Con 34 presupuestos pasados del "día 4" nadie podía decir cuáles ya se habían
 * llamado. Con estas columnas la app anota cada contacto y la diaria de las 8
 * arma "hoy te toca llamar" sola.
 *
 * Van al final (después de las de Edición) y NO en el medio, a propósito: mover una
 * columna de PRESUPUESTOS corre los 40 slots de servicios y rompe todo lo que lee
 * por posición (lib/slots.js, marketing.mjs, brief.mjs…).
 *
 * Deja las dos columnas de fecha con formato dd/mm/yyyy y extiende el basicFilter,
 * si no la columna existe pero no aparece en el desplegable del filtro.
 *
 * Uso:  node scripts/presupuestos-columnas-seguimiento.mjs             (preview)
 *       node scripts/presupuestos-columnas-seguimiento.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { HEADERS_SEGUIMIENTO, COL_SEGUIMIENTO } from '../lib/slots.js'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const ES_FECHA = ['Último contacto', 'Seguir el']

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, fields: 'sheets(properties(title,sheetId,gridProperties),basicFilter)' })
const hoja = meta.data.sheets.find(x => x.properties.title === 'PRESUPUESTOS')
const sid = hoja.properties.sheetId
const anchoActual = hoja.properties.gridProperties.columnCount
const R = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PRESUPUESTOS!A1:ZZ1' })
const h = (R.data.values || [])[0] || []

console.log(`\nPRESUPUESTOS: ${h.length} headers · la hoja tiene ${anchoActual} columnas · el filtro llega hasta ${colLetra((hoja.basicFilter?.range?.endColumnIndex || 0) - 1)}`)
console.log(`Última columna con nombre: ${colLetra(h.length - 1)} "${h[h.length - 1]}"`)
const faltan = HEADERS_SEGUIMIENTO.filter(x => h.indexOf(x) === -1)
const yaEstan = HEADERS_SEGUIMIENTO.filter(x => h.indexOf(x) > -1)
if (yaEstan.length) console.log('Ya existen:', yaEstan.map(x => `${x} (${colLetra(h.indexOf(x))})`).join(' · '))
if (!faltan.length) { console.log('\nNo falta ninguna columna.\n'); process.exit(0) }
// Las tres van juntas y en el lugar que dice lib/slots.js; si el sheet ya tiene algo ahí, frenar.
const ocupadas = HEADERS_SEGUIMIENTO.map((_, i) => h[COL_SEGUIMIENTO + i]).filter(Boolean).filter(x => !HEADERS_SEGUIMIENTO.includes(x))
if (ocupadas.length) { console.log(`\n✗ En ${colLetra(COL_SEGUIMIENTO)}-${colLetra(COL_SEGUIMIENTO + 2)} ya hay otra cosa: ${ocupadas.join(' | ')}. Revisar lib/slots.js antes de escribir.\n`); process.exit(1) }

console.log('\nA crear:')
HEADERS_SEGUIMIENTO.forEach((x, i) => console.log(`   ${colLetra(COL_SEGUIMIENTO + i)}1  ${x.padEnd(16)} ${ES_FECHA.includes(x) ? '(fecha dd/mm/yyyy)' : '(texto)'}`))
console.log(`\nEl filtro de la solapa se extiende hasta ${colLetra(COL_SEGUIMIENTO + HEADERS_SEGUIMIENTO.length - 1)}.`)
if (!ESCRIBIR) { console.log('\n(preview — corré con --escribir para aplicar)\n'); process.exit(0) }

const ultima = COL_SEGUIMIENTO + HEADERS_SEGUIMIENTO.length
const requests = []
if (anchoActual < ultima) requests.push({ appendDimension: { sheetId: sid, dimension: 'COLUMNS', length: ultima - anchoActual } })
HEADERS_SEGUIMIENTO.forEach((x, i) => {
  if (!ES_FECHA.includes(x)) return
  requests.push({ repeatCell: {
    range: { sheetId: sid, startRowIndex: 1, startColumnIndex: COL_SEGUIMIENTO + i, endColumnIndex: COL_SEGUIMIENTO + i + 1 },
    cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' } } },
    fields: 'userEnteredFormat.numberFormat',
  } })
})
requests.push({ setBasicFilter: { filter: { range: { sheetId: sid, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: ultima } } } })
await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests } })
await sheets.spreadsheets.values.update({
  spreadsheetId: ID, range: `PRESUPUESTOS!${colLetra(COL_SEGUIMIENTO)}1:${colLetra(ultima - 1)}1`,
  valueInputOption: 'USER_ENTERED', requestBody: { values: [HEADERS_SEGUIMIENTO] },
})

const V = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PRESUPUESTOS!A1:ZZ1' })).data.values[0]
const ok = HEADERS_SEGUIMIENTO.every((x, i) => V[COL_SEGUIMIENTO + i] === x)
console.log(ok ? `\n✓ columnas creadas en ${colLetra(COL_SEGUIMIENTO)}-${colLetra(ultima - 1)}, con formato de fecha y filtro extendido\n`
               : `\n✗ quedaron mal: ${V.slice(COL_SEGUIMIENTO, ultima).join(' | ')}\n`)
