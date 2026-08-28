/**
 * Carga lo que falta de Santander, leído de los resúmenes de cuenta de Sofi
 * (cuenta 810-012707/9), cierres 28/05, 02/07 y 30/07 de 2026:
 *
 *   1. El resumen de Amex de julio (cierre 30/07, vto 10/08).
 *   2. Los costos bancarios de la cuenta — el otro pendiente viejo de Mariana.
 *
 * Uso:  node scripts/santander-cargar.mjs             (preview)
 *       node scripts/santander-cargar.mjs --escribir
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
const fmt=n=>(n<0?'-$':'$')+Math.abs(Math.round(n)).toLocaleString('es-AR')

// ── 1) Amex julio: cierre 30/07/26, vence 10/08/26 ──
const AMEX={tarjeta:'Santander Amex', persona:'Sofi', mes:7, anio:2026, venc:'10/08/2026',
  totalArs:276456.59, totalUsd:388.50, saldoAnterior:141965.66}
const LINEAS=[
  {com:'GOOGLE*WORKSPACE SO', mon:'USD', monto:388.50, sub:'Software · Suscripciones'},
  {com:'DB.RG 5617 30% (581.196,00)', mon:'ARS', monto:174358.80, sub:'Percepciones a recuperar'},
  {com:'IVA RG 4240 21% (581.196,00)', mon:'ARS', monto:122051.16, sub:'Costos bancarios'},
  {com:'IIBB PERCEP-CABA 2% (581.196,00)', mon:'ARS', monto:11623.92, sub:'Costos bancarios'},
  {com:'CR.RG 5617 30% M (credito del mes anterior)', mon:'ARS', monto:-173542.95, sub:'Percepciones a recuperar'},
]
const sumaArs=LINEAS.filter(l=>l.mon==='ARS').reduce((s,l)=>s+l.monto,0)
console.log(`\n1) SANTANDER AMEX · resumen ${AMEX.mes}/${AMEX.anio} · cierre 30/07 · vence ${AMEX.venc}\n`)
LINEAS.forEach(l=>console.log(`   ${l.com.padEnd(44)} ${l.mon} ${(l.mon==='USD'?l.monto.toFixed(2):fmt(l.monto)).padStart(13)}`))
console.log(`   ${'-'.repeat(44)}`)
console.log(`   ${'movimientos del mes'.padEnd(44)} ARS ${fmt(sumaArs).padStart(13)}`)
console.log(`   ${'+ saldo de junio que NO se pagó en pesos'.padEnd(44)} ARS ${fmt(AMEX.saldoAnterior).padStart(13)}`)
console.log(`   ${'= total del resumen'.padEnd(44)} ARS ${fmt(sumaArs+AMEX.saldoAnterior).padStart(13)}`)
console.log(`   ${'lo que dice el resumen'.padEnd(44)} ARS ${fmt(AMEX.totalArs).padStart(13)}`)
const ok=Math.abs(sumaArs+AMEX.saldoAnterior-AMEX.totalArs)<1
console.log(`   ${ok?'✓ cierra exacto':'✗ NO CIERRA - freno'}\n`)
if(!ok) process.exit(1)

// ── 2) Costos de la cuenta. Se toma el período 29/05-02/07, el único mes entero
//       con comisión de servicio (el cierre del 30/07 corta antes de que se cobre). ──
const COSTOS=[
  {con:'Costos bancarios Santander — comisión de cuenta', monto:76142.15,
   obs:'Comisión por servicio de cuenta corriente, cobrada el 29/06/2026. En mayo fue $63.452,07: viene subiendo.'},
  {con:'Costos bancarios Santander — IVA', monto:16274.15,
   obs:'IVA 21% sobre la comisión de cuenta y sobre los intereses por descubierto.'},
  {con:'Costos bancarios Santander — intereses por descubierto y sellos', monto:1364.29,
   obs:'Interés por girar en descubierto ($1.353,81) más impuesto de sellos. La cuenta corriente cierra varios meses en rojo.'},
]
const totCostos=COSTOS.reduce((s,c)=>s+c.monto,0)
console.log(`2) COSTOS BANCARIOS DE SANTANDER · cuenta 810-012707/9 de Sofi · período 29/05-02/07\n`)
COSTOS.forEach(c=>console.log(`   ${c.con.padEnd(56)} ${fmt(c.monto).padStart(12)}`))
console.log(`   ${'-'.repeat(56)}`)
console.log(`   ${'TOTAL'.padEnd(56)} ${fmt(totCostos).padStart(12)}`)
console.log(`\n   (la Ley 25.413 de esta cuenta, $562,68, no se carga: mismo criterio que Galicia)\n`)

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['TARJETAS!A:N','MOVIMIENTOS_TARJETA!A:N','GASTOS_FIJOS!A:Z']})
const [T,M,G]=R.data.valueRanges.map(v=>v.values||[])
const yaT=T.slice(1).some(f=>String(f[0]).trim()===AMEX.tarjeta&&String(f[2]).trim()===String(AMEX.mes)&&String(f[3]).includes('2026'))
const yaM=M.slice(1).filter(f=>String(f[0]).trim()===AMEX.tarjeta&&String(f[1]).trim()===String(AMEX.mes)&&String(f[2]).includes('2026')).length
const iCon=G[0].indexOf('Concepto')
const pend=COSTOS.filter(c=>!G.slice(1).some(f=>String(f[iCon]||'').trim()===c.con))
console.log(`   TARJETAS: ${yaT?'ya existe':'se agrega la fila del Amex de julio'}`)
console.log(`   MOVIMIENTOS: ${yaM?`ya hay ${yaM}`:`se agregan ${LINEAS.length}`}`)
console.log(`   GASTOS_FIJOS: se agregan ${pend.length} filas de costos`)
if(!ESCRIBIR){ console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir. ---'); process.exit(0) }

const set=(headers,o)=>{const f=new Array(headers.length).fill(''); Object.entries(o).forEach(([k,v])=>{const i=headers.indexOf(k); if(i>=0)f[i]=v}); return f}
if(!yaT) await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'TARJETAS!A:N',valueInputOption:'USER_ENTERED',
  insertDataOption:'INSERT_ROWS',requestBody:{values:[set(T[0],{
    'Tarjeta':AMEX.tarjeta,'Persona':AMEX.persona,'Mes':AMEX.mes,'Año':AMEX.anio,
    'Monto':AMEX.totalArs,'Monto USD':AMEX.totalUsd,'Vencimiento':AMEX.venc,'Pagado':'NO',
    'Notas':`Del resumen (cierre 30/07/26). OJO: incluye ${fmt(AMEX.saldoAnterior)} del resumen de junio que NO se pagó en pesos (solo se pagaron los dólares) — no contar junio y julio por separado.`})]}})
if(!yaM) await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'MOVIMIENTOS_TARJETA!A:N',valueInputOption:'USER_ENTERED',
  insertDataOption:'INSERT_ROWS',requestBody:{values:LINEAS.map(l=>set(M[0],{
    'Tarjeta':AMEX.tarjeta,'Mes':AMEX.mes,'Año':AMEX.anio,'Descripcion':'Magma','Comercio':l.com,
    'Moneda':l.mon,'Monto':l.monto,'Categoria':'Empresa','Subcategoria':l.sub,
    'Cargado por':'juan (script santander)','Notas':'del resumen de cuenta'}))}})
if(pend.length) await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'GASTOS_FIJOS!A:Z',valueInputOption:'USER_ENTERED',
  insertDataOption:'INSERT_ROWS',requestBody:{values:pend.map(c=>set(G[0],{
    'Categoria':'Financieros','Concepto':c.con,'Monto':c.monto,'Moneda':'ARS','Frecuencia':'mensual',
    'Persona/Cuenta':'Santander Sofi (810-012707/9)','Activo':'SI','Medio de pago':'Débito automático',
    'Tipo':'Costos bancarios','Observacion':c.obs+' Del resumen de cuenta Santander, período 29/05-02/07/2026.'}))}})

const V=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['TARJETAS!A:N','MOVIMIENTOS_TARJETA!A:N','GASTOS_FIJOS!A:Z'],valueRenderOption:'UNFORMATTED_VALUE'})
const [T2,M2,G2]=V.data.valueRanges.map(v=>v.values||[])
const fT=T2.slice(1).find(f=>String(f[0]).trim()===AMEX.tarjeta&&Number(f[2])===AMEX.mes&&String(f[3]).includes('2026'))
const movs=M2.slice(1).filter(f=>String(f[0]).trim()===AMEX.tarjeta&&Number(f[1])===AMEX.mes&&String(f[2]).includes('2026'))
const iMon=M2[0].indexOf('Monto'), iMo=M2[0].indexOf('Moneda')
const vArs=movs.filter(f=>String(f[iMo]).toUpperCase()!=='USD').reduce((s,f)=>s+Number(f[iMon]||0),0)
const cost=G2.slice(1).filter(f=>/costos bancarios santander/i.test(String(f[G2[0].indexOf('Concepto')]||'')))
const sumC=cost.reduce((s,f)=>s+Number(f[G2[0].indexOf('Monto')]||0),0)
console.log(`\n✓ TARJETAS: ${fT?`${fmt(Number(fT[4]))} + US$${fT[5]} · vence ${fT[6]}`:'✗ no se escribió'}`)
console.log(`✓ MOVIMIENTOS: ${movs.length} filas · ARS ${fmt(vArs)}  ${Math.abs(vArs-sumaArs)<1?'= los renglones del resumen ✓':'✗'}`)
console.log(`✓ COSTOS: ${cost.length} filas · ${fmt(sumC)} ${Math.abs(sumC-totCostos)<1?'= lo calculado ✓':'✗'}`)
try{ await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',
  requestBody:{values:[[new Date().toISOString(),'juan (script)','santander-cargar','TARJETAS/GASTOS_FIJOS','7/2026',`amex ${fmt(AMEX.totalArs)} + costos ${fmt(totCostos)}`]]}}) }catch(e){}
