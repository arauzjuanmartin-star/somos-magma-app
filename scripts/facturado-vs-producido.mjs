/**
 * ¿Qué produjimos y no facturamos? — cruce PROYECTO POR PROYECTO.
 *
 * Ojo con el atajo de comparar totales mes a mes: un trabajo de mayo puede estar
 * facturado en junio y aparece como "sin facturar" cuando en realidad está.
 * Acá se busca la factura de cada proyecto por su N° de presupuesto, sin importar
 * en qué mes quedó cargada.
 *
 *   node scripts/facturado-vs-producido.mjs [mes]
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const MES=parseInt(process.argv[2])||0
const txt=v=>String(v??'').trim(), num=v=>{const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const yes=v=>/^(s[ií]|true|x|✓)$/i.test(txt(v))
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const MESES=['','enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS!A:CI','FACTURACION!A:V'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,FAC]=R.data.valueRanges.map(v=>v.values||[])
const FH=FAC[0], fNro=FH.indexOf('N° Presupuesto'), fNum=FH.indexOf('Nro de Factura'), fFin=FH.indexOf('Precio FINAL'), fMes=0
const facDe={}
FAC.slice(1).forEach(r=>{ const n=txt(r[fNro]); if(!n)return
  ;(facDe[n]=facDe[n]||[]).push({num:txt(r[fNum]), final:num(r[fFin]), cobrada:yes(r[4]), mes:txt(r[fMes])}) })

const iTot=PRO[0].findIndex(x=>txt(x)==='Total')
const proy={}
PRO.slice(1).forEach(r=>{ const f=fecha(r[3]); if(!f||f.getFullYear()!==2026)return
  const n=txt(r[2]); if(!n)return
  const p=proy[n]||={nro:n,mes:f.getMonth()+1,fecha:txt(r[3]),ag:txt(r[4]),nombre:txt(r[6]),total:0}
  p.total=Math.max(p.total,num(r[iTot])) })
const todos=Object.values(proy).filter(p=>p.total>0&&(!MES||p.mes===MES))
todos.forEach(p=>{ const f=facDe[p.nro]||[]
  p.fac = f.reduce((a,x)=>a+x.final,0)
  p.tieneFactura = f.length>0
  p.conNumero = f.some(x=>x.num)
  p.cobrada = f.some(x=>x.cobrada)
  p.mesFactura = f.map(x=>x.mes).filter(Boolean).join('/') })

const sin = todos.filter(p=>!p.tieneFactura)
const sinNro = todos.filter(p=>p.tieneFactura&&!p.conNumero)
const ok = todos.filter(p=>p.conNumero)
const S=(a,k)=>a.reduce((s,x)=>s+x[k],0)

console.log(`\n${'█'.repeat(86)}\n  PRODUCIDO vs FACTURADO ${MES?'— '+MESES[MES].toUpperCase()+' 2026':'— 2026'}, proyecto por proyecto\n${'█'.repeat(86)}`)
console.log(`\n  ${'situación'.padEnd(34)}${'proy'.padStart(5)}${'producido'.padStart(16)}`)
console.log(`  ${'─'.repeat(56)}`)
console.log(`  \x1b[32m${'Con factura emitida'.padEnd(34)}${String(ok.length).padStart(5)}${M(S(ok,'total')).padStart(16)}\x1b[0m`)
if(sinNro.length) console.log(`  \x1b[33m${'En FACTURACION pero sin N° de factura'.padEnd(34)}${String(sinNro.length).padStart(5)}${M(S(sinNro,'total')).padStart(16)}\x1b[0m`)
console.log(`  \x1b[31m${'Sin ninguna factura'.padEnd(34)}${String(sin.length).padStart(5)}${M(S(sin,'total')).padStart(16)}\x1b[0m`)
console.log(`  ${'─'.repeat(56)}`)
console.log(`  ${'TOTAL PRODUCIDO'.padEnd(34)}${String(todos.length).padStart(5)}${M(S(todos,'total')).padStart(16)}`)

const ver=(t,a,color)=>{ if(!a.length)return
  console.log(`\n\x1b[1m■ ${t}\x1b[0m\n`)
  console.log(`  ${'n°'.padEnd(7)}${'fecha'.padEnd(11)}${'agencia'.padEnd(20)}${'proyecto'.padEnd(34)}${'producido'.padStart(14)}`)
  a.sort((x,y)=>y.total-x.total).forEach(p=>
    console.log(`  ${p.nro.padEnd(7)}${p.fecha.padEnd(11)}${p.ag.slice(0,18).padEnd(20)}${p.nombre.slice(0,32).padEnd(34)}${M(p.total).padStart(14)}`))
  console.log(`  ${' '.repeat(72)}${M(S(a,'total')).padStart(14)}`)}
ver(`SIN NINGUNA FACTURA (${sin.length})`, sin)
ver(`EN FACTURACION PERO SIN N° DE FACTURA (${sinNro.length})`, sinNro)
if(MES){ const otros=ok.filter(p=>p.mesFactura&&!p.mesFactura.toLowerCase().includes(MESES[MES]))
  if(otros.length){ console.log(`\n  \x1b[36m${otros.length} proyectos de ${MESES[MES]} están facturados en OTRO mes (${M(S(otros,'total'))}) — por eso la comparación mes a mes engaña.\x1b[0m`) } }
console.log('')
