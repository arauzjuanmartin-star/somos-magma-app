/**
 * ANÁLISIS A FONDO: Lucho (Jorge Luis Chavez) como fijo.
 * Qué hace hoy, qué es Austral, cuánta capacidad le queda, qué días NO puede cubrir.
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
const MES=['','ene','feb','mar','abr','may','jun','jul']
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const N=7
const LUCHO=/jorge\s+luis\s+chavez/i
function rol(p0){const p=txt(p0).toLowerCase()
  if(/comision|rental|alquiler|viatico|servicio|crudos|catering/.test(p))return 'NO'
  if(/edit|edici|color|motion|anim|dise/.test(p))return 'EDICION'
  if(/asist/.test(p))return 'ASIST'
  if(/produ/.test(p))return 'PRODU'
  if(/sonid|audio/.test(p))return 'SONIDO'
  if(/vivo|stream/.test(p))return 'VIVO'
  if(/locu/.test(p))return 'LOCU'
  if(/drone|dron|fpv/.test(p))return 'DRONE'
  if(/makeup|maquilla|model|peluq/.test(p))return 'OTROS'
  if(/film|c[aá]mara|camara|video|foto|dirfoto/.test(p))return 'CAMARA'
  return 'SIN'}
function pf(s){const m=txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?{d:new Date(+m[3],+m[2]-1,+m[1]),mes:+m[2],anio:+m[3]}:null}
const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

const R=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS',valueRenderOption:'FORMATTED_VALUE'})
const PRO=R.data.values
const L=[], proyectos=[]
PRO.slice(1).forEach(row=>{
  const f=pf(row[3]); if(!f||f.anio!==2026||f.mes>7)return
  const dias=num(row[84])||1
  const exc={}; txt(row[85]).split('|').forEach(p=>{const m=p.match(/^\s*(.+?):(\d+)\s*$/); if(m)exc[m[1].trim()]=+m[2]})
  const ag=txt(row[4])||txt(row[5])||'—'
  const st=[]
  PED.forEach(pc=>{const ped=txt(row[pc]); if(!ped)return
    const precio=num(row[pc+1]), pers=txt(row[pc+2])
    if(precio<=1||!pers||/somos magma/i.test(pers))return
    const r=rol(ped); if(r==='NO')return
    const o={mes:f.mes,rol:r,precio,pers,jorn:exc[pers]??dias,ag,proy:txt(row[6]),npresu:txt(row[2]),ped}
    L.push(o); st.push(o)})
  if(st.length){
    const fechas=[]; for(let i=0;i<dias;i++){const d=new Date(f.d);d.setDate(d.getDate()+i);fechas.push(key(d))}
    proyectos.push({npresu:txt(row[2]),proy:txt(row[6]),ag,mes:f.mes,dias,fechas,staff:st})}
})
const J=a=>a.reduce((s,x)=>s+x.jorn,0), $=a=>a.reduce((s,x)=>s+x.precio,0)
const cam=L.filter(l=>l.rol==='CAMARA'), edi=L.filter(l=>l.rol==='EDICION')
const T_CAM=$(cam)/J(cam), T_EDI=$(edi)/J(edi)

// ---------- 1. LUCHO HOY ----------
const lu=L.filter(l=>LUCHO.test(l.pers))
console.log(`\n${'█'.repeat(78)}\n  1 · LUCHO HOY (ene-jul 2026)\n${'█'.repeat(78)}`)
console.log(`  mes    jorn cámara   jorn edición   total   facturó`)
for(let m=1;m<=7;m++){const d=lu.filter(l=>l.mes===m)
  const c=d.filter(l=>l.rol==='CAMARA'), e=d.filter(l=>l.rol==='EDICION')
  console.log(`  ${MES[m].padEnd(5)} ${String(J(c)).padStart(11)} ${String(J(e)).padStart(14)} ${String(J(d)).padStart(7)}   ${money($(d)).padStart(12)}`)}
console.log(`  ${'─'.repeat(60)}`)
console.log(`  TOTAL ${String(J(lu.filter(l=>l.rol==='CAMARA'))).padStart(11)} ${String(J(lu.filter(l=>l.rol==='EDICION'))).padStart(14)} ${String(J(lu)).padStart(7)}   ${money($(lu)).padStart(12)}`)
console.log(`  PROM  ${(J(lu.filter(l=>l.rol==='CAMARA'))/N).toFixed(1).padStart(11)} ${(J(lu.filter(l=>l.rol==='EDICION'))/N).toFixed(1).padStart(14)} ${(J(lu)/N).toFixed(1).padStart(7)}   ${money($(lu)/N).padStart(12)}`)
console.log(`\n  Tarifa cámara Lucho:  ${money($(lu.filter(l=>l.rol==='CAMARA'))/J(lu.filter(l=>l.rol==='CAMARA')))}   (mercado ${money(T_CAM)})`)
console.log(`  Tarifa edición Lucho: ${money($(lu.filter(l=>l.rol==='EDICION'))/J(lu.filter(l=>l.rol==='EDICION')))}   (mercado ${money(T_EDI)})`)
console.log(`\n  Para quién trabaja Lucho:`)
const lag={}; lu.forEach(l=>{const o=lag[l.ag]=lag[l.ag]||{j:0,$:0}; o.j+=l.jorn; o.$+=l.precio})
Object.entries(lag).sort((a,b)=>b[1].j-a[1].j).forEach(([a,o])=>
  console.log(`   ${String(o.j).padStart(3)} jorn  ${money(o.$).padStart(12)}  ${a}`))

// ---------- 2. AUSTRAL ----------
const AU=/austral/i
const au=L.filter(l=>AU.test(l.ag)||AU.test(l.proy))
console.log(`\n${'█'.repeat(78)}\n  2 · AUSTRAL — el cliente de volumen\n${'█'.repeat(78)}`)
const auP=[...new Set(au.map(l=>l.npresu))].length
console.log(`  ${auP} proyectos · ${J(au)} jornadas · ${money($(au))} · ${money($(au)/N)}/mes`)
const aur={}; au.forEach(l=>{const o=aur[l.rol]=aur[l.rol]||{j:0,$:0}; o.j+=l.jorn; o.$+=l.precio})
console.log(`\n  por rol:`)
Object.entries(aur).sort((a,b)=>b[1].j-a[1].j).forEach(([r,o])=>
  console.log(`   ${r.padEnd(9)} ${String(o.j).padStart(3)} jorn · ${money(o.$).padStart(11)} · ${money(o.$/o.j).padStart(10)}/jornada`))
console.log(`\n  quién lo hace hoy:`)
const aup={}; au.forEach(l=>{const o=aup[l.pers]=aup[l.pers]||{j:0,$:0}; o.j+=l.jorn; o.$+=l.precio})
Object.entries(aup).sort((a,b)=>b[1].j-a[1].j).forEach(([p,o])=>
  console.log(`   ${String(o.j).padStart(3)} jorn  ${money(o.$).padStart(11)}  ${p}`))
console.log(`\n  por mes: ${[1,2,3,4,5,6,7].map(m=>MES[m]+' '+J(au.filter(l=>l.mes===m))).join(' · ')}`)

// ---------- 3. CAPACIDAD: qué puede absorber Lucho fijo ----------
console.log(`\n${'█'.repeat(78)}\n  3 · LUCHO FIJO — qué puede absorber realmente\n${'█'.repeat(78)}`)
console.log(`  Regla: 1 jornada de cámara por día de rodaje (no puede estar en 2 lugares).`)
console.log(`  La edición la puede hacer cualquier día.\n`)
const CAP=21
console.log(`  mes  díasRodaje  cám(absorbe)  edic disp  edic(absorbe)  total  ocioso  valor absorbido`)
let totAbs=0, totCam=0, totEdi=0
for(let m=1;m<=7;m++){
  const dr=new Set(proyectos.filter(p=>p.mes===m&&p.staff.some(s=>s.rol==='CAMARA')).flatMap(p=>p.fechas)).size
  const camDisp=J(cam.filter(l=>l.mes===m))
  const ediDisp=J(edi.filter(l=>l.mes===m))
  const cAbs=Math.min(dr,camDisp,CAP)
  const eAbs=Math.min(ediDisp,Math.max(0,CAP-cAbs))
  const val=cAbs*T_CAM+eAbs*T_EDI
  totAbs+=val; totCam+=cAbs; totEdi+=eAbs
  console.log(`  ${MES[m].padEnd(4)} ${String(dr).padStart(9)} ${String(cAbs).padStart(13)} ${String(ediDisp).padStart(10)} ${String(eAbs).padStart(14)} ${String(cAbs+eAbs).padStart(6)} ${String(Math.max(0,CAP-cAbs-eAbs)).padStart(7)}  ${money(val).padStart(14)}`)
}
console.log(`  ${'─'.repeat(76)}`)
console.log(`  PROM ${' '.repeat(9)} ${(totCam/N).toFixed(1).padStart(13)} ${' '.repeat(10)} ${(totEdi/N).toFixed(1).padStart(14)} ${((totCam+totEdi)/N).toFixed(1).padStart(6)} ${(CAP-(totCam+totEdi)/N).toFixed(1).padStart(7)}  ${money(totAbs/N).padStart(14)}`)

console.log(`\n${'━'.repeat(78)}\n  EL NÚMERO DE LUCHO FIJO\n${'━'.repeat(78)}`)
const ABS=totAbs/N
console.log(`  Absorbe ${money(ABS)}/mes  (${(totCam/N).toFixed(1)} jorn cámara + ${(totEdi/N).toFixed(1)} jorn edición)`)
console.log(`  Hoy le pagás ${money($(lu)/N)}/mes por ${(J(lu)/N).toFixed(1)} jornadas\n`)
;[1600000,1900000,2200000,2500000].forEach(M=>{
  const a=ABS-M, jj=(totCam+totEdi)/N
  console.log(`  ${money(M)}/mes → ahorro ${money(a).padStart(13)}/mes · ${money(a*12).padStart(14)}/año · él ${M>$(lu)/N?'gana +'+money(M-$(lu)/N):'pierde '+money($(lu)/N-M)} · efectiva ${money(M/jj)}/jorn`)})

// ---------- 4. LO QUE NO PUEDE CUBRIR ----------
console.log(`\n${'█'.repeat(78)}\n  4 · LO QUE LUCHO FIJO **NO** CUBRE\n${'█'.repeat(78)}`)
const porFecha={}
proyectos.forEach(p=>p.fechas.forEach(f=>{const o=porFecha[f]=porFecha[f]||[]
  p.staff.filter(s=>s.rol==='CAMARA').forEach(s=>o.push(s))}))
let sobran=0, sobran$=0, diasMulti=0
Object.entries(porFecha).forEach(([f,ss])=>{
  if(ss.length>1){diasMulti++; sobran+=ss.length-1; sobran$+=ss.slice(1).reduce((s,x)=>s+x.precio/1,0)}})
console.log(`  Días con 2+ personas de cámara: ${diasMulti} de ${Object.keys(porFecha).length}`)
console.log(`  Jornadas de cámara que igual hay que comprar afuera: ~${(J(cam)-totCam)} en 7 meses → ${((J(cam)-totCam)/N).toFixed(1)}/mes`)
console.log(`  Eso vale ${money((J(cam)-totCam)*T_CAM/N)}/mes que SEGUÍS pagando a freelancers.`)
console.log(`\n  Y además, ${(J(edi.filter(l=>true))/N).toFixed(1)} jorn/mes de edición disponibles pero solo absorbe ${(totEdi/N).toFixed(1)}.`)
