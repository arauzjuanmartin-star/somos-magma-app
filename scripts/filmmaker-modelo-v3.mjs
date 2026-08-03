/**
 * MODELO v3 — con los días REALES confirmados por Juan.
 * Unidad = JORNADA (media o entera cuenta 1, criterio de Juan).
 * Lee PROYECTOS CG (Días) y CH (Días x persona). Lo que no tiene dato = 1 jornada.
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
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const CAM=/film|c[aá]mara|camara|video|foto|dirfoto|asist/i
const ED=/edit|edici|post|color|dise|anim|motion/i
const NOJOR=/comision|model|makeup|maquilla|viatico|rental|alquiler|servicio|crudos|vivo/i
const INTERNO=/sofia maria grenier|juan martin arauz|tom[aá]s halbach|luc[ií]a mar[ií]a grenier/i

const R=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS',valueRenderOption:'FORMATTED_VALUE'})
const PRO=R.data.values

function pf(s){const m=txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?{d:new Date(+m[3],+m[2]-1,+m[1]),mes:+m[2],anio:+m[3]}:null}
const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

const proyectos=[]
PRO.slice(1).forEach(row=>{
  const f=pf(row[3]); if(!f||f.anio!==2026)return
  const dias=num(row[84])||1
  const exc={}
  txt(row[85]).split('|').forEach(par=>{const m=par.match(/^\s*(.+?):(\d+)\s*$/); if(m)exc[m[1].trim()]=+m[2]})
  const staff=[]
  PED.forEach(pc=>{const ped=txt(row[pc]); if(!ped||ED.test(ped)||NOJOR.test(ped)||!CAM.test(ped))return
    const precio=num(row[pc+1]), pers=txt(row[pc+2])
    if(precio<=1||!pers||/somos magma/i.test(pers))return
    staff.push({ped,precio,pers,jornadas:exc[pers]??dias,interno:INTERNO.test(pers)})})
  if(!staff.length)return
  const fechas=[]; for(let i=0;i<dias;i++){const d=new Date(f.d);d.setDate(d.getDate()+i);fechas.push(key(d))}
  proyectos.push({npresu:txt(row[2]),proy:txt(row[6]),mes:f.mes,dias,fechas,staff,
    costo:staff.reduce((s,x)=>s+x.precio,0),revisado:txt(row[86])==='revisado'})
})

const MESES=[1,2,3,4,5,6,7]
const win=proyectos.filter(p=>MESES.includes(p.mes))
const n=MESES.length
const totJornadas=win.reduce((s,p)=>s+p.staff.reduce((a,x)=>a+x.jornadas,0),0)
const totCosto=win.reduce((s,p)=>s+p.costo,0)
const jornExt=win.reduce((s,p)=>s+p.staff.filter(x=>!x.interno).reduce((a,x)=>a+x.jornadas,0),0)
const costExt=win.reduce((s,p)=>s+p.staff.filter(x=>!x.interno).reduce((a,x)=>a+x.precio,0),0)
const costInt=totCosto-costExt

console.log(`\n${'█'.repeat(74)}\n  MODELO v3 — con días reales (1 jornada = media o entera)\n${'█'.repeat(74)}`)
console.log(`  Proyectos ene-jul 2026 con cámara: ${win.length}  (${win.filter(p=>p.revisado).length} revisados con Juan)`)
console.log(`\n  JORNADAS-PERSONA compradas:  ${totJornadas}   → ${(totJornadas/n).toFixed(1)}/mes`)
console.log(`     de freelancers externos:  ${jornExt}   → ${(jornExt/n).toFixed(1)}/mes`)
console.log(`     del equipo (vos/Sofi/Tom/Lulu): ${totJornadas-jornExt}   → ${((totJornadas-jornExt)/n).toFixed(1)}/mes`)
console.log(`\n  COSTO staff cámara:          ${money(totCosto)}  → ${money(totCosto/n)}/mes`)
console.log(`     freelancers externos:     ${money(costExt)}  → ${money(costExt/n)}/mes`)
console.log(`     equipo interno:           ${money(costInt)}  → ${money(costInt/n)}/mes`)
console.log(`\n  COSTO REAL POR JORNADA:      ${money(totCosto/totJornadas)}`)

// días de calendario
const cal={}
win.forEach(p=>p.fechas.forEach(f=>(cal[f]=cal[f]||[]).push(p)))
const diasCal=Object.keys(cal).length
console.log(`\n  Días de calendario con rodaje: ${diasCal}  → ${(diasCal/n).toFixed(1)}/mes`)
console.log(`  Ocupación de un fijo (sobre 21 días hábiles): ${Math.round(diasCal/n/21*100)}%`)

// absorción: el fijo cubre 1 jornada por día de calendario
let abs=0, queda=0
Object.entries(cal).forEach(([f,ps])=>{
  const js=[]
  ps.forEach(p=>p.staff.forEach(s=>js.push(s.precio/s.jornadas)))  // precio por jornada
  js.sort((a,b)=>b-a)
  abs+=js[0]||0; queda+=js.slice(1).reduce((s,x)=>s+x,0)
})
const EDIC=901200
console.log(`\n${'━'.repeat(74)}\n  QUÉ ABSORBE UN FIJO\n${'━'.repeat(74)}`)
console.log(`  1 jornada por día de rodaje:      ${money(abs/n).padStart(13)}/mes`)
console.log(`  + edición en días sin rodaje:     ${money(EDIC).padStart(13)}/mes`)
const ABS=abs/n+EDIC
console.log(`  ${'─'.repeat(46)}`)
console.log(`  TOTAL que deja de pagarse afuera: ${money(ABS).padStart(13)}/mes`)
console.log(`  Sigue yendo a freelance:          ${money(queda/n).padStart(13)}/mes\n`)
const F=1.49,N=0.83
console.log(`  neto bolsillo    costo empresa      ahorro/mes       ahorro/año`)
;[1200e3,1500e3,1800e3,2100e3].forEach(neto=>{const c=neto/N*F,a=ABS-c
  console.log(`  ${money(neto).padStart(12)}  ${money(c).padStart(15)}  ${money(a).padStart(14)}  ${money(a*12).padStart(15)}  ${a>0?'✓':'✗'}`)})
console.log(`\n  PUNTO DE EQUILIBRIO: ${money(ABS/F*N)} neto de bolsillo`)
