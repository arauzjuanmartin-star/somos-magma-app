/**
 * Agrega a PRESUPUESTOS las 6 columnas del brief de edición (DK a DP).
 *
 * Por qué: el brief se contesta AL PRESUPUESTAR —es cuando estás hablando con el
 * cliente— y de ahí lo levanta solo el tablero de Edición. Hasta hoy el
 * presupuestador no preguntaba nada y el editor lo averiguaba por WhatsApp.
 *
 * Deja también la validación de cada columna (desplegable con las opciones reales)
 * y extiende el basicFilter, si no la columna existe pero no aparece en el filtro.
 *
 * Uso:  node scripts/presupuestos-columnas-edicion.mjs             (preview)
 *       node scripts/presupuestos-columnas-edicion.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { HEADERS_BRIEF_ED, COL_BRIEF_ED } from '../lib/slots.js'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }

// Las mismas opciones que ofrece el formulario, para que quien cargue a mano en el
// sheet no invente variantes ("vertical", "9:16", "IG vertical") que después no agrupan.
const OPCIONES = {
  'Ed. Clase': ['Charla o corporativo', 'Cobertura para la agencia', 'Activación de marca', 'Entrevista o testimonio', 'Solo imágenes', 'Inserto en video de un tercero', 'Motion'],
  'Ed. Duración': ['15-30 s', '45 s', '60 s', 'Más de 60 s'],
  'Ed. Formato': ['Vertical (redes sociales)', 'Horizontal (YouTube / TV)', 'Los dos'],
  'Ed. Red': ['Instagram', 'TikTok', 'YouTube Shorts', 'LinkedIn', 'Varias'],
  'Ed. Gráfica': ['Sí', 'No', 'A definir'],
  'Ed. Material': ['Lo filmamos nosotros', 'Lo pone el cliente', 'Mixto'],
}

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, fields: 'sheets(properties(title,sheetId,gridProperties),basicFilter)' })
const hoja = meta.data.sheets.find(x => x.properties.title === 'PRESUPUESTOS')
const sid = hoja.properties.sheetId
const anchoActual = hoja.properties.gridProperties.columnCount
const R = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PRESUPUESTOS!A1:ZZ1' })
const h = (R.data.values || [])[0] || []

console.log(`\nPRESUPUESTOS: ${h.length} headers · la hoja tiene ${anchoActual} columnas`)
const faltan = HEADERS_BRIEF_ED.filter(x => h.indexOf(x) === -1)
const yaEstan = HEADERS_BRIEF_ED.filter(x => h.indexOf(x) > -1)
if (yaEstan.length) console.log('Ya existen:', yaEstan.map(x => `${x} (${colLetra(h.indexOf(x))})`).join(' · '))
if (!faltan.length) { console.log('\nNo falta ninguna columna.\n'); process.exit(0) }
console.log('\nA crear:')
HEADERS_BRIEF_ED.forEach((x, i) => { if (faltan.includes(x)) console.log(`   ${colLetra(COL_BRIEF_ED + i)}1  ${x.padEnd(15)} → ${OPCIONES[x].join(' / ')}`) })
console.log(`\nEl filtro de la solapa se extiende hasta ${colLetra(COL_BRIEF_ED + HEADERS_BRIEF_ED.length - 1)}.`)
if (!ESCRIBIR) { console.log('\n(preview — corré con --escribir para aplicar)\n'); process.exit(0) }

const ultima = COL_BRIEF_ED + HEADERS_BRIEF_ED.length
const requests = []
if (anchoActual < ultima) requests.push({ appendDimension: { sheetId: sid, dimension: 'COLUMNS', length: ultima - anchoActual } })
// Desplegable por columna: escribir a mano en el sheet tiene que dar las mismas opciones.
HEADERS_BRIEF_ED.forEach((x, i) => {
  requests.push({ setDataValidation: {
    range: { sheetId: sid, startRowIndex: 1, startColumnIndex: COL_BRIEF_ED + i, endColumnIndex: COL_BRIEF_ED + i + 1 },
    rule: { condition: { type: 'ONE_OF_LIST', values: OPCIONES[x].map(v => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false },
  } })
})
requests.push({ setBasicFilter: { filter: { range: { sheetId: sid, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: ultima } } } })
await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests } })
await sheets.spreadsheets.values.update({
  spreadsheetId: ID, range: `PRESUPUESTOS!${colLetra(COL_BRIEF_ED)}1:${colLetra(ultima - 1)}1`,
  valueInputOption: 'USER_ENTERED', requestBody: { values: [HEADERS_BRIEF_ED] },
})

const V = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PRESUPUESTOS!A1:ZZ1' })).data.values[0]
const ok = HEADERS_BRIEF_ED.every((x, i) => V[COL_BRIEF_ED + i] === x)
console.log(ok ? `\n✓ columnas creadas en ${colLetra(COL_BRIEF_ED)}-${colLetra(ultima - 1)}, con desplegable y filtro extendido\n`
               : `\n✗ quedaron mal: ${V.slice(COL_BRIEF_ED, ultima).join(' | ')}\n`)
