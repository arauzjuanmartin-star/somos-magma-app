// La lista de precios de Magma para el staff, en el sheet y no en el código.
//
// Juan la mandó por WhatsApp a todo el equipo el 1/4/2026. Hasta ahora vivía sólo
// en ese mensaje: la app no la tenía, RRHH tenía otra cosa (a Santino le figuraba
// $420.000 la jornada cuando el acuerdo dice $290.000) y las fichas del equipo
// tenían que adivinar el precio mirando los pagos viejos.
//
// Va en una solapa propia para que la actualice Juan o Sofi sin tocar el código:
// cambia la celda y la ficha de las 42 personas dice el precio nuevo.
//
//   node scripts/tarifas-setup.mjs              → preview
//   node scripts/tarifas-setup.mjs --escribir   → crea la solapa (no la pisa si ya existe)

import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim()
  if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1)
  return [l.slice(0,i).trim(), v]
}))
const auth = new google.auth.GoogleAuth({
  credentials:{ client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') },
  scopes:['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version:'v4', auth })
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const SOLAPA = 'TARIFAS'
const ESCRIBIR = process.argv.includes('--escribir')

// Tal cual el mensaje del 1/4/2026. El orden es el que mandó Juan.
const FILAS = [
  ['Concepto', 'Detalle', 'Precio', 'Desde', 'Notas'],
  ['Media jornada',        'Hasta 6 hs',                        220000, '01/04/2026', ''],
  ['Jornada completa',     'Hasta 9 hs',                        290000, '01/04/2026', ''],
  ['Jornada extendida',    'A partir de las 10 hs',             350000, '01/04/2026', ''],
  ['Combo doble cobertura','2 medias jornadas en el mismo día', 350000, '01/04/2026', ''],
  ['Viáticos fuera de CABA','Contra ticket', 0, '01/04/2026',
   'Se paga el 15 junto con los jornales. El ticket va a Administración. Si es en auto, el peaje. Hablar con el responsable del proyecto.'],
]

const plata = n => '$' + Math.round(n).toLocaleString('es-AR')

const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields:'sheets(properties(sheetId,title))' })
const ya = meta.data.sheets.find(s => s.properties.title === SOLAPA)

console.log(`════════ SOLAPA ${SOLAPA} ════════\n`)
FILAS.slice(1).forEach(f =>
  console.log(`  ${String(f[0]).padEnd(24)} ${String(f[1]).padEnd(34)} ${(f[2] ? plata(f[2]) : 'contra ticket').padStart(14)}   ${f[4] ? '· ' + String(f[4]).slice(0,60) : ''}`))

if (ya) {
  console.log(`\n⚠️  La solapa ${SOLAPA} ya existe — no se pisa. Editala a mano en el sheet.`)
  process.exit(0)
}
if (!ESCRIBIR) {
  console.log('\n👀 PREVIEW — no se tocó nada. Corré con --escribir para crear la solapa.')
  console.log('   Después las fichas del equipo la leen de ahí: cambiás la celda y cambia para los 42.')
  process.exit(0)
}

const r = await sheets.spreadsheets.batchUpdate({
  spreadsheetId: SHEET_ID,
  requestBody:{ requests:[{ addSheet:{ properties:{ title: SOLAPA, gridProperties:{ rowCount: 40, columnCount: 6 } } } }] },
})
const sid = r.data.replies[0].addSheet.properties.sheetId

await sheets.spreadsheets.values.update({
  spreadsheetId: SHEET_ID, range: `${SOLAPA}!A1`,
  valueInputOption: 'USER_ENTERED', requestBody:{ values: FILAS },
})

// Presentable, no sólo correcto: es una solapa que va a mirar el equipo (regla de oro #4).
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody:{ requests:[
  { repeatCell:{ range:{ sheetId:sid, startRowIndex:0, endRowIndex:1 },
    cell:{ userEnteredFormat:{ textFormat:{ bold:true, foregroundColor:{ red:1, green:1, blue:1 } },
                               backgroundColor:{ red:0.035, green:0.035, blue:0.035 } } },
    fields:'userEnteredFormat(textFormat,backgroundColor)' } },
  { repeatCell:{ range:{ sheetId:sid, startRowIndex:1, endRowIndex:FILAS.length, startColumnIndex:2, endColumnIndex:3 },
    cell:{ userEnteredFormat:{ numberFormat:{ type:'CURRENCY', pattern:'$#,##0' } } },
    fields:'userEnteredFormat.numberFormat' } },
  { updateDimensionProperties:{ range:{ sheetId:sid, dimension:'COLUMNS', startIndex:0, endIndex:2 }, properties:{ pixelSize:230 }, fields:'pixelSize' } },
  { updateDimensionProperties:{ range:{ sheetId:sid, dimension:'COLUMNS', startIndex:2, endIndex:4 }, properties:{ pixelSize:120 }, fields:'pixelSize' } },
  { updateDimensionProperties:{ range:{ sheetId:sid, dimension:'COLUMNS', startIndex:4, endIndex:5 }, properties:{ pixelSize:420 }, fields:'pixelSize' } },
  { updateSheetProperties:{ properties:{ sheetId:sid, gridProperties:{ frozenRowCount:1 } }, fields:'gridProperties.frozenRowCount' } },
  { setBasicFilter:{ filter:{ range:{ sheetId:sid, startRowIndex:0, endRowIndex:FILAS.length, startColumnIndex:0, endColumnIndex:5 } } } },
]}})

console.log(`\n✅ Solapa ${SOLAPA} creada con ${FILAS.length-1} líneas.`)
console.log('   Para subir precios: cambiás la celda de Precio y corrés equipo-fichas.mjs otra vez.')
