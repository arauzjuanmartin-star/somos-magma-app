/**
 * MODELO v2 — corrige el problema de proyectos multi-día cargados como 1 fecha.
 * Separa: DÍAS DE CALENDARIO (cuántos días hay rodaje) de JORNADAS-PERSONA
 * (cuántas jornadas se compran). Un fijo cubre 1 jornada por día de calendario.
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
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const MES=['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const CAM=/film|c[aá]mara|camara|video|foto|dirfoto|asist/i
const ED=/edit|edici|post|color/i
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47]
const CAP_DIAS=5 // ninguna feria dura más de 5 días de rodaje

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS','RRHH'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,RR]=R.data.valueRanges.map(v=>v.values||[])
const tarifa={}
RR.slice(1).forEach(r=>{const n=txt(r[0]).toLowerCase(); if(n) tarifa[n]={media:num(r[11]),jornada:num(r[12])}})

function pf(s){const m=txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?{d:new Date(+m[3],+m[2]-1,+m[1]),a:+m[3],m:+m[2]}:null}
const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

const proyectos=[]
PRO.slice(1).forEach(row=>{
  const f=pf(row[3]); if(!f||f.a!==2026)return
  const staff=[]
  PED.forEach(pc=>{
    const ped=txt(row[pc]); if(!ped||ED.test(ped)||!CAM.test(ped))return
    const precio=num(row[pc+1]), pers=txt(row[pc+2])
    if(precio<=1||!pers||/somos magma/i.test(pers))return
    staff.push({ped,precio,pers})
  })
  if(!staff.length)return
  proyectos.push({npresu:txt(row[2]),proy:txt(row[6]),fecha:f.d,mes:f.m,total:num(row[7]),staff})
})

// tarifa modal por persona (proxy de 1 jornada real)
const acum={}
proyectos.forEach(p=>p.staff.forEach(s=>{(acum[s.pers.toLowerCase()]=acum[s.pers.toLowerCase()]||[]).push(s.precio)}))
const modal={}
Object.entries(acum).forEach(([k,arr])=>{const c={};arr.forEach(p=>c[p]=(c[p]||0)+1)
  modal[k]=+Object.entries(c).sort((a,b)=>b[1]-a[1]||(+a[0])-(+b[0]))[0][0]})
function ref(pers,ped){
  const t=tarifa[pers.toLowerCase()], media=/1\/2|½/.test(ped)
  if(t&&t.jornada) return media?(t.media||t.jornada/2):t.jornada
  return modal[pers.toLowerCase()]||0
}

// días del PROYECTO = el máximo de días estimados entre su gente (capeado)
proyectos.forEach(p=>{
  let mx=1
  p.staff.forEach(s=>{const r=ref(s.pers,s.ped); if(!r)return
    mx=Math.max(mx,Math.min(CAP_DIAS,Math.round(s.precio/r)))})
  p.dias=mx
  // jornadas-persona: cada uno según lo que cobró
  p.jornadas=p.staff.reduce((sum,s)=>{const r=ref(s.pers,s.ped)
    return sum+(r?Math.min(CAP_DIAS,Math.max(1,Math.round(s.precio/r))):1)},0)
  p.costo=p.staff.reduce((s,x)=>s+x.precio,0)
  // fechas ocupadas
  p.fechas=[]; for(let i=0;i<p.dias;i++){const d=new Date(p.fecha);d.setDate(d.getDate()+i);p.fechas.push(key(d))}
})

const multi=proyectos.filter(p=>p.dias>1)
console.log(`\n${'█'.repeat(76)}\n  PROYECTOS MULTI-DÍA DETECTADOS\n${'█'.repeat(76)}`)
console.log(`  ${multi.length} de ${proyectos.length} proyectos duraron más de 1 día\n`)
multi.sort((a,b)=>b.dias-a.dias||b.costo-a.costo).slice(0,18).forEach(p=>
  console.log(`  ~${p.dias}d  [${p.npresu.padEnd(5)}] ${p.proy.slice(0,36).padEnd(38)} staff ${money(p.costo).padStart(11)}  factura ${money(p.total)}`))

// --- días de calendario ---
const calendario={} // fecha -> [proyectos]
proyectos.forEach(p=>p.fechas.forEach(f=>(calendario[f]=calendario[f]||[]).push(p)))
const diasCal=Object.keys(calendario).length
const antes=new Set(proyectos.map(p=>key(p.fecha))).size

console.log(`\n${'━'.repeat(76)}\n  DÍAS DE RODAJE — antes vs ahora\n${'━'.repeat(76)}`)
console.log(`  Contando 1 día por proyecto (lo que hacía antes):  ${antes} días  →  ${(antes/8).toFixed(1)}/mes`)
console.log(`  Contando la duración real:                          ${diasCal} días  →  ${(diasCal/8).toFixed(1)}/mes`)

const totJornadas=proyectos.reduce((s,p)=>s+p.jornadas,0)
const totCosto=proyectos.reduce((s,p)=>s+p.costo,0)
console.log(`\n  Jornadas-persona compradas:  ${totJornadas}  (${(totJornadas/8).toFixed(1)}/mes)`)
console.log(`  Costo total staff cámara:    ${money(totCosto)}  (${money(totCosto/8)}/mes)`)
console.log(`  TARIFA REAL POR JORNADA:     ${money(totCosto/totJornadas)}   ← antes creía ${money(totCosto/proyectos.reduce((s,p)=>s+p.staff.length,0))}`)

// --- concurrencia real por día de calendario ---
console.log(`\n${'━'.repeat(76)}\n  CONCURRENCIA REAL (con duraciones corregidas)\n${'━'.repeat(76)}`)
const h={}
Object.values(calendario).forEach(ps=>{const n=ps.length; h[n]=(h[n]||0)+1})
Object.keys(h).map(Number).sort((a,b)=>a-b).forEach(k=>
  console.log(`   ${k} evento(s) simultáneo(s): ${String(h[k]).padStart(3)} días  ${Math.round(h[k]/diasCal*100)}%`))

// --- absorción del fijo: 1 jornada por día de calendario ---
let absorbe=0, queda=0
Object.entries(calendario).forEach(([f,ps])=>{
  // todas las jornadas de ese día, cada una a su precio POR DÍA (precio/días del proyecto)
  const jornadasDia=[]
  ps.forEach(p=>p.staff.forEach(s=>jornadasDia.push(s.precio/p.dias)))
  jornadasDia.sort((a,b)=>b-a)
  absorbe+=jornadasDia[0]||0
  queda+=jornadasDia.slice(1).reduce((s,x)=>s+x,0)
})
console.log(`\n${'█'.repeat(76)}\n  EL MODELO CORREGIDO\n${'█'.repeat(76)}`)
console.log(`  Días con rodaje: ${(diasCal/8).toFixed(1)}/mes  ·  un empleado trabaja ~21 días/mes`)
console.log(`  → ocupación del fijo en rodaje: ${Math.round(diasCal/8/21*100)}%\n`)
console.log(`  Un fijo absorbe:        ${money(absorbe/8).padStart(13)}/mes`)
console.log(`  Sigue yendo a freelance:${money(queda/8).padStart(13)}/mes`)
const EDIC=901200
console.log(`  + edición en días libres:${money(EDIC).padStart(12)}/mes`)
const ABS=absorbe/8+EDIC
console.log(`  ${'─'.repeat(45)}`)
console.log(`  TOTAL que deja de pagar: ${money(ABS).padStart(12)}/mes\n`)
const F=1.49, N=0.83
console.log(`  neto bolsillo    costo empresa       ahorro/mes        ahorro/año`)
;[1200e3,1500e3,1800e3,2100e3].forEach(neto=>{const c=neto/N*F, a=ABS-c
  console.log(`  ${money(neto).padStart(12)}  ${money(c).padStart(15)}  ${money(a).padStart(15)}  ${money(a*12).padStart(15)}  ${a>0?'✓':'✗'}`)})
console.log(`\n  PUNTO DE EQUILIBRIO: ${money(ABS/F*N)} neto de bolsillo`)
