// Agrega a RRHH la columna "Tarifa hora extra" (al final). Es lo que valoriza las
// horas que el equipo carga desde Edición (solapa HORAS_EXTRA) para que entren en
// Pagos Staff del mes. Sin tarifa, la línea aparece igual pero en $0 y avisa.
//   node scripts/rrhh-columna-tarifa-hora-extra.mjs [--escribir]
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const ESCRIBIR=process.argv.includes('--escribir')
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:[ESCRIBIR?'https://www.googleapis.com/auth/spreadsheets':'https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'; const HEADER='Tarifa hora extra'
const colLetra=n=>{let s='';n++;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=(n-m-1)/26}return s}
const meta=await sheets.spreadsheets.get({spreadsheetId:ID,ranges:['RRHH'],fields:'sheets(properties(sheetId,gridProperties(columnCount)),basicFilter,tables(tableId,range))'})
const hoja=meta.data.sheets[0]; const sheetId=hoja.properties.sheetId
const H=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'RRHH!1:1'})).data.values?.[0]||[]
const i=H.indexOf(HEADER); const destino=i>-1?i:H.length
const iRef=H.indexOf('Tarifa jornada')
console.log(`RRHH: ${H.length} columnas · "${HEADER}" ${i>-1?'ya existe en '+colLetra(i):'se agrega en '+colLetra(destino)} · referencia de formato: ${colLetra(iRef)} "Tarifa jornada"`)
if(!ESCRIBIR){ console.log('👀 PREVIEW — nada se escribió. Corré con --escribir.'); process.exit(0) }
if(i<0){
  const reqs=[]
  if(hoja.properties.gridProperties.columnCount<=destino) reqs.push({appendDimension:{sheetId,dimension:'COLUMNS',length:destino-hoja.properties.gridProperties.columnCount+1}})
  if(iRef>-1) reqs.push({copyPaste:{source:{sheetId,startRowIndex:0,endRowIndex:200,startColumnIndex:iRef,endColumnIndex:iRef+1},destination:{sheetId,startRowIndex:0,endRowIndex:200,startColumnIndex:destino,endColumnIndex:destino+1},pasteType:'PASTE_FORMAT'}})
  reqs.push({updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:destino,endIndex:destino+1},properties:{pixelSize:130},fields:'pixelSize'}})
  if(hoja.basicFilter&&!hoja.basicFilter.tableId){ const bf=JSON.parse(JSON.stringify(hoja.basicFilter)); bf.range.endColumnIndex=Math.max(bf.range.endColumnIndex||0,destino+1); delete bf.criteria; delete bf.filterSpecs; reqs.push({setBasicFilter:{filter:bf}}) }
  await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:reqs}})
  await sheets.spreadsheets.values.update({spreadsheetId:ID,range:`RRHH!${colLetra(destino)}1`,valueInputOption:'USER_ENTERED',requestBody:{values:[[HEADER]]}})
}
const H2=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'RRHH!1:1'})).data.values[0]
console.log(`✓ "${HEADER}" en ${colLetra(H2.indexOf(HEADER))} · headers: ${H2.join(' | ')}`)
