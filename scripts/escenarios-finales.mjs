/**
 * Escenarios finales, con la separación correcta EDICIÓN vs CÁMARA:
 *  A) Lucho filmmaker fijo (solo cámara, no edita)
 *  B) Editor fijo nuevo (absorbe TODOS los extras de edición, incluida Lulú)
 *  C) Sofi editora fija + PM nuevo
 *  D) A + B juntos
 * Todo monotributista: SIN cargas sociales. Solo lectura.
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
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const N=7 // ene-jul
function rol(p0){const p=txt(p0).toLowerCase()
  if(/comision|rental|alquiler|viatico|servicio|crudos|catering/.test(p))return 'NO'
  if(/edit|edici|color|motion|anim|dise/.test(p))return 'EDICION'
  if(/dirfoto|director de fot/.test(p))return 'CAMARA'
  if(/asist/.test(p))return 'ASIST'
  if(/produ/.test(p))return 'PRODU'
  if(/sonid|audio/.test(p))return 'SONIDO'
  if(/vivo|stream/.test(p))return 'VIVO'
  if(/locu/.test(p))return 'LOCU'
  if(/drone|dron|fpv/.test(p))return 'DRONE'
  if(/makeup|maquilla|model|peluq/.test(p))return 'OTROS'
  if(/film|c[aá]mara|camara|video|foto/.test(p))return 'CAMARA'
  return 'SIN'}

const R=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS',valueRenderOption:'FORMATTED_VALUE'})
const PRO=R.data.values
function pf(s){const m=txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?{d:new Date(+m[3],+m[2]-1,+m[1]),mes:+m[2],anio:+m[3]}:null}
const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const L=[], diasRodaje=new Set()
PRO.slice(1).forEach(row=>{
  const f=pf(row[3]); if(!f||f.anio!==2026||f.mes>7)return
  const dias=num(row[84])||1
  const exc={}; txt(row[85]).split('|').forEach(p=>{const m=p.match(/^\s*(.+?):(\d+)\s*$/); if(m)exc[m[1].trim()]=+m[2]})
  let cam=false
  PED.forEach(pc=>{const ped=txt(row[pc]); if(!ped)return
    const precio=num(row[pc+1]), pers=txt(row[pc+2])
    if(precio<=1||!pers||/somos magma/i.test(pers))return
    const r=rol(ped); if(r==='NO')return
    if(r==='CAMARA')cam=true
    L.push({mes:f.mes,rol:r,precio,pers,jorn:exc[pers]??dias})})
  if(cam) for(let i=0;i<dias;i++){const d=new Date(f.d);d.setDate(d.getDate()+i);diasRodaje.add(key(d))}
})
const J=a=>a.reduce((s,x)=>s+x.jorn,0), $=a=>a.reduce((s,x)=>s+x.precio,0)
const cam=L.filter(l=>l.rol==='CAMARA'), edi=L.filter(l=>l.rol==='EDICION')
const T_CAM=$(cam)/J(cam), T_EDI=$(edi)/J(edi)
const DIAS=diasRodaje.size/N

console.log(`\n${'█'.repeat(78)}\n  BASE (ene-jul 2026, sin cargas sociales — todos monotributistas)\n${'█'.repeat(78)}`)
console.log(`  CÁMARA:  ${(J(cam)/N).toFixed(1)} jorn/mes · ${money($(cam)/N)}/mes · ${money(T_CAM)}/jornada`)
console.log(`  EDICIÓN: ${(J(edi)/N).toFixed(1)} jorn/mes · ${money($(edi)/N)}/mes · ${money(T_EDI)}/jornada`)
console.log(`  Días de rodaje: ${DIAS.toFixed(1)}/mes  → techo de un filmmaker fijo`)

// --- quién cobra edición (todo es absorbible: los sueldos de Lulu/Dani son por otro rol) ---
console.log(`\n${'━'.repeat(78)}\n  EDICIÓN — todos los extras son absorbibles (Lulú cobra sueldo por PM, no por editar)\n${'━'.repeat(78)}`)
const pe={}; edi.forEach(l=>{const o=pe[l.pers]=pe[l.pers]||{j:0,$:0}; o.j+=l.jorn; o.$+=l.precio})
Object.entries(pe).sort((a,b)=>b[1].$-a[1].$).forEach(([p,o])=>
  console.log(`  ${String(o.j).padStart(4)} jorn  ${money(o.$).padStart(12)}  ${money(o.$/N).padStart(11)}/mes  ${p}`))
const EDI_MES=$(edi)/N, EDI_JORN=J(edi)/N
console.log(`  ${'─'.repeat(60)}`)
console.log(`  TOTAL ABSORBIBLE: ${money(EDI_MES)}/mes  ·  ${EDI_JORN.toFixed(1)} jornadas/mes`)
console.log(`  Un editor fijo hace ~21 jorn/mes → cubre TODO y le sobran ${(21-EDI_JORN).toFixed(1)} jornadas (edición de fotos, etc.)`)

// --- Sofi hoy ---
const sofi=L.filter(l=>/sofia maria grenier/i.test(l.pers))
console.log(`\n${'━'.repeat(78)}\n  SOFI HOY (además del sueldo de ${money(2800000)})\n${'━'.repeat(78)}`)
const sr={}; sofi.forEach(l=>{const o=sr[l.rol]=sr[l.rol]||{j:0,$:0}; o.j+=l.jorn; o.$+=l.precio})
Object.entries(sr).sort((a,b)=>b[1].$-a[1].$).forEach(([r,o])=>
  console.log(`  ${r.padEnd(10)} ${String(o.j).padStart(3)} jorn · ${money(o.$).padStart(12)} · ${money(o.$/N)}/mes`))
console.log(`  TOTAL extras de Sofi: ${money($(sofi)/N)}/mes`)

// --- escenarios ---
const esc=(nom,absorbe,costo,nota)=>{
  const a=absorbe-costo
  console.log(`\n▓ ${nom}`)
  console.log(`   absorbe   ${money(absorbe).padStart(13)}/mes`)
  console.log(`   le pagás  ${money(costo).padStart(13)}/mes`)
  console.log(`   AHORRO    ${money(a).padStart(13)}/mes   ·   ${money(a*12)}/año   ${a>0?'✓':'✗'}`)
  if(nota) console.log(`   ${nota}`)
}
console.log(`\n${'█'.repeat(78)}\n  LOS ESCENARIOS\n${'█'.repeat(78)}`)
const CAM_ABS=DIAS*T_CAM
console.log(`\n═══ A · LUCHO FILMMAKER FIJO (solo cámara, no edita) ═══`)
console.log(`   Techo: ${DIAS.toFixed(1)} jornadas de cámara/mes × ${money(T_CAM)} = ${money(CAM_ABS)}`)
;[1600000,1900000,2200000].forEach(m=>esc(`  pagándole ${money(m)}`,CAM_ABS,m,
  `tarifa efectiva ${money(m/DIAS)}/jornada (hoy Lucho cobra $172.492, el mercado ${money(T_CAM)})`))

console.log(`\n═══ B · EDITOR FIJO NUEVO (absorbe todos los extras de edición) ═══`)
;[1200000,1500000,1800000].forEach(m=>esc(`  pagándole ${money(m)}`,EDI_MES,m,
  `tarifa efectiva ${money(m/EDI_JORN)}/jornada (el mercado paga ${money(T_EDI)})`))

console.log(`\n═══ C · SOFI EDITORA FIJA + PM NUEVO ═══`)
const sofiCam=$(sofi.filter(l=>l.rol==='CAMARA'))/N
;[1200000,1500000,1800000].forEach(pm=>{
  // Sofi absorbe la edición de otros; se pierde su cámara (hay que comprarla afuera)
  const absorbe=EDI_MES-$(edi.filter(l=>/sofia/i.test(l.pers)))/N
  esc(`  PM nuevo a ${money(pm)}`,absorbe,pm+sofiCam,
    `Sofi deja de facturar ${money(sofiCam)}/mes de cámara → hay que comprarla afuera`)
})

console.log(`\n═══ D · LOS DOS (Lucho filmmaker + editor fijo) ═══`)
esc('  Lucho $1.900.000 + editor $1.500.000',CAM_ABS+EDI_MES,1900000+1500000,
  `cubre ${DIAS.toFixed(1)} jornadas de cámara + ${EDI_JORN.toFixed(1)} de edición por mes`)
