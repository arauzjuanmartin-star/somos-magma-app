/**
 * Agrega la columna "Medio de pago" a GASTOS_FIJOS y la completa para los
 * gastos que se pagan con tarjeta.
 *
 * La idea es de Juan: la CATEGORIA dice qué es el gasto (Operativos, Sueldos,
 * Impuestos) y el MEDIO DE PAGO dice cómo se paga (Tarjeta, Débito automático,
 * Transferencia, Home banking, Efectivo). Son dos cosas distintas y antes
 * estaban mezcladas: los gastos de tarjeta habían quedado con Categoria=
 * "Tarjeta", que borraba de qué tipo de gasto se trataba.
 *
 * Lo que se paga con tarjeta NO se suma al total de Egresos: ya viene dentro
 * del resumen de la tarjeta, que se cuenta entero. Antes eso pasaba solo con
 * las filas nuevas; Adobe, Edenor, ABL, Metrogas e Internet estaban contados
 * dos veces ($206.258 por mes).
 *
 * Uso:  node scripts/gastos-medio-de-pago.mjs             (preview)
 *       node scripts/gastos-medio-de-pago.mjs --escribir
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
const COL='Medio de pago'
const MEDIOS=['Tarjeta','Débito automático','Transferencia','Home banking','Efectivo']
const fmt=n=>'$'+Math.round(n).toLocaleString('es-AR')
const num=v=>{const n=parseFloat(String(v).replace(/[^0-9.-]/g,''));return isNaN(n)?0:n}
const colLetra=n=>{let s='';n++;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=(n-m-1)/26}return s}

const meta=await sheets.spreadsheets.get({spreadsheetId:ID,ranges:['GASTOS_FIJOS'],
  fields:'sheets(properties(title,sheetId,gridProperties))'})
const hoja=meta.data.sheets.find(s=>s.properties.title==='GASTOS_FIJOS')
const sheetId=hoja.properties.sheetId
const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'GASTOS_FIJOS!A:Z'})
const V=r.data.values||[], H=V[0]
const iCat=H.indexOf('Categoria'), iCon=H.indexOf('Concepto'), iMon=H.indexOf('Monto')
const iMoneda=H.indexOf('Moneda'), iPC=H.indexOf('Persona/Cuenta'), iAct=H.indexOf('Activo'), iFrec=H.indexOf('Frecuencia')
let iMedio=H.indexOf(COL)

// Qué se paga con tarjeta: lo que ya está marcado Categoria="Tarjeta" (lo que cargamos
// desde los resúmenes) más los cinco que estaban duplicados en Operativos.
const DUPLICADOS=/^(adobe|edenor|abl|metrogas|internet \(personal flow\))$/i
const filas=V.slice(1).map((f,k)=>({f, fila:k+2}))
  .filter(({f})=>/^tarjeta$/i.test(String(f[iCat]||'').trim()) || DUPLICADOS.test(String(f[iCon]||'').trim()))

console.log(`\nGASTOS_FIJOS · columna "${COL}" ${iMedio>=0?`ya existe (${colLetra(iMedio)})`:'se agrega al final'}`)
console.log(`Valores posibles: ${MEDIOS.join(' · ')}\n`)
console.log(`Se marcan como "Tarjeta" ${filas.length} gastos:\n`)
console.log(`${'FILA'.padStart(4)} ${'CATEGORIA'.padEnd(12)} ${'CONCEPTO'.padEnd(30)} ${'MONTO'.padStart(12)}  QUÉ CAMBIA`)
console.log('-'.repeat(96))
const ups=[]
let bajaTotal=0
for(const {f,fila} of filas){
  const cat=String(f[iCat]||'').trim(), con=String(f[iCon]||'').trim()
  const esUsd=String(f[iMoneda]||'').toUpperCase()==='USD'
  const m=esUsd?`US$ ${num(f[iMon])}`:fmt(num(f[iMon]))
  let cambio=''
  if(/^tarjeta$/i.test(cat)){
    // devolverle la categoría real: "Tarjeta" era el medio, no el tipo de gasto
    cambio='Categoria "Tarjeta" → "Operativos"'
    ups.push({fila, col:iCat, val:'Operativos'})
  } else {
    // estos ya estaban bien categorizados; solo estaban contados dos veces
    const activo=String(f[iAct]||'').toUpperCase()
    if(activo===''||activo==='SI'||activo==='SÍ'||activo==='TRUE') bajaTotal+=num(f[iMon])
    cambio=`ya no se suma aparte (viene en el resumen) → −${fmt(num(f[iMon]))}`
  }
  console.log(`${String(fila).padStart(4)} ${cat.padEnd(12)} ${con.slice(0,29).padEnd(30)} ${m.padStart(12)}  ${cambio}`)
}
console.log('-'.repeat(96))
console.log(`\nEfecto en el total de gastos fijos del mes: −${fmt(bajaTotal)} (el doble conteo que ya existía)`)
console.log(`El resto de las filas quedan con "${COL}" vacío para completar a mano.`)

if(!ESCRIBIR){ console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir. ---'); process.exit(0) }

// 1) crear la columna si no está
if(iMedio<0){
  iMedio=H.length
  await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[
    {appendDimension:{sheetId,dimension:'COLUMNS',length:1}},
    {copyPaste:{source:{sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:1},
      destination:{sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:iMedio,endColumnIndex:iMedio+1},pasteType:'PASTE_FORMAT'}},
    {updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:iMedio,endIndex:iMedio+1},
      properties:{pixelSize:150},fields:'pixelSize'}},
    // desplegable, para que nadie escriba variantes del mismo medio
    {setDataValidation:{range:{sheetId,startRowIndex:1,endRowIndex:hoja.properties.gridProperties.rowCount,
      startColumnIndex:iMedio,endColumnIndex:iMedio+1},
      rule:{condition:{type:'ONE_OF_LIST',values:MEDIOS.map(v=>({userEnteredValue:v}))},showCustomUi:true,strict:false}}},
  ]}})
  await sheets.spreadsheets.values.update({spreadsheetId:ID,range:`GASTOS_FIJOS!${colLetra(iMedio)}1`,
    valueInputOption:'USER_ENTERED',requestBody:{values:[[COL]]}})
}
// 2) escribir los valores
const data=[...ups.map(u=>({range:`GASTOS_FIJOS!${colLetra(u.col)}${u.fila}`,values:[[u.val]]})),
  ...filas.map(({fila})=>({range:`GASTOS_FIJOS!${colLetra(iMedio)}${fila}`,values:[['Tarjeta']]}))]
await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data}})

// 3) verificar
const v2=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'GASTOS_FIJOS!A:Z'})
const V2=v2.data.values||[], H2=V2[0], iM2=H2.indexOf(COL), iC2=H2.indexOf('Categoria')
const conTarjeta=V2.slice(1).filter(f=>String(f[iM2]||'').trim()==='Tarjeta')
const quedanCat=V2.slice(1).filter(f=>/^tarjeta$/i.test(String(f[iC2]||'').trim()))
console.log(`\n✓ columna "${COL}" en ${colLetra(iM2)}`)
console.log(`✓ ${conTarjeta.length} gastos con Medio de pago = "Tarjeta" (esperados ${filas.length})`)
console.log(quedanCat.length ? `⚠ quedan ${quedanCat.length} con Categoria="Tarjeta": ${quedanCat.map(f=>f[H2.indexOf('Concepto')]).join(', ')}` : '✓ ya nadie tiene Categoria="Tarjeta"')
const sinMedio=V2.slice(1).filter(f=>String(f[H2.indexOf('Concepto')]||'').trim()&&!String(f[iM2]||'').trim()).length
console.log(`ℹ ${sinMedio} gastos quedan sin medio de pago, para completar a mano`)
try{ await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',
  requestBody:{values:[[new Date().toISOString(),'juan (script)','gastos-medio-de-pago','GASTOS_FIJOS',colLetra(iM2),`${conTarjeta.length} con Tarjeta`]]}}) }catch(e){}
