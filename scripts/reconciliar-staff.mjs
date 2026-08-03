/**
 * RECONCILIACIÓN PROYECTOS vs Pagos_Staff — ¿por qué difieren $20,7M?
 * Compara trabajo por trabajo lo cargado en PROYECTOS (líneas Pedido/Precio/Staff)
 * contra lo registrado en Pagos_Staff (Monto Adeudado por freelancer).
 * Solo lectura.
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
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS','Pagos_Staff','HISTORICO_2025'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,PS,H25]=R.data.valueRanges.map(v=>v.values||[])
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]

// ---- PROYECTOS 2026: costo por N° de presupuesto ----
const proy={}   // nro -> {costo, nombre, fecha, filas}
const nros2026=new Set()
PRO.slice(1).forEach((r,i)=>{
  const f=fecha(r[3]); if(!f||f.getFullYear()!==2026)return
  const n=txt(r[2]); if(!n)return
  nros2026.add(n)
  const o=proy[n]=proy[n]||{costo:0,nombre:txt(r[6]),fecha:txt(r[3]),filas:[],lineas:0}
  o.filas.push(i+2)
  PED.forEach(c=>{const p=txt(r[c]); if(!p)return; const v=num(r[c+1]); const pers=txt(r[c+2])
    if(v<=1||!pers||/somos magma/i.test(pers))return
    o.costo+=v; o.lineas++ })
})
// ---- Pagos_Staff: adeudado por N° ----
// [0]Fecha Pago [1]Freelancer [2]Mes Referencia [3]N° Presupuesto [4]Proyecto [5]Servicio [6]Monto Adeudado [7]Monto Pagado [10]Estado
const pagos={}
const dupCheck={}
PS.slice(1).forEach((r,i)=>{
  if(!r||!txt(r[1]))return
  const n=txt(r[3]); if(!n)return
  const o=pagos[n]=pagos[n]||{ad:0,pg:0,regs:[],personas:new Set()}
  o.ad+=num(r[6]); o.pg+=num(r[7]); o.regs.push(i+2); o.personas.add(txt(r[1]))
  // clave de duplicado: nro+persona+servicio+monto
  const k=`${n}|${txt(r[1])}|${txt(r[5])}|${num(r[6])}`
  ;(dupCheck[k]=dupCheck[k]||[]).push(i+2)
})
// ---- histórico 2025: qué N° existen ahí también ----
const nros2025=new Set()
H25.slice(1).forEach(r=>{const n=txt(r[3]); if(n)nros2025.add(n)})

console.log(`\n${'█'.repeat(84)}\n  ¿POR QUÉ DIFIEREN PROYECTOS Y Pagos_Staff?\n${'█'.repeat(84)}`)
let totProy=0, totPag=0
nros2026.forEach(n=>{ totProy+=proy[n]?.costo||0; totPag+=pagos[n]?.ad||0 })
console.log(`  PROYECTOS 2026:        ${M(totProy)}`)
console.log(`  Pagos_Staff (mismos N°): ${M(totPag)}`)
console.log(`  diferencia:            ${M(totPag-totProy)}\n`)

// === CAUSA 1: duplicados exactos en Pagos_Staff ===
const dups=Object.entries(dupCheck).filter(([,v])=>v.length>1)
let montoDup=0
dups.forEach(([k,v])=>{ const m=parseFloat(k.split('|')[3])||0; montoDup+=m*(v.length-1) })
console.log(`▓ CAUSA 1 — registros DUPLICADOS exactos en Pagos_Staff (mismo N°+persona+servicio+monto)`)
console.log(`   ${dups.length} claves repetidas · monto duplicado: ${M(montoDup)}`)
dups.slice(0,12).forEach(([k,v])=>{const [n,p,s,m]=k.split('|')
  console.log(`      #${n.padEnd(6)} ${p.slice(0,26).padEnd(28)} ${s.slice(0,16).padEnd(18)} ${M(+m).padStart(11)}  ×${v.length}  filas ${v.join(',')}`)})
if(dups.length>12) console.log(`      … y ${dups.length-12} más`)

// === CAUSA 2: N° que existen en 2025 Y 2026 (el match trae pagos viejos) ===
const colision=[...nros2026].filter(n=>nros2025.has(n))
let montoColision=0
colision.forEach(n=>{ montoColision+=pagos[n]?.ad||0 })
console.log(`\n▓ CAUSA 2 — N° de presupuesto que existen TAMBIÉN en HISTORICO_2025`)
console.log(`   ${colision.length} números colisionan · Pagos_Staff les atribuye ${M(montoColision)}`)
console.log(`   (parte de eso son pagos de trabajos de 2025 que se cuelan al filtrar por N°)`)
colision.slice(0,10).forEach(n=>console.log(`      #${n.padEnd(6)} proy2026: ${M(proy[n]?.costo||0).padStart(11)} · pagos: ${M(pagos[n]?.ad||0).padStart(11)}  ${(proy[n]?.nombre||'').slice(0,30)}`))

// === CAUSA 3: proyectos donde pagos >> costo cargado ===
console.log(`\n▓ CAUSA 3 — trabajos donde Pagos_Staff supera MUCHO a lo cargado en PROYECTOS`)
const desvios=[...nros2026].map(n=>({n, c:proy[n]?.costo||0, a:pagos[n]?.ad||0, nom:proy[n]?.nombre||'', li:proy[n]?.lineas||0, rg:pagos[n]?.regs.length||0}))
  .filter(d=>d.a-d.c>300000).sort((a,b)=>(b.a-b.c)-(a.a-a.c))
console.log(`   ${desvios.length} trabajos con desvío > $300.000 · suman ${M(desvios.reduce((s,d)=>s+(d.a-d.c),0))}`)
console.log(`   ${'N°'.padEnd(7)}${'en PROYECTOS'.padStart(14)}${'en Pagos'.padStart(14)}${'desvío'.padStart(14)}  lín/reg  proyecto`)
desvios.slice(0,15).forEach(d=>console.log(`   ${d.n.padEnd(7)}${M(d.c).padStart(14)}${M(d.a).padStart(14)}${M(d.a-d.c).padStart(14)}  ${String(d.li)}/${String(d.rg).padEnd(4)}  ${d.nom.slice(0,28)}`))

// === CAUSA 4: al revés — cargado en PROYECTOS pero sin pagos ===
const sinPago=[...nros2026].map(n=>({n,c:proy[n]?.costo||0,a:pagos[n]?.ad||0,nom:proy[n]?.nombre||''}))
  .filter(d=>d.c>0&&d.a===0)
console.log(`\n▓ CAUSA 4 — trabajos con costo en PROYECTOS pero SIN ningún registro en Pagos_Staff`)
console.log(`   ${sinPago.length} trabajos · ${M(sinPago.reduce((s,d)=>s+d.c,0))} que se le debe a freelancers y no está en la solapa de pagos`)
sinPago.sort((a,b)=>b.c-a.c).slice(0,10).forEach(d=>console.log(`      #${d.n.padEnd(6)} ${M(d.c).padStart(12)}  ${d.nom.slice(0,34)}`))
