import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
    const i=l.indexOf('='); let v=l.slice(i+1).trim()
    if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1)
    return [l.slice(0,i).trim(),v]
  })
)
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth = new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets = google.sheets({version:'v4',auth})

const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' })
const presu = meta.data.sheets.find(s => s.properties.title === 'PRESUPUESTOS').properties
const cols = presu.gridProperties.columnCount
console.log(`PRESUPUESTOS tiene ${cols} columnas (necesitamos 50)`)

if (cols < 50) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ appendDimension: { sheetId: presu.sheetId, dimension: 'COLUMNS', length: 50 - cols } }] },
  })
  console.log(`✓ Grid expandido a 50 columnas`)
}

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

await sheets.spreadsheets.values.update({
  spreadsheetId: SHEET_ID,
  range: `PRESUPUESTOS!${colLetra(47)}1:${colLetra(49)}1`,
  valueInputOption: 'USER_ENTERED',
  requestBody: { values: [['Tipo Fechas', 'Fechas Adicionales', 'Fee Servicios']] },
})
console.log(`✓ Headers escritos: AV=Tipo Fechas, AW=Fechas Adicionales, AX=Fee Servicios`)
console.log(`  - Tipo Fechas: "dia" / "rango" / "multi"`)
console.log(`  - Fechas Adicionales: csv con "|" para cuando es multi/rango (ej. "5/3/2026|8/3/2026|10/3/2026")`)
console.log(`  - Fee Servicios: csv "1|0|1|1" indicando qué Pedido N tiene fee Magma`)
