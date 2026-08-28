/**
 * Deja en el sheet la solapa FIJOS_TARJETA: el detalle de los gastos de
 * estructura que se pagan con tarjeta y que NO estaban anotados en
 * GASTOS_FIJOS. Es lo que pidió Mariana para el estado de resultados
 * (la fila "AGREGAR GASTOS TARJETA $0" que ella dejó marcada).
 *
 * Va al sheet y no a la app a propósito: Mariana trabaja acá (Regla de oro #4).
 *
 * Uso:  node scripts/fijos-tarjeta-a-sheet.mjs             (preview)
 *       node scripts/fijos-tarjeta-a-sheet.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim(); if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1)
  return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const HOJA='FIJOS_TARJETA'
const ESCRIBIR=process.argv.includes('--escribir')
const MESN=['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,
  ranges:['MOVIMIENTOS_TARJETA!A:N','GASTOS_FIJOS!A:Q'],valueRenderOption:'FORMATTED_VALUE'})
const obj=v=>{const [h,...f]=v.values||[];return f.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
const [MOV,GF]=R.data.valueRanges.map(obj)
const num=v=>{const n=parseFloat(String(v).replace(/[^0-9.-]/g,''));return isNaN(n)?0:n}
const fmt=n=>(n<0?'-$':'$')+Math.abs(Math.round(n)).toLocaleString('es-AR')

const FIJO=/^(software|seguros|oficina|telefon|internet)/i
const mov=MOV.filter(m=>/empresa/i.test(String(m['Categoria']||''))&&FIJO.test(String(m['Subcategoria']||'')))

// Cruce con GASTOS_FIJOS por palabras en común (≥3 letras), salteando genéricas
const STOP=new Set(['OFICINA','MAGMA','POLIZA','PÓLIZA','COBRO','DUPLICADO','REVERSO','TARJETA','GASTOS','AGREGAR','PLAN','PAGO','SALDO','ANUAL','RENOVACION','RENOVACIÓN',
  // genéricos: compartirlos no prueba que sea el mismo gasto ("SOFTWARE/ADS USD" no es "Ads (Gloria)")
  'ADS','SOFTWARE','WEB','USD','ARS','VARIOS','OTROS','SERVICIOS','SERVICIO','COSTOS','COSTO','MENSUAL','SUSCRIPCION','SUSCRIPCIONES'])
const toks=s=>new Set(String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
  .split(/[^A-Z0-9]+/).filter(t=>t.length>=3&&!STOP.has(t)&&!/^\d+$/.test(t)))
const gfAct=GF.filter(g=>{const a=String(g['Activo']||'').toUpperCase()
  // Las filas Categoria="Tarjeta" SON estos mismos gastos, cargados para que Mariana los
  // vea junto al resto. Cruzarlos contra sí mismos marcaría todo como "ya contado" y la
  // columna "falta sumar" daría cero: la solapa se autoanularía.
  if(/^tarjeta$/i.test(String(g['Categoria']||'').trim())) return false
  return (a===''||a==='SI'||a==='SÍ'||a==='TRUE')&&!/[uú]nico/i.test(String(g['Frecuencia']))&&num(g['Monto'])>0})
  .map(g=>({con:String(g['Concepto']||''),monto:num(g['Monto']),tk:toks(g['Concepto'])}))
const yaEnGF=c=>{const t=toks(c);return gfAct.find(g=>[...t].some(x=>g.tk.has(x)))}

// Agrupar por mes + comercio base: el sufijo entre paréntesis separa la póliza de
// su cobro duplicado y su reverso, que tienen que netearse entre sí
const base=s=>String(s||'').replace(/\s*\([^)]*\)\s*/g,' ').replace(/\s+/g,' ').trim().toUpperCase()||'(sin comercio)'
const G={}
mov.forEach(m=>{
  const mes=Number(m['Mes'])||0, anio=Number(String(m['Año']).match(/\d{4}/)?.[0])||0
  if(!mes||!anio) return
  const mon=String(m['Moneda']||'ARS').toUpperCase()
  const k=`${anio}-${String(mes).padStart(2,'0')}|${base(m['Comercio'])}|${mon}`
  const g=G[k]=G[k]||{anio,mes,com:base(m['Comercio']),sub:String(m['Subcategoria']||''),tarj:String(m['Tarjeta']||''),mon,neto:0,rev:false,n:0}
  g.neto+=num(m['Monto']); g.n++
  if(/reverso|duplicad/i.test(String(m['Comercio']))) g.rev=true
})
const lista=Object.values(G).filter(g=>Math.abs(g.neto)>0.5)
  .sort((a,b)=> (b.anio-a.anio)||(b.mes-a.mes)||(a.mon===b.mon? b.neto-a.neto : a.mon==='ARS'?-1:1))

const HEADERS=['Mes','Concepto','Rubro','Tarjeta','Monto ARS','Monto USD','¿Ya está en GASTOS_FIJOS?','Monto en GASTOS_FIJOS','Falta sumar al resultado','Notas']
const filas=lista.map(g=>{
  const y=yaEnGF(g.com), ars=g.mon==='USD'?'':g.neto, usd=g.mon==='USD'?g.neto:''
  const GENERICO=/^(seguros?|software|internet|movilidad|varios( empresa)?|otros)$/i
  const notas=[g.rev?'neto de un cobro duplicado + su reverso':'',
    g.n>1&&!g.rev?`${g.n} cargos en el mes`:'',
    GENERICO.test(g.com)?'⚠ línea agrupada — sin detalle de qué es':''].filter(Boolean).join(' · ')
  return [`'${MESN[g.mes]}-${g.anio}`, g.com, g.sub, g.tarj, ars, usd,
    y?'SI':'NO', y?y.monto:'', y?'':(g.mon==='USD'?'':g.neto), notas]
})
const totArs=lista.filter(g=>g.mon!=='USD').reduce((s,g)=>s+g.neto,0)
const totUsd=lista.filter(g=>g.mon==='USD').reduce((s,g)=>s+g.neto,0)
const falta=filas.reduce((s,f)=>s+(Number(f[8])||0),0)
const faltaUsd=lista.filter(g=>g.mon==='USD'&&!yaEnGF(g.com)).reduce((s,g)=>s+g.neto,0)

console.log(`\nSolapa "${HOJA}" · ${filas.length} filas · meses ${[...new Set(lista.map(g=>`${MESN[g.mes]}-${g.anio}`))].join(', ')}`)
console.log(`\nTotal en tarjeta:        ${fmt(totArs)}  +  US$ ${Math.round(totUsd)}`)
console.log(`Ya contado en GASTOS_FIJOS: ${fmt(totArs-falta)}`)
console.log(`FALTA SUMAR al resultado:   ${fmt(falta)}  +  US$ ${Math.round(faltaUsd)}   ← lo que Mariana no tenía\n`)
console.log(`${'MES'.padEnd(9)} ${'CONCEPTO'.padEnd(26)} ${'ARS'.padStart(11)} ${'USD'.padStart(7)}  ${'EN GF'.padEnd(6)} FALTA`)
console.log('-'.repeat(78))
filas.slice(0,14).forEach(f=>console.log(`${f[0].padEnd(9)} ${String(f[1]).slice(0,25).padEnd(26)} ${(f[4]?fmt(f[4]):'').padStart(11)} ${(f[5]?'US$'+Math.round(f[5]):'').padStart(7)}  ${f[6].padEnd(6)} ${f[8]?fmt(f[8]):''}`))
if(filas.length>14) console.log(`... y ${filas.length-14} filas más`)

if(!ESCRIBIR){ console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir. ---'); process.exit(0) }

// ── crear/limpiar la solapa ──
const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties(title,sheetId,gridProperties))'})
let hoja=meta.data.sheets.find(s=>s.properties.title===HOJA)
if(!hoja){
  const res=await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[{addSheet:{properties:{
    title:HOJA, gridProperties:{rowCount:Math.max(200,filas.length+20), columnCount:HEADERS.length, frozenRowCount:1}}}}]}})
  hoja={properties:res.data.replies[0].addSheet.properties}
  console.log(`\n✓ solapa "${HOJA}" creada`)
} else {
  await sheets.spreadsheets.values.clear({spreadsheetId:ID,range:HOJA})
  console.log(`\n✓ solapa "${HOJA}" ya existía — se reescribe`)
}
const sheetId=hoja.properties.sheetId

// Resumen por mes: es el número que va al estado de resultados. El TOTAL de la
// tabla es el acumulado de todos los meses cargados, no sirve como mensual.
const meses=[...new Set(lista.map(g=>`${g.anio}-${String(g.mes).padStart(2,'0')}`))].sort().reverse()
const resumen=meses.map(mk=>{
  const [a,m]=mk.split('-').map(Number)
  const del=lista.filter(g=>g.anio===a&&g.mes===m)
  const rA=del.filter(g=>g.mon!=='USD').reduce((s,g)=>s+g.neto,0)
  const rU=del.filter(g=>g.mon==='USD').reduce((s,g)=>s+g.neto,0)
  const fA=del.filter(g=>g.mon!=='USD'&&!yaEnGF(g.com)).reduce((s,g)=>s+g.neto,0)
  const fU=del.filter(g=>g.mon==='USD'&&!yaEnGF(g.com)).reduce((s,g)=>s+g.neto,0)
  return [`'${MESN[m]}-${a}`, rA, rU, fA, fU, del.length]
})
const TOTAL=[`TOTAL (${meses.length} meses)`,'','','',totArs,totUsd,'','',falta,'']
await sheets.spreadsheets.values.update({spreadsheetId:ID,range:`${HOJA}!A1`,valueInputOption:'USER_ENTERED',
  requestBody:{values:[HEADERS,...filas,[],TOTAL,
    [],['RESUMEN POR MES — este es el número que va al estado de resultados'],
    ['Mes','Total ARS','Total USD','Falta sumar ARS','Falta sumar USD','Conceptos'],
    ...resumen,
    [],['Cómo leerlo:'],
    ['· "Falta sumar al resultado" = gastos de estructura que se pagan con tarjeta y NO estaban en GASTOS_FIJOS.'],
    ['· Las filas con SI ya están contadas en GASTOS_FIJOS: sumarlas de nuevo las duplica.'],
    ['· El resumen entero de la tarjeta ya se cuenta como egreso del mes. Esta solapa es el desglose por naturaleza del gasto, no un egreso aparte.'],
    ['· Los dólares se pagan aparte del monto en pesos del resumen.'],
    ['· Julio 2026 es el mes con la carga más completa; los meses anteriores tienen cargas agrupadas (ej. una línea "SOFTWARE" por varias suscripciones).'],
    ['· Se regenera con: node scripts/fijos-tarjeta-a-sheet.mjs --escribir'],
  ]}})

// ── formato: que se vea bien, no solo que esté (Regla de oro #4) ──
const NEG={red:.035,green:.035,blue:.035}, BLANCO={red:1,green:1,blue:1}
const fin=filas.length+1, filaTot=filas.length+3
const resIni=filas.length+6, resFin=resIni+resumen.length   // bloque "resumen por mes" (0-based para la API)
const money={numberFormat:{type:'NUMBER',pattern:'"$"#,##0'}}
const reqs=[
  {repeatCell:{range:{sheetId,startRowIndex:0,endRowIndex:1},
    cell:{userEnteredFormat:{backgroundColor:NEG,textFormat:{foregroundColor:BLANCO,bold:true,fontSize:10},
      verticalAlignment:'MIDDLE',wrapStrategy:'WRAP'}},fields:'userEnteredFormat'}},
  {updateSheetProperties:{properties:{sheetId,gridProperties:{frozenRowCount:1}},fields:'gridProperties.frozenRowCount'}},
  {repeatCell:{range:{sheetId,startRowIndex:1,endRowIndex:fin,startColumnIndex:4,endColumnIndex:6},
    cell:{userEnteredFormat:money},fields:'userEnteredFormat.numberFormat'}},
  {repeatCell:{range:{sheetId,startRowIndex:1,endRowIndex:fin,startColumnIndex:7,endColumnIndex:9},
    cell:{userEnteredFormat:money},fields:'userEnteredFormat.numberFormat'}},
  {repeatCell:{range:{sheetId,startRowIndex:filaTot-1,endRowIndex:filaTot,startColumnIndex:0,endColumnIndex:10},
    cell:{userEnteredFormat:{textFormat:{bold:true},backgroundColor:{red:.96,green:.95,blue:.93},...money}},
    fields:'userEnteredFormat(textFormat,backgroundColor,numberFormat)'}},
  // lo que falta sumar, en rojo Magma: es lo que Mariana tiene que agregar
  {addConditionalFormatRule:{rule:{ranges:[{sheetId,startRowIndex:1,endRowIndex:fin,startColumnIndex:6,endColumnIndex:7}],
    booleanRule:{condition:{type:'TEXT_EQ',values:[{userEnteredValue:'NO'}]},
      format:{backgroundColor:{red:.984,green:.918,blue:.925},textFormat:{foregroundColor:{red:.808,green:.149,blue:.216},bold:true}}}},index:0}},
  {addConditionalFormatRule:{rule:{ranges:[{sheetId,startRowIndex:1,endRowIndex:fin,startColumnIndex:6,endColumnIndex:7}],
    booleanRule:{condition:{type:'TEXT_EQ',values:[{userEnteredValue:'SI'}]},
      format:{textFormat:{foregroundColor:{red:.66,green:.64,blue:.60}}}}},index:1}},
  {setBasicFilter:{filter:{range:{sheetId,startRowIndex:0,endRowIndex:fin,startColumnIndex:0,endColumnIndex:10}}}},
  // bloque "resumen por mes"
  {repeatCell:{range:{sheetId,startRowIndex:resIni-2,endRowIndex:resIni-1,startColumnIndex:0,endColumnIndex:10},
    cell:{userEnteredFormat:{textFormat:{bold:true,fontSize:11,foregroundColor:{red:.808,green:.149,blue:.216}}}},fields:'userEnteredFormat.textFormat'}},
  {repeatCell:{range:{sheetId,startRowIndex:resIni-1,endRowIndex:resIni,startColumnIndex:0,endColumnIndex:6},
    cell:{userEnteredFormat:{backgroundColor:NEG,textFormat:{foregroundColor:BLANCO,bold:true,fontSize:10}}},fields:'userEnteredFormat'}},
  {repeatCell:{range:{sheetId,startRowIndex:resIni,endRowIndex:resFin,startColumnIndex:1,endColumnIndex:5},
    cell:{userEnteredFormat:money},fields:'userEnteredFormat.numberFormat'}},
  {repeatCell:{range:{sheetId,startRowIndex:resIni,endRowIndex:resFin,startColumnIndex:3,endColumnIndex:5},
    cell:{userEnteredFormat:{textFormat:{bold:true,foregroundColor:{red:.808,green:.149,blue:.216}}}},fields:'userEnteredFormat.textFormat'}},
]
;[[0,70],[1,210],[2,190],[3,110],[4,105],[5,90],[6,120],[7,130],[8,140],[9,230]].forEach(([c,px])=>
  reqs.push({updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:c,endIndex:c+1},properties:{pixelSize:px},fields:'pixelSize'}}))
await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:reqs}})

// ── verificar releyendo ──
const v=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:`${HOJA}!A1:J${filaTot}`,valueRenderOption:'UNFORMATTED_VALUE'})
const V=v.data.values||[]
const leidoTot=Number(V[filaTot-1]?.[4]||0), leidoFalta=Number(V[filaTot-1]?.[8]||0)
console.log(`✓ ${V.length-1} filas escritas`)
console.log(`✓ total ARS en el sheet ${fmt(leidoTot)} ${Math.abs(leidoTot-totArs)<1?'= calculado ✓':'≠ CALCULADO '+fmt(totArs)+' ✗'}`)
console.log(`✓ falta sumar en el sheet ${fmt(leidoFalta)} ${Math.abs(leidoFalta-falta)<1?'= calculado ✓':'≠ CALCULADO '+fmt(falta)+' ✗'}`)
const sumaRes=resumen.reduce((a,r)=>a+r[3],0)
console.log(`✓ resumen por mes: ${resumen.length} meses · suma de "falta sumar" ${fmt(sumaRes)} ${Math.abs(sumaRes-falta)<1?'= total ✓':'≠ TOTAL ✗'}`)
console.log(`\n  mes a mes (lo que falta sumar):`)
resumen.forEach(r=>console.log(`   ${String(r[0]).padEnd(9)} ${fmt(r[3]).padStart(12)}${r[4]?'  + US$ '+Math.round(r[4]):''}`))
console.log(`\nhttps://docs.google.com/spreadsheets/d/${ID}/edit#gid=${sheetId}`)
try{ await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',
  requestBody:{values:[[new Date().toISOString(),'juan (script)','fijos-tarjeta-a-sheet',HOJA,String(filas.length),`falta sumar ${fmt(falta)}`]]}}) }catch(e){}
