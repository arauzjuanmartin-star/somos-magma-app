/**
 * Carga en SOCIOS_MOVIMIENTOS los movimientos de Sofi (mayo–julio 2026) y saca de la
 * solapa SUELDOS las filas de socios, que quedaban como segunda fuente contradictoria.
 * Fuente: resumen que armó Sofi + cronograma de PRESTAMOS para las cuotas.
 * Requiere --confirmar.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const CONFIRMAR=process.argv.includes('--confirmar')
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')

// SOCIOS_MOVIMIENTOS: [0]Fecha [1]Socio [2]Dirección [3]Concepto [4]Monto [5]Cuenta [6]Referencia [7]Notas [8]Fuente
const NUEVAS=[
  ['4/5/2026','Sofi','Magma→Socio','Cuota Santander compartido (50% que es de Sofi)',356659.50,'Santander','#810-03510008128/6 cuota 8/18','el otro 50% es deuda propia de Magma','Cronograma PRESTAMOS'],
  ['10/5/2026','Sofi','Magma→Socio','Cuota Santander personal (100% Sofi)',297173,'Santander','#810-03510008035/1 cuota 9/12','','Cronograma PRESTAMOS'],
  ['31/5/2026','Sofi','Magma→Socio','Pago tarjeta Visa Galicia',600000,'Galicia','','día estimado — Sofi informó el mes','Resumen Sofi'],
  ['31/5/2026','Sofi','Magma→Socio','Pago tarjeta Visa Galicia',217230,'Galicia','','+ USD 4,80 sin convertir · día estimado','Resumen Sofi'],
  ['31/5/2026','Sofi','Magma→Socio','Pago psicóloga',86000,'Santander (cta. Lulu)','','pagado por cuenta de Lulu · día estimado','Resumen Sofi'],
  ['4/6/2026','Sofi','Magma→Socio','Cuota Santander compartido (50% que es de Sofi)',354605.50,'Santander','#810-03510008128/6 cuota 9/18','','Cronograma PRESTAMOS'],
  ['10/6/2026','Sofi','Magma→Socio','Cuota Santander personal (100% Sofi)',294603,'Santander','#810-03510008035/1 cuota 10/12','','Cronograma PRESTAMOS'],
  ['30/6/2026','Sofi','Magma→Socio','Haberes (usados para pagar Visa personal)',2800000,'','','día estimado — Sofi informó el mes','Resumen Sofi'],
  ['30/6/2026','Sofi','Magma→Socio','Pago tarjeta Visa Galicia',474630,'Galicia','','día estimado','Resumen Sofi'],
  ['4/7/2026','Sofi','Magma→Socio','Cuota Santander compartido (50% que es de Sofi)',352443.50,'Santander','#810-03510008128/6 cuota 10/18','','Cronograma PRESTAMOS'],
  ['10/7/2026','Sofi','Magma→Socio','Cuota Santander personal (100% Sofi)',291898,'Santander','#810-03510008035/1 cuota 11/12','','Cronograma PRESTAMOS'],
  ['31/7/2026','Sofi','Socio→Magma','Préstamo en efectivo a Magma',600000,'Efectivo','','día estimado','Resumen Sofi'],
]
const meta=await sheets.spreadsheets.get({spreadsheetId:ID})
const idSueldos=meta.data.sheets.find(s=>s.properties.title==='SUELDOS').properties.sheetId
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['SOCIOS_MOVIMIENTOS','SUELDOS'],valueRenderOption:'FORMATTED_VALUE'})
const [SM,SU]=R.data.valueRanges.map(v=>v.values||[])

console.log(`\n■ 1 · CARGAR EN SOCIOS_MOVIMIENTOS  (${NUEVAS.length} filas de Sofi)\n`)
console.log(`   ${'fecha'.padEnd(11)} ${'dirección'.padEnd(13)} ${'concepto'.padEnd(46)} ${'monto'.padStart(13)}`)
NUEVAS.forEach(n=>console.log(`   ${n[0].padEnd(11)} ${n[2].padEnd(13)} ${n[3].slice(0,44).padEnd(46)} ${M(n[4]).padStart(13)}`))
const yaHay=SM.slice(1).filter(r=>r&&/sofi/i.test(txt(r[1]))).length
console.log(`\n   filas de Sofi que ya existen: ${yaHay}${yaHay?'  ⚠️ REVISAR, podría duplicar':'  ✓ ninguna, no hay riesgo de duplicar'}`)

console.log(`\n■ 2 · SACAR LOS SOCIOS DE LA SOLAPA SUELDOS`)
console.log(`   (quedaba como segunda fuente y contradice SOCIOS_MOVIMIENTOS —\n    ej: dice que a Sofi se le pagó mayo el 9/5, y ella dice que no lo cobró)\n`)
const borrar=[]
SU.slice(1).forEach((r,i)=>{ if(!r)return
  const p=txt(r[2])
  if(!/^(sofi|juan)/i.test(p))return
  borrar.push({fila:i+2, mes:txt(r[0]), anio:txt(r[1]), pers:p, tipo:txt(r[3]), monto:num(r[4]), pagado:txt(r[6]), fp:txt(r[7])}) })
borrar.forEach(b=>console.log(`   fila ${String(b.fila).padStart(4)}  ${b.mes.padEnd(10)} ${b.anio}  ${b.pers.padEnd(8)} ${b.tipo.padEnd(11)} ${M(b.monto).padStart(12)}  pagado=${b.pagado} ${b.fp}`))
console.log(`\n   ${borrar.length} filas a borrar de SUELDOS. El equipo (Dani/Lulu/Tom) NO se toca.`)

if(!CONFIRMAR){ console.log(`\n   SIMULACIÓN — nada se escribió. Ejecutar con --confirmar\n`); process.exit(0) }
if(yaHay){ console.log(`\n   ✋ Ya hay filas de Sofi cargadas. Abortando para no duplicar.\n`); process.exit(1) }

// backup de SUELDOS antes de tocar histórico
const hoy=new Date()
const nb=`SUELDOS_backup_${String(hoy.getDate()).padStart(2,'0')}-${String(hoy.getMonth()+1).padStart(2,'0')}`
await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[
  {duplicateSheet:{sourceSheetId:idSueldos,newSheetName:nb,insertSheetIndex:meta.data.sheets.length}}]}})
console.log(`\n   ✓ backup de SUELDOS creado: "${nb}"`)

await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'SOCIOS_MOVIMIENTOS!A:I',
  valueInputOption:'USER_ENTERED', insertDataOption:'INSERT_ROWS', requestBody:{values:NUEVAS}})
console.log(`\n   ✓ ${NUEVAS.length} movimientos de Sofi cargados`)
if(borrar.length){
  const filas=borrar.map(b=>b.fila).sort((a,b)=>b-a)
  await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:
    filas.map(f=>({deleteDimension:{range:{sheetId:idSueldos,dimension:'ROWS',startIndex:f-1,endIndex:f}}}))}})
  console.log(`   ✓ ${borrar.length} filas de socios sacadas de SUELDOS`)
}
console.log('')
