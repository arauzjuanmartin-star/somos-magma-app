/**
 * Carga el resumen de Santander Amex de junio 2026 (cierre 02/07, vto 14/07),
 * leído del PDF que mandó Juan. Ese resumen no estaba: la Amex se dejó de
 * cargar después de mayo y por eso Google Workspace desaparecía de los números.
 *
 * Uso:  node scripts/amex-cargar-junio.mjs             (preview)
 *       node scripts/amex-cargar-junio.mjs --escribir
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

// Del resumen: cierre 02 Jul 26 · vto 14 Jul 26 · titular GRENIER SOFIA MARIA · tarjeta 0211
const RES={ tarjeta:'Santander Amex', persona:'Sofi', mes:6, anio:2026, venc:'14/07/2026',
  totalArs:141965.66, totalUsd:388.50 }
// El único consumo real es el Workspace; el resto son impuestos sobre él.
const LINEAS=[
  {com:'GOOGLE*WORKSPACE SOMOSMAG', mon:'USD', monto:388.50, sub:'Software · Suscripciones'},
  {com:'DB.RG 5617 30% (578.476,50)', mon:'ARS', monto:173542.95, sub:'Percepciones a recuperar'},
  {com:'IVA RG 4240 21% (578.476,50)', mon:'ARS', monto:121480.06, sub:'Costos bancarios'},
  {com:'IIBB PERCEP-CABA 2% (578.476,50)', mon:'ARS', monto:11569.53, sub:'Costos bancarios'},
  {com:'CR.RG 5617 30% M (credito del mes anterior)', mon:'ARS', monto:-164626.88, sub:'Percepciones a recuperar'},
]
const sumaArs=LINEAS.filter(l=>l.mon==='ARS').reduce((s,l)=>s+l.monto,0)
const sumaUsd=LINEAS.filter(l=>l.mon==='USD').reduce((s,l)=>s+l.monto,0)

console.log(`\nSantander Amex · resumen ${RES.mes}/${RES.anio} · cierre 02/07 · vence ${RES.venc}\n`)
LINEAS.forEach(l=>console.log(`   ${l.com.padEnd(44)} ${l.mon} ${(l.mon==='USD'?l.monto.toFixed(2):fmt(l.monto)).padStart(13)}   ${l.sub}`))
console.log(`   ${'-'.repeat(44)}`)
console.log(`   ${'suma de los renglones'.padEnd(44)} ARS ${fmt(sumaArs).padStart(13)}  ·  USD ${sumaUsd.toFixed(2)}`)
console.log(`   ${'lo que dice DEBITAREMOS el resumen'.padEnd(44)} ARS ${fmt(RES.totalArs).padStart(13)}  ·  USD ${RES.totalUsd.toFixed(2)}`)
const okArs=Math.abs(sumaArs-RES.totalArs)<1, okUsd=Math.abs(sumaUsd-RES.totalUsd)<0.01
console.log(`   ${okArs&&okUsd ? '✓ cierra exacto' : '✗ NO CIERRA - freno'}\n`)
if(!okArs||!okUsd) process.exit(1)
console.log(`   Ojo: el único consumo real es Google Workspace (US$388,50). Los ${fmt(sumaArs)} en pesos`)
console.log(`   son impuestos sobre ese consumo: 30% percepción + 21% IVA + 2% IIBB.\n`)

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['TARJETAS!A:N','MOVIMIENTOS_TARJETA!A:N']})
const [T,M]=R.data.valueRanges.map(v=>v.values||[])
const yaT=T.slice(1).some(f=>String(f[0]).trim()===RES.tarjeta&&String(f[2]).trim()===String(RES.mes)&&String(f[3]).includes(String(RES.anio)))
const yaM=M.slice(1).filter(f=>String(f[0]).trim()===RES.tarjeta&&String(f[1]).trim()===String(RES.mes)&&String(f[2]).includes(String(RES.anio))).length
console.log(`   TARJETAS: ${yaT?'YA EXISTE la fila - no se duplica':'se agrega 1 fila'}`)
console.log(`   MOVIMIENTOS_TARJETA: ${yaM?`YA HAY ${yaM} de ese mes - no se duplica`:`se agregan ${LINEAS.length}`}`)
if(yaT&&yaM){ console.log('\nNada para cargar.'); process.exit(0) }
if(!ESCRIBIR){ console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir. ---'); process.exit(0) }

const set=(headers,o)=>{const f=new Array(headers.length).fill(''); Object.entries(o).forEach(([k,v])=>{const i=headers.indexOf(k); if(i>=0)f[i]=v}); return f}
if(!yaT) await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'TARJETAS!A:N',valueInputOption:'USER_ENTERED',
  insertDataOption:'INSERT_ROWS',requestBody:{values:[set(T[0],{
    'Tarjeta':RES.tarjeta,'Persona':RES.persona,'Mes':RES.mes,'Año':RES.anio,
    'Monto':RES.totalArs,'Monto USD':RES.totalUsd,'Vencimiento':RES.venc,'Pagado':'NO',
    'Notas':'Del PDF (cierre 02/07/26). Unico consumo: Google Workspace US$388,50; el resto impuestos.'})]}})
if(!yaM) await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'MOVIMIENTOS_TARJETA!A:N',valueInputOption:'USER_ENTERED',
  insertDataOption:'INSERT_ROWS',requestBody:{values:LINEAS.map(l=>set(M[0],{
    'Tarjeta':RES.tarjeta,'Mes':RES.mes,'Año':RES.anio,'Descripcion':'Magma','Comercio':l.com,
    'Moneda':l.mon,'Monto':l.monto,'Categoria':'Empresa','Subcategoria':l.sub,
    'Cargado por':'juan (script amex)','Notas':'del PDF del resumen'}))}})

const V=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['TARJETAS!A:N','MOVIMIENTOS_TARJETA!A:N'],valueRenderOption:'UNFORMATTED_VALUE'})
const [T2,M2]=V.data.valueRanges.map(v=>v.values||[])
const filaT=T2.slice(1).find(f=>String(f[0]).trim()===RES.tarjeta&&Number(f[2])===RES.mes&&String(f[3]).includes(String(RES.anio)))
const movs=M2.slice(1).filter(f=>String(f[0]).trim()===RES.tarjeta&&Number(f[1])===RES.mes&&String(f[2]).includes(String(RES.anio)))
const iMon=M2[0].indexOf('Monto'), iMo=M2[0].indexOf('Moneda')
const vArs=movs.filter(f=>String(f[iMo]).toUpperCase()!=='USD').reduce((s,f)=>s+Number(f[iMon]||0),0)
const vUsd=movs.filter(f=>String(f[iMo]).toUpperCase()==='USD').reduce((s,f)=>s+Number(f[iMon]||0),0)
console.log(`\n✓ TARJETAS: ${filaT?`${fmt(Number(filaT[4]))} + US$${filaT[5]} · vence ${filaT[6]}`:'✗ no se escribió'}`)
console.log(`✓ MOVIMIENTOS: ${movs.length} filas · ARS ${fmt(vArs)} · USD ${vUsd.toFixed(2)}`)
console.log(Math.abs(vArs-RES.totalArs)<1 ? '✓ los movimientos suman lo mismo que el resumen' : '✗ NO SUMAN IGUAL')
try{ await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',
  requestBody:{values:[[new Date().toISOString(),'juan (script)','amex-cargar-junio','TARJETAS',`${RES.mes}/${RES.anio}`,`${fmt(RES.totalArs)} + US$${RES.totalUsd}`]]}}) }catch(e){}
