import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
    const i=l.indexOf('='); let v=l.slice(i+1).trim()
    if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1)
    return [l.slice(0,i).trim(),v]
  })
)
const auth = new google.auth.GoogleAuth({
  credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},
  scopes:['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({version:'v4',auth})
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

// Plan fijo (confirmado con preview):
// - Normalizar fila 823 (#1933, $220000) y fila 826 (#1943, $290000): Mes Referencia, montos, Estado
// - Borrar filas duplicadas 824 y 825
// Columnas: A FechaPago B Freelancer C MesReferencia D N° E Proyecto F Servicio G MontoAdeudado H MontoPagado I Tipo J Cuenta K Estado L Notas

// 1) Normalizar (value updates ANTES de borrar, usando índices originales)
const norm = (fila, monto) => ([
  { range:`PAGOS_STAFF!C${fila}`, values:[['06 - junio']] },     // Mes Referencia
  { range:`PAGOS_STAFF!F${fila}`, values:[['']] },               // Servicio (perdido)
  { range:`PAGOS_STAFF!G${fila}`, values:[[monto]] },            // Monto Adeudado
  { range:`PAGOS_STAFF!H${fila}`, values:[[monto]] },            // Monto Pagado
  { range:`PAGOS_STAFF!I${fila}`, values:[['Total']] },          // Tipo
  { range:`PAGOS_STAFF!K${fila}`, values:[['Pagado']] },         // Estado
])
await sheets.spreadsheets.values.batchUpdate({ spreadsheetId:SHEET_ID, requestBody:{ valueInputOption:'USER_ENTERED', data:[ ...norm(823,220000), ...norm(826,290000) ] } })
console.log('✓ Normalizadas filas 823 (#1933) y 826 (#1943)')

// 2) Borrar duplicadas 824 y 825 (bottom-up). Necesita sheetId de PAGOS_STAFF
const meta = await sheets.spreadsheets.get({ spreadsheetId:SHEET_ID, fields:'sheets(properties(sheetId,title))' })
const sh = meta.data.sheets.find(s=>s.properties.title==='PAGOS_STAFF')
const sheetId = sh.properties.sheetId
// índices 0-based: fila 825 → 824, fila 824 → 823. Borrar de mayor a menor.
await sheets.spreadsheets.batchUpdate({ spreadsheetId:SHEET_ID, requestBody:{ requests:[
  { deleteDimension:{ range:{ sheetId, dimension:'ROWS', startIndex:824, endIndex:825 } } }, // fila 825
  { deleteDimension:{ range:{ sheetId, dimension:'ROWS', startIndex:823, endIndex:824 } } }, // fila 824
]}})
console.log('✓ Borradas filas duplicadas 824 y 825')
console.log('Listo. Verificá Pagos Staff → junio: Felipe #1933 y #1943 deben verse pagados, sin duplicados.')
