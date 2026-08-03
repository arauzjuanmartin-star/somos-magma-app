/**
 * PREVIEW de los duplicados de Pagos_Staff — NO BORRA NADA.
 * Lista las filas duplicadas (monto en la columna Servicio + gemelo con servicio real)
 * para revisar antes de limpiar. Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const PS=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'Pagos_Staff',valueRenderOption:'FORMATTED_VALUE'})).data.values
const esMonto=v=>/^\$?\s*[\d.,]+\s*$/.test(txt(v))&&txt(v)!==''

const idx={}
PS.slice(1).forEach((r,i)=>{ if(!r||!txt(r[1]))return
  const k=`${txt(r[3])}|${txt(r[1])}|${num(r[6])}|${txt(r[2])}`
  ;(idx[k]=idx[k]||[]).push({fila:i+2, serv:txt(r[5])}) })

const borrar=[], conservar=[]
PS.slice(1).forEach((r,i)=>{ if(!r||!txt(r[1]))return
  const s=txt(r[5]); if(!esMonto(s))return
  const k=`${txt(r[3])}|${txt(r[1])}|${num(r[6])}|${txt(r[2])}`
  const gemelo=(idx[k]||[]).find(g=>g.serv&&!esMonto(g.serv))
  const item={fila:i+2, nro:txt(r[3]), pers:txt(r[1]), mes:txt(r[2]), proy:txt(r[4]),
    monto:num(r[6]), pagado:num(r[7]), estado:txt(r[10]), fechaPago:txt(r[0]), gemelo:gemelo?.fila}
  if(gemelo) borrar.push(item); else conservar.push(item) })

console.log(`\n${'█'.repeat(94)}`)
console.log(`  PREVIEW — filas a BORRAR de Pagos_Staff   (nada fue modificado)`)
console.log(`${'█'.repeat(94)}\n`)
console.log(`  ${borrar.length} filas duplicadas · ${M(borrar.reduce((s,x)=>s+x.monto,0))}\n`)
console.log(`  ${'fila'.padStart(5)} ${'gemelo'.padStart(6)} ${'N°'.padEnd(8)} ${'persona'.padEnd(26)} ${'mes'.padEnd(13)} ${'monto'.padStart(11)}  proyecto`)
console.log(`  ${'─'.repeat(92)}`)
borrar.sort((a,b)=>a.fila-b.fila).forEach(x=>
  console.log(`  ${String(x.fila).padStart(5)} ${String(x.gemelo).padStart(6)} ${x.nro.padEnd(8)} ${x.pers.slice(0,24).padEnd(26)} ${x.mes.padEnd(13)} ${M(x.monto).padStart(11)}  ${x.proy.slice(0,26)}`))

console.log(`\n${'━'.repeat(94)}`)
console.log(`  NO SE TOCAN — tienen monto en "Servicio" pero NO tienen gemelo (son registros únicos)`)
console.log(`${'━'.repeat(94)}\n`)
console.log(`  ${conservar.length} filas · ${M(conservar.reduce((s,x)=>s+x.monto,0))}\n`)
conservar.sort((a,b)=>a.fila-b.fila).forEach(x=>
  console.log(`  ${String(x.fila).padStart(5)} ${'      '} ${x.nro.padEnd(8)} ${x.pers.slice(0,24).padEnd(26)} ${x.mes.padEnd(13)} ${M(x.monto).padStart(11)}  ${x.proy.slice(0,26)}`))

// chequeos de seguridad
console.log(`\n${'━'.repeat(94)}\n  CHEQUEOS DE SEGURIDAD\n${'━'.repeat(94)}`)
const distintoEstado=borrar.filter(x=>{
  const g=PS[x.gemelo-1]; return g && txt(g[10])!==x.estado })
console.log(`  · filas donde el duplicado y su gemelo tienen ESTADO distinto: ${distintoEstado.length}`)
distintoEstado.forEach(x=>{const g=PS[x.gemelo-1]
  console.log(`      fila ${x.fila} estado "${x.estado}" vs gemelo fila ${x.gemelo} estado "${txt(g[10])}"  → revisar a mano`)})
const pagadoDistinto=borrar.filter(x=>{const g=PS[x.gemelo-1]; return g && num(g[7])!==x.pagado})
console.log(`  · filas donde el monto PAGADO difiere del gemelo: ${pagadoDistinto.length}`)
pagadoDistinto.forEach(x=>{const g=PS[x.gemelo-1]
  console.log(`      fila ${x.fila} pagado ${M(x.pagado)} vs gemelo fila ${x.gemelo} pagado ${M(num(g[7]))}  → revisar a mano`)})
const mesesAf=[...new Set(borrar.map(x=>x.mes))].sort()
console.log(`  · meses afectados: ${mesesAf.join(' · ')}`)
const persAf=[...new Set(borrar.map(x=>x.pers))]
console.log(`  · personas afectadas: ${persAf.length}`)
console.log(`\n  IMPACTO: Pagos_Staff pasaría de $116.208.067 a ${M(116208067-borrar.reduce((s,x)=>s+x.monto,0))} para proyectos 2026`)
console.log(`           PROYECTOS dice $95.508.063 → quedaría una diferencia de ${M(116208067-borrar.reduce((s,x)=>s+x.monto,0)-95508063)}`)
