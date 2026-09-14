// Crea la solapa HORAS_EXTRA (una fila por carga: quién, cuándo, en qué trabajo,
// cuántas horas y por qué). Es lo que Dani carga desde Edición en el momento,
// para no reconstruirlo a fin de mes. Idempotente: si ya existe, solo completa
// los headers que falten. Preview por default, --escribir para aplicar.
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const ESCRIBIR=process.argv.includes('--escribir')
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:[ESCRIBIR?'https://www.googleapis.com/auth/spreadsheets':'https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
export const HEADERS_HORAS=['Fecha','Persona','Mail','N° presupuesto','Cliente','Proyecto','Entregable','ID edición','Horas','Motivo','Cargado por','Cargado el','Mes']
const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties(title,sheetId))'})
const hoja=meta.data.sheets.find(s=>s.properties.title==='HORAS_EXTRA')
console.log(hoja?'HORAS_EXTRA ya existe':'HORAS_EXTRA no existe: se crea con '+HEADERS_HORAS.length+' columnas → '+HEADERS_HORAS.join(' | '))
if(!ESCRIBIR){ console.log('\n👀 PREVIEW — nada se escribió. Corré con --escribir.'); process.exit(0) }
let sheetId=hoja?.properties.sheetId
if(!hoja){
  const r=await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[{addSheet:{properties:{title:'HORAS_EXTRA',gridProperties:{rowCount:1000,columnCount:HEADERS_HORAS.length,frozenRowCount:1}}}}]}})
  sheetId=r.data.replies[0].addSheet.properties.sheetId
}
const h=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'HORAS_EXTRA!1:1'})).data.values?.[0]||[]
const faltan=HEADERS_HORAS.filter(x=>!h.includes(x))
if(faltan.length||!h.length){
  const nuevos=[...h,...faltan]
  await sheets.spreadsheets.values.update({spreadsheetId:ID,range:'HORAS_EXTRA!A1',valueInputOption:'USER_ENTERED',requestBody:{values:[nuevos]}})
  // header en negrita + filtro sobre toda la solapa, para que Mariana/Sofi la puedan mirar
  await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[
    {repeatCell:{range:{sheetId,startRowIndex:0,endRowIndex:1},cell:{userEnteredFormat:{textFormat:{bold:true},backgroundColor:{red:0.95,green:0.95,blue:0.95}}},fields:'userEnteredFormat(textFormat,backgroundColor)'}},
    {setBasicFilter:{filter:{range:{sheetId,startRowIndex:0,startColumnIndex:0,endColumnIndex:nuevos.length}}}},
    {updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:0,endIndex:nuevos.length},properties:{pixelSize:130},fields:'pixelSize'}},
  ]}})
}
const h2=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'HORAS_EXTRA!1:1'})).data.values?.[0]||[]
console.log('✓ HORAS_EXTRA lista:',h2.join(' | '))
