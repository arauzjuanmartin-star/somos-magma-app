/**
 * Completa el préstamo BBVA (#118-023008/6, $10M, 12 cuotas) con el desglose del
 * cuadro de marcha: capital / interés / impuestos por cuota. Y marca la cuota 2 como pagada.
 *
 * Mariana pidió separar capital de interés: el capital NO es gasto del estado de resultados
 * (reduce la deuda), solo interés + impuestos lo son. La cuota entera sí sale de caja.
 *
 *   node scripts/prestamo-bbva-completar.mjs        -> preview
 *   node scripts/prestamo-bbva-completar.mjs --go   -> aplica
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const GO=process.argv.includes('--go')
const txt=v=>String(v??'').trim()
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const colL=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);}return s}

// Cuadro de marcha BBVA (del PDF): cuota -> [capital, interés, impuestos]
const CUADRO={
  1:[711654.87,282500.00,52566.78], 2:[731759.12,262395.75,48520.45],
  3:[752431.32,241723.55,44979.20], 4:[773687.50,220467.37,41023.92],
  5:[795544.17,198610.70,36725.75], 6:[818018.29,176136.58,32774.96],
  7:[841127.31,153027.56,28296.82], 8:[864889.16,129265.71,24053.37],
  9:[889322.28,104832.59,19506.92], 10:[914445.63,79709.24,14553.75],
  11:[940278.72,53876.15,10025.10], 12:[966841.63,27313.28,5050.56],
}
// Pagos confirmados (del comprobante): cuota -> fecha
const PAGADAS={1:'16/6/2026', 2:'15/7/2026'}

const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PRESTAMOS'})
const P=r.data.values||[], H=P[0]
const idx=n=>H.findIndex(h=>txt(h).toLowerCase()===n.toLowerCase())

// 1) columnas de desglose (agregar al final si faltan)
let anchoH=H.length
const nuevasCols=[]
const colDe={}
;['Capital','Interes','Impuestos'].forEach(n=>{
  let c=idx(n)
  if(c<0){ c=anchoH+nuevasCols.length; nuevasCols.push(n); }
  colDe[n]=c
})
const iCuota=idx('Cuota nro'), iPag=idx('Pagado'), iFP=idx('Fecha pago'), iNota=idx('Notas'), iDeu=idx('Deudor'), iAcr=idx('Acreedor')

const updates=[]
const setCell=(fila,col,val)=>updates.push({range:`PRESTAMOS!${colL(col)}${fila}`,values:[[val]]})

console.log(`\n${'='.repeat(70)}\n${GO?'APLICANDO':'PREVIEW — no escribe nada'}\n${'='.repeat(70)}`)
if(nuevasCols.length) console.log(`\n▸ COLUMNAS NUEVAS: ${nuevasCols.map((n,i)=>colL(anchoH+i)+' → '+n).join(' · ')}`)

console.log(`\n▸ BBVA #118-023008/6 — desglose por cuota:\n`)
console.log(`   ${'CUOTA'.padEnd(7)}${'CAPITAL'.padStart(14)}${'INTERÉS'.padStart(13)}${'IMPUESTOS'.padStart(13)}${'ESTADO'.padStart(12)}`)
let nMatch=0, sinCuadro=[]
P.forEach((row,i)=>{
  if(i===0||!/bbva/i.test(txt(row[0])))return
  const m=txt(row[iCuota]).match(/(\d+)/); if(!m)return
  const cn=+m[1]; const cu=CUADRO[cn]; if(!cu){sinCuadro.push(cn);return}
  nMatch++
  const fila=i+1
  const [cap,int,imp]=cu
  setCell(fila,colDe['Capital'],cap); setCell(fila,colDe['Interes'],int); setCell(fila,colDe['Impuestos'],imp)
  let estado=txt(row[iPag]).toUpperCase()==='SI'?'ya SÍ':''
  if(PAGADAS[cn] && txt(row[iPag]).toUpperCase()!=='SI'){ setCell(fila,iPag,'SI'); setCell(fila,iFP,PAGADAS[cn]); estado='→ PAGADA '+PAGADAS[cn] }
  else if(PAGADAS[cn]) estado='pagada ✓'
  console.log(`   ${('#'+cn).padEnd(7)}${money(cap).padStart(14)}${money(int).padStart(13)}${money(imp).padStart(13)}${estado.padStart(12)}`)
})
// datos de la obligación (una vez, en todas las filas para que quede el nº)
P.forEach((row,i)=>{ if(i===0||!/bbva/i.test(txt(row[0])))return
  if(iDeu>=0 && !txt(row[iDeu])) setCell(i+1,iDeu,'Somos Magma SRL')
  if(iAcr>=0 && !txt(row[iAcr])) setCell(i+1,iAcr,'BBVA Francés')
})

const totCap=Object.values(CUADRO).reduce((s,c)=>s+c[0],0)
const totInt=Object.values(CUADRO).reduce((s,c)=>s+c[1],0)
const totImp=Object.values(CUADRO).reduce((s,c)=>s+c[2],0)
console.log(`   ${'─'.repeat(59)}`)
console.log(`   ${'TOTAL'.padEnd(7)}${money(totCap).padStart(14)}${money(totInt).padStart(13)}${money(totImp).padStart(13)}`)
console.log(`\n   Capital $10M (lo que se devuelve) · Interés+impuestos ${money(totInt+totImp)} (el costo real del préstamo)`)
console.log(`   Cuota mensual: ~${money((totCap+totInt+totImp)/12)} · quedan 10 cuotas por pagar (ago-2026 a may-2027)`)
if(sinCuadro.length) console.log(`\n   ⚠️ cuotas sin dato en el cuadro: ${sinCuadro.join(', ')}`)

console.log(`\n▸ ${updates.length} celdas a escribir${nuevasCols.length?` (+ ${nuevasCols.length} títulos de columna)`:''}`)
if(!GO){ console.log(`\nPara aplicar:  node scripts/prestamo-bbva-completar.mjs --go\n`); process.exit(0) }

if(nuevasCols.length){
  // La grilla física puede ser más chica que donde queremos escribir: agrandarla primero.
  const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties(title,sheetId,gridProperties))'})
  const sh=meta.data.sheets.find(s=>s.properties.title==='PRESTAMOS')
  const colsActuales=sh.properties.gridProperties.columnCount
  const necesarias=anchoH+nuevasCols.length
  if(colsActuales<necesarias){
    await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[
      {appendDimension:{sheetId:sh.properties.sheetId,dimension:'COLUMNS',length:necesarias-colsActuales}}
    ]}})
    console.log(`\n✓ grilla agrandada a ${necesarias} columnas`)
  }
  await sheets.spreadsheets.values.update({spreadsheetId:ID,range:`PRESTAMOS!${colL(anchoH)}1:${colL(anchoH+nuevasCols.length-1)}1`,valueInputOption:'RAW',requestBody:{values:[nuevasCols]}})
  console.log(`✓ ${nuevasCols.length} columnas nuevas`)
}
await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'RAW',data:updates}})
console.log(`✓ ${updates.length} celdas escritas`)
console.log(`\n✅ BBVA completo. Ahora falta cargar: Galicia $15M (19 cuotas), Galicia $11,5M (23), Santander #081286 (13), Santander #080351 (11).`)
