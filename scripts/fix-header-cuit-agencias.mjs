/**
 * AGENCIAS!B1 está vacío pero la columna B guarda el CUIT.
 *
 * Causa raíz: A1:B1 está COMBINADA. En una celda combinada el valor vive solo en la
 * primera celda; escribir en la segunda la API lo acepta y lo descarta en silencio.
 * Como B1 nunca puede tener título, lib/sheets.js no puede mapear la columna
 * (hace obj[header]=valor) y el CUIT queda invisible para la app.
 *
 * Este script descombina A1:B1 y le pone el título "CUIT" a B1.
 * No toca ningún dato: solo la fila de encabezados.
 *   node scripts/fix-header-cuit-agencias.mjs        -> preview
 *   node scripts/fix-header-cuit-agencias.mjs --go   -> aplica
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const GO=process.argv.includes('--go')
const txt=v=>String(v??'').trim()

const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'AGENCIAS!A:L',valueRenderOption:'FORMATTED_VALUE'})
const rows=r.data.values||[]
const head=rows[0]||[]

if(txt(head[1])){
  console.log(`B1 ya tiene título: "${head[1]}" — nada que hacer.`); process.exit(0)
}
const conCuit=rows.slice(1).filter(x=>txt(x[1]))
console.log(`\nAGENCIAS!B1 está VACÍO. La columna B tiene ${conCuit.length} CUITs cargados:\n`)
conCuit.slice(0,20).forEach(x=>console.log(`   ${txt(x[0]).padEnd(28)} ${txt(x[1])}`))
if(conCuit.length>20) console.log(`   ... y ${conCuit.length-20} más`)
// ¿está combinada A1:B1? Es la causa de que B1 no acepte el título.
const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties(title,sheetId),merges)'})
const ag=meta.data.sheets.find(s=>s.properties.title==='AGENCIAS')
const sheetId=ag.properties.sheetId
const mergeHead=(ag.merges||[]).find(m=>m.startRowIndex===0&&m.endRowIndex===1&&m.startColumnIndex===0&&m.endColumnIndex>=2)

console.log(`\nCAMBIOS:`)
if(mergeHead) console.log(`  1. DESCOMBINAR AGENCIAS!A1:B1 (por eso B1 no acepta el título)`)
console.log(`  ${mergeHead?2:1}. escribir "CUIT" en AGENCIAS!B1`)
console.log(`  Ningún dato de las ${rows.length-1} filas se toca. Solo la fila 1.`)

if(!GO){ console.log(`\nPara aplicar:  node scripts/fix-header-cuit-agencias.mjs --go`); process.exit(0) }

if(mergeHead){
  await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[
    {unmergeCells:{range:{sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:2}}}
  ]}})
  console.log('  ✓ A1:B1 descombinada')
}
await sheets.spreadsheets.values.update({
  spreadsheetId:ID, range:'AGENCIAS!B1', valueInputOption:'RAW',
  requestBody:{values:[['CUIT']]},
})
await new Promise(r=>setTimeout(r,1500))
const chk=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'AGENCIAS!A1:E1'})
const h=(chk.data.values?.[0])||[]
console.log(`\nEncabezados ahora: ${h.slice(0,5).map(x=>x||'(vacío)').join(' | ')}`)
console.log(h[1]==='CUIT' ? '✅ VERIFICADO: B1 = "CUIT". La app ya puede leer el CUIT.'
                          : '❌ FALLÓ: B1 sigue sin título. NO dar por arreglado.')
