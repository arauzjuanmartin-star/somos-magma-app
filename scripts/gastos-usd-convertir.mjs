/**
 * Convierte a pesos los gastos cargados en dólares de GASTOS_FIJOS, dejando a la
 * vista cuántos dólares son.
 *
 * El problema: las suscripciones estaban con Monto=388,50 y Moneda=USD. Todo lo que
 * suma la columna Monto (la app, numeros-base, el modelo de Mariana) las contaba
 * como $388,50 en vez de $578.477. Eran US$709,72/mes = más de un millón de pesos
 * de estructura que no se veían.
 *
 * Cómo queda cada gasto:
 *   Monto        → el importe EN PESOS (lo que suman todos los cálculos)
 *   Moneda       → ARS
 *   Monto USD    → cuántos dólares son (queda a la vista)
 *   Cotización   → a cuánto se convirtió
 *
 * La cotización sale del último resumen real, no de un valor inventado: el Amex de
 * junio convirtió US$388,50 a $578.476,50. Cuando llegue un resumen nuevo, actualizar
 * el TC acá y volver a correrlo: recalcula todo.
 *
 * Uso:  node scripts/gastos-usd-convertir.mjs             (preview)
 *       node scripts/gastos-usd-convertir.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim(); if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1)
  return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR=process.argv.includes('--escribir')
// Del resumen de Santander Amex, cierre 02/07/2026: US$388,50 → $578.476,50
const TC=578476.50/388.50, TC_FUENTE='resumen Amex jun-2026'
const NUEVAS=['Monto USD','Cotización']
const fmt=n=>'$'+Math.round(n).toLocaleString('es-AR')
const num=v=>{const n=parseFloat(String(v).replace(/[^0-9.-]/g,''));return isNaN(n)?0:n}
const colLetra=n=>{let s='';n++;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=(n-m-1)/26}return s}

const meta=await sheets.spreadsheets.get({spreadsheetId:ID,ranges:['GASTOS_FIJOS'],
  fields:'sheets(properties(title,sheetId,gridProperties))'})
const hoja=meta.data.sheets.find(s=>s.properties.title==='GASTOS_FIJOS')
const sheetId=hoja.properties.sheetId
const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'GASTOS_FIJOS!A:Z'})
const V=r.data.values||[], H=[...V[0]]
const iCon=H.indexOf('Concepto'), iMon=H.indexOf('Monto'), iMoneda=H.indexOf('Moneda')

// gastos que hoy están en dólares (o que ya se convirtieron y hay que recalcular)
const iUsdPrev=H.indexOf('Monto USD')
const objetivo=V.slice(1).map((f,k)=>({f,fila:k+2})).filter(({f})=>
  String(f[iMoneda]||'').toUpperCase()==='USD' || (iUsdPrev>=0 && num(f[iUsdPrev])>0))

console.log(`\nCotización: $${TC.toFixed(2)}/USD  (${TC_FUENTE})\n`)
console.log(`${'CONCEPTO'.padEnd(30)} ${'USD'.padStart(9)} ${'EN PESOS'.padStart(13)}   ${'MONTO HOY'.padStart(13)}`)
console.log('-'.repeat(74))
let totUsd=0, totArs=0, totHoy=0
for(const {f} of objetivo){
  const usd = iUsdPrev>=0 && num(f[iUsdPrev])>0 ? num(f[iUsdPrev]) : num(f[iMon])
  const ars = usd*TC, hoy = num(f[iMon])
  totUsd+=usd; totArs+=ars; totHoy+=hoy
  console.log(`${String(f[iCon]).slice(0,29).padEnd(30)} ${usd.toFixed(2).padStart(9)} ${fmt(ars).padStart(13)}   ${fmt(hoy).padStart(13)}`)
}
console.log('-'.repeat(74))
console.log(`${'TOTAL'.padEnd(30)} ${totUsd.toFixed(2).padStart(9)} ${fmt(totArs).padStart(13)}   ${fmt(totHoy).padStart(13)}`)
console.log(`\nLa estructura mensual sube ${fmt(totArs-totHoy)}: es plata que ya se gasta y no se veía.`)

if(!ESCRIBIR){ console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir. ---'); process.exit(0) }

// 1) columnas nuevas
const reqs=[], idx={}
for(const nombre of NUEVAS){
  let i=H.indexOf(nombre)
  if(i<0){ i=H.length; H.push(nombre)
    reqs.push({appendDimension:{sheetId,dimension:'COLUMNS',length:1}},
      {copyPaste:{source:{sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:1},
        destination:{sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:i,endColumnIndex:i+1},pasteType:'PASTE_FORMAT'}},
      {updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:i,endIndex:i+1},
        properties:{pixelSize:110},fields:'pixelSize'}})
  }
  idx[nombre]=i
}
if(reqs.length) await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:reqs}})
const data=NUEVAS.filter(n=>V[0].indexOf(n)<0).map(n=>({range:`GASTOS_FIJOS!${colLetra(idx[n])}1`,values:[[n]]}))
// formatos: dólares con US$ y la cotización con $
data.push()
for(const {f,fila} of objetivo){
  const usd = iUsdPrev>=0 && num(f[iUsdPrev])>0 ? num(f[iUsdPrev]) : num(f[iMon])
  data.push({range:`GASTOS_FIJOS!${colLetra(iMon)}${fila}`,values:[[Math.round(usd*TC*100)/100]]})
  data.push({range:`GASTOS_FIJOS!${colLetra(iMoneda)}${fila}`,values:[['ARS']]})
  data.push({range:`GASTOS_FIJOS!${colLetra(idx['Monto USD'])}${fila}`,values:[[usd]]})
  data.push({range:`GASTOS_FIJOS!${colLetra(idx['Cotización'])}${fila}`,values:[[Math.round(TC*100)/100]]})
}
await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data}})
await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[
  {repeatCell:{range:{sheetId,startRowIndex:1,endRowIndex:hoja.properties.gridProperties.rowCount,
    startColumnIndex:idx['Monto USD'],endColumnIndex:idx['Monto USD']+1},
    cell:{userEnteredFormat:{numberFormat:{type:'NUMBER',pattern:'"US$ "#,##0.00'}}},fields:'userEnteredFormat.numberFormat'}},
  {repeatCell:{range:{sheetId,startRowIndex:1,endRowIndex:hoja.properties.gridProperties.rowCount,
    startColumnIndex:idx['Cotización'],endColumnIndex:idx['Cotización']+1},
    cell:{userEnteredFormat:{numberFormat:{type:'NUMBER',pattern:'"$"#,##0.00'}}},fields:'userEnteredFormat.numberFormat'}},
]}})

// 2) verificar
const v2=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'GASTOS_FIJOS!A:Z',valueRenderOption:'UNFORMATTED_VALUE'})
const V2=v2.data.values||[], H2=V2[0]
const j={con:H2.indexOf('Concepto'),mon:H2.indexOf('Monto'),moneda:H2.indexOf('Moneda'),usd:H2.indexOf('Monto USD'),tc:H2.indexOf('Cotización')}
const conv=V2.slice(1).filter(f=>Number(f[j.usd])>0)
console.log(`\n✓ ${conv.length} gastos convertidos (esperados ${objetivo.length})`)
let ok=true
conv.forEach(f=>{const esp=Number(f[j.usd])*Number(f[j.tc])
  if(Math.abs(Number(f[j.mon])-esp)>1){ ok=false; console.log(`   ✗ ${f[j.con]}: ${f[j.mon]} ≠ ${esp.toFixed(2)}`) }})
console.log(ok?'✓ todos los montos = USD × cotización':'✗ hay montos que no cierran')
const quedanUsd=V2.slice(1).filter(f=>String(f[j.moneda]||'').toUpperCase()==='USD').length
console.log(quedanUsd?`⚠ quedan ${quedanUsd} con Moneda=USD`:'✓ ya no queda ningún Monto en dólares sin convertir')
console.log(`\n   ${'CONCEPTO'.padEnd(30)} ${'USD'.padStart(9)}  ${'PESOS'.padStart(13)}`)
conv.forEach(f=>console.log(`   ${String(f[j.con]).slice(0,29).padEnd(30)} ${Number(f[j.usd]).toFixed(2).padStart(9)}  ${fmt(Number(f[j.mon])).padStart(13)}`))
try{ await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',
  requestBody:{values:[[new Date().toISOString(),'juan (script)','gastos-usd-convertir','GASTOS_FIJOS',String(conv.length),`TC ${TC.toFixed(2)} · ${TC_FUENTE}`]]}}) }catch(e){}
