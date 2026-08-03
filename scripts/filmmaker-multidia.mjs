/**
 * Detecta proyectos MULTI-DÍA cargados como una sola jornada.
 * Cruza lo pagado a cada persona contra su tarifa de referencia (RRHH) y contra
 * su propia tarifa modal (el precio que más repite). Ratio alto = varios días.
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
const CAM=/film|c[aá]mara|camara|video|foto|dirfoto|asist/i
const ED=/edit|edici|post|color/i
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47]

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS','RRHH'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,RR]=R.data.valueRanges.map(v=>v.values||[])

// tarifas de referencia de RRHH
const tarifa={} // nombre lower -> {media, jornada}
RR.slice(1).forEach(r=>{const n=txt(r[0]).toLowerCase(); if(!n)return
  tarifa[n]={media:num(r[11]),jornada:num(r[12]),rubro:txt(r[1])}})

// juntar todas las líneas de staff de cámara 2026
function pf(s){const m=txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?{k:`${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`,a:+m[3]}:null}
const lineas=[]
PRO.slice(1).forEach(row=>{
  const f=pf(row[3]); if(!f||f.a!==2026)return
  PED.forEach(pc=>{
    const ped=txt(row[pc]); if(!ped||ED.test(ped)||!CAM.test(ped))return
    const precio=num(row[pc+1]), staff=txt(row[pc+2])
    if(precio<=1||!staff||/somos magma/i.test(staff))return
    lineas.push({fecha:f.k,npresu:txt(row[2]),proy:txt(row[6]),total:num(row[7]),ped,precio,staff})
  })
})

// tarifa modal por persona: el precio que más repite (proxy de 1 jornada real)
const porPers={}
lineas.forEach(l=>{const k=l.staff.toLowerCase();(porPers[k]=porPers[k]||[]).push(l.precio)})
const modal={}
Object.entries(porPers).forEach(([k,arr])=>{
  const c={}; arr.forEach(p=>c[p]=(c[p]||0)+1)
  const top=Object.entries(c).sort((a,b)=>b[1]-a[1]||(+a[0])-(+b[0]))[0]
  const sorted=[...arr].sort((a,b)=>a-b)
  modal[k]={precio:+top[0],veces:top[1],mediana:sorted[Math.floor(sorted.length/2)],n:arr.length}
})

// referencia de 1 jornada: media jornada x2 si el pedido dice 1/2, sino jornada de RRHH; fallback modal
function refJornada(staff,ped){
  const t=tarifa[staff.toLowerCase()]
  const esMedia=/1\/2|½/.test(ped)
  if(t&&t.jornada) return esMedia? (t.media||t.jornada/2) : t.jornada
  const m=modal[staff.toLowerCase()]
  return m? m.precio : 0
}

console.log(`\n${'█'.repeat(78)}\n  CANDIDATOS A MULTI-DÍA — cobros muy por encima de la tarifa de la persona\n${'█'.repeat(78)}`)
const sospechosos=[]
lineas.forEach(l=>{
  const ref=refJornada(l.staff,l.ped); if(!ref)return
  const ratio=l.precio/ref
  if(ratio>=1.6) sospechosos.push({...l,ref,ratio,dias:Math.round(ratio*2)/2})
})
sospechosos.sort((a,b)=>b.precio-a.precio)
console.log(`\n  ${'fecha'.padEnd(11)}${'proyecto'.padEnd(30)}${'persona'.padEnd(24)}${'pedido'.padEnd(12)}${'cobró'.padStart(12)}  ${'ref 1 jorn'.padStart(11)}  días?`)
sospechosos.forEach(s=>console.log(`  ${s.fecha.padEnd(11)}${s.proy.slice(0,28).padEnd(30)}${s.staff.slice(0,22).padEnd(24)}${s.ped.slice(0,10).padEnd(12)}${money(s.precio).padStart(12)}  ${money(s.ref).padStart(11)}  ~${s.dias}`))

const extraDias=sospechosos.reduce((s,x)=>s+(x.dias-1),0)
console.log(`\n  ${sospechosos.length} líneas sospechosas · días de rodaje NO contabilizados: ~${extraDias.toFixed(0)}`)

// --- proyectos grandes: los que más probablemente sean multi-día ---
console.log(`\n${'━'.repeat(78)}\n  PROYECTOS GRANDES (total > $3M) — revisar cuántos días fueron\n${'━'.repeat(78)}`)
const porProy={}
lineas.forEach(l=>{const p=porProy[l.npresu]=porProy[l.npresu]||{proy:l.proy,fecha:l.fecha,total:l.total,staff:[],costo:0}
  p.staff.push(l); p.costo+=l.precio})
Object.entries(porProy).filter(([,p])=>p.total>3e6).sort((a,b)=>b[1].total-a[1].total).forEach(([n,p])=>{
  console.log(`\n  [${n}] ${p.proy}  ·  ${p.fecha}  ·  factura ${money(p.total)}  ·  staff cámara ${money(p.costo)}`)
  p.staff.sort((a,b)=>b.precio-a.precio).forEach(s=>{
    const ref=refJornada(s.staff,s.ped)
    const r=ref?(s.precio/ref):0
    console.log(`      ${money(s.precio).padStart(12)}  ${s.ped.padEnd(12)} ${s.staff.slice(0,26).padEnd(28)}${ref?`ref ${money(ref)} → ~${(Math.round(r*2)/2)} días`:'(sin tarifa ref)'}`)})
})

// --- impacto: días de rodaje reales ---
const diasUnicos=new Set(lineas.map(l=>l.fecha)).size
console.log(`\n${'━'.repeat(78)}\n  IMPACTO EN EL MODELO\n${'━'.repeat(78)}`)
console.log(`  Días de rodaje contados hoy (fechas únicas):        ${diasUnicos}`)
console.log(`  Días extra escondidos en proyectos multi-día:      ~${extraDias.toFixed(0)}`)
console.log(`  DÍAS DE RODAJE REALES estimados:                   ~${diasUnicos+Math.round(extraDias)}  (${((diasUnicos+extraDias)/8).toFixed(1)}/mes)`)
const totCosto=lineas.reduce((s,l)=>s+l.precio,0)
console.log(`\n  Costo total staff cámara 2026:  ${money(totCosto)}`)
console.log(`  Tarifa por día si contás ${diasUnicos} días:  ${money(totCosto/diasUnicos)}`)
console.log(`  Tarifa por día REAL (~${diasUnicos+Math.round(extraDias)} días):     ${money(totCosto/(diasUnicos+extraDias))}`)
