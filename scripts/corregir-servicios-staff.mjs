/**
 * 1) Completa la columna "Servicio" de los registros de Pagos_Staff que tienen un MONTO ahí
 *    (por eso la app no los muestra), tomando el pedido real de PROYECTOS.
 * 2) Borra los 2 registros que sobran: PROYECTOS tiene 1 línea y Pagos_Staff 2 idénticas.
 * Identifica todo por contenido, no por número de fila. Requiere --confirmar.
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
const esMonto=v=>/^\$?\s*[\d.,]+\s*$/.test(txt(v))&&txt(v)!==''
const norm=s=>txt(s).toLowerCase().slice(0,14)
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]

const meta=await sheets.spreadsheets.get({spreadsheetId:ID})
const sheetId=meta.data.sheets.find(s=>s.properties.title==='Pagos_Staff').properties.sheetId
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS','Pagos_Staff'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,PS]=R.data.valueRanges.map(v=>v.values||[])

// líneas de PROYECTOS por nro
const lineas={}   // nro -> [{pedido, precio, pers}]
PRO.slice(1).forEach(r=>{ const n=txt(r[2]); if(!n)return
  PED.forEach(c=>{const p=txt(r[c]); if(!p)return; const v=num(r[c+1]); const pers=txt(r[c+2])
    if(!pers)return
    ;(lineas[n]=lineas[n]||[]).push({pedido:p, precio:v, pers}) }) })

// ---- 1. arreglar servicio ----
const arreglar=[], sinMatch=[]
PS.slice(1).forEach((r,i)=>{ if(!r||!txt(r[1]))return
  if(!esMonto(txt(r[5])))return
  const nro=txt(r[3]), pers=txt(r[1]), monto=num(r[6])
  const cand=(lineas[nro]||[]).filter(l=>norm(l.pers)===norm(pers)&&l.precio===monto)
  if(cand.length) arreglar.push({fila:i+2, nro, pers, monto, pedido:cand[0].pedido, proy:txt(r[4])})
  else sinMatch.push({fila:i+2, nro, pers, monto, proy:txt(r[4])}) })

console.log(`\n■ 1 · COMPLETAR LA COLUMNA "SERVICIO"  (${arreglar.length} filas)`)
console.log(`   ${'fila'.padStart(5)} ${'N°'.padEnd(7)} ${'persona'.padEnd(26)} ${'monto'.padStart(11)}  servicio a escribir`)
arreglar.forEach(a=>console.log(`   ${String(a.fila).padStart(5)} ${a.nro.padEnd(7)} ${a.pers.slice(0,24).padEnd(26)} ${M(a.monto).padStart(11)}  ${a.pedido}`))
if(sinMatch.length){
  console.log(`\n   ⚠️ ${sinMatch.length} sin línea equivalente en PROYECTOS — NO se tocan:`)
  sinMatch.forEach(s=>console.log(`   ${String(s.fila).padStart(5)} ${s.nro.padEnd(7)} ${s.pers.slice(0,24).padEnd(26)} ${M(s.monto).padStart(11)}  ${s.proy}`))
}

// ---- 2. sobrantes: PROYECTOS 1 línea vs Pagos_Staff 2 ----
const sobran=[]
const porClave={}
PS.slice(1).forEach((r,i)=>{ if(!r||!txt(r[1]))return
  const nro=txt(r[3]), serv=txt(r[5]); if(!nro||!serv||esMonto(serv))return
  const k=`${nro}|${norm(r[1])}|${num(r[6])}|${serv}`
  ;(porClave[k]=porClave[k]||[]).push({fila:i+2, pers:txt(r[1]), nro, monto:num(r[6]), serv, estado:txt(r[10])}) })
Object.entries(porClave).forEach(([k,v])=>{
  if(v.length<2)return
  const [nro,persN,montoS,serv]=k.split('|')
  const enProy=(lineas[nro]||[]).filter(l=>norm(l.pers)===persN&&l.precio===+montoS).length
  if(v.length>enProy){ v.slice(enProy).forEach(x=>sobran.push({...x, enProy, enPS:v.length})) } })

console.log(`\n■ 2 · BORRAR SOBRANTES  (${sobran.length} filas)`)
sobran.forEach(s=>console.log(`   fila ${String(s.fila).padStart(5)} #${s.nro.padEnd(6)} ${s.pers.slice(0,24).padEnd(26)} ${M(s.monto).padStart(11)} ${s.serv.padEnd(12)} ${s.estado}   (PROYECTOS tiene ${s.enProy}, Pagos_Staff ${s.enPS})`))

if(!CONFIRMAR){ console.log(`\n   MODO SIMULACIÓN — nada se escribió. Ejecutar con --confirmar\n`); process.exit(0) }

// aplicar
if(arreglar.length){
  console.log(`\n■ Escribiendo servicios…`)
  await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',
    data: arreglar.map(a=>({range:`Pagos_Staff!F${a.fila}`, values:[[a.pedido]]}))}})
  console.log(`   ✓ ${arreglar.length} servicios completados`)
}
if(sobran.length){
  console.log(`\n■ Borrando sobrantes…`)
  const filas=sobran.map(s=>s.fila).sort((a,b)=>b-a)
  await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:
    filas.map(f=>({deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:f-1,endIndex:f}}}))}})
  console.log(`   ✓ ${sobran.length} filas borradas`)
}
console.log(`\n✓ Listo. El backup Pagos_Staff_backup_31-07 sigue disponible.`)
