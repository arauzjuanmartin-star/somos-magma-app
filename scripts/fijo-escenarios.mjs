/**
 * Tres escenarios de contratación fija: filmmaker puro / editor puro / MIXTO (lo que ya hace Lucho).
 * Incluye estacionalidad mes a mes (capacidad ociosa) y peso de Austral en la edición.
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

const L=[]           // líneas
const diasRodaje={}  // mes -> Set(fechas)
PRO.slice(1).forEach(row=>{
  const f=pf(row[3]); if(!f||f.anio!==2026||f.mes>7)return
  const dias=num(row[84])||1
  const exc={}; txt(row[85]).split('|').forEach(par=>{const m=par.match(/^\s*(.+?):(\d+)\s*$/); if(m)exc[m[1].trim()]=+m[2]})
  const ag=txt(row[4]), cli=txt(row[5])
  let tieneCam=false
  PED.forEach(pc=>{
    const ped=txt(row[pc]); if(!ped)return
    const precio=num(row[pc+1]), pers=txt(row[pc+2])
    if(precio<=1||!pers||/somos magma/i.test(pers))return
    const r=rol(ped); if(r==='NO')return
    if(r==='CAMARA')tieneCam=true
    L.push({mes:f.mes,rol:r,precio,pers,jorn:exc[pers]??dias,ag,cli,proy:txt(row[6])})
  })
  if(tieneCam){ for(let i=0;i<dias;i++){const d=new Date(f.d);d.setDate(d.getDate()+i)
    ;(diasRodaje[f.mes]=diasRodaje[f.mes]||new Set()).add(key(d))} }
})
const MESES=[1,2,3,4,5,6,7], n=MESES.length
const J=a=>a.reduce((s,x)=>s+x.jorn,0), $=a=>a.reduce((s,x)=>s+x.precio,0)
const cam=L.filter(l=>l.rol==='CAMARA'), edi=L.filter(l=>l.rol==='EDICION')
const tCam=$(cam)/J(cam), tEdi=$(edi)/J(edi)

console.log(`\n${'█'.repeat(76)}\n  TARIFAS REALES\n${'█'.repeat(76)}`)
console.log(`  CÁMARA:   ${J(cam)} jornadas · ${money($(cam))} · ${money(tCam)}/jornada · ${(J(cam)/n).toFixed(1)}/mes`)
console.log(`  EDICIÓN:  ${J(edi)} jornadas · ${money($(edi))} · ${money(tEdi)}/jornada · ${(J(edi)/n).toFixed(1)}/mes`)

console.log(`\n${'━'.repeat(76)}\n  ESTACIONALIDAD — cuánto trabajo hay realmente cada mes\n${'━'.repeat(76)}`)
console.log(`  mes   días rodaje   jorn cámara   jorn edición   TECHO del fijo   ocioso (de 21)`)
const cap={}
MESES.forEach(m=>{
  const dr=(diasRodaje[m]||new Set()).size
  const jc=J(cam.filter(l=>l.mes===m)), je=J(edi.filter(l=>l.mes===m))
  const camCubre=Math.min(dr,jc)          // 1 jornada de cámara por día de rodaje
  const ediCubre=Math.min(je,Math.max(0,21-camCubre))
  cap[m]={dr,jc,je,camCubre,ediCubre,total:camCubre+ediCubre}
  console.log(`  ${MES[m].padEnd(5)} ${String(dr).padStart(8)} ${String(jc).padStart(13)} ${String(je).padStart(14)} ${String(camCubre+ediCubre).padStart(15)} ${String(Math.max(0,21-camCubre-ediCubre)).padStart(14)}`)
})
const sumCam=MESES.reduce((s,m)=>s+cap[m].camCubre,0), sumEdi=MESES.reduce((s,m)=>s+cap[m].ediCubre,0)
console.log(`  ${'─'.repeat(72)}`)
console.log(`  PROM  ${(MESES.reduce((s,m)=>s+cap[m].dr,0)/n).toFixed(1).padStart(8)} ${(J(cam)/n).toFixed(1).padStart(13)} ${(J(edi)/n).toFixed(1).padStart(14)} ${((sumCam+sumEdi)/n).toFixed(1).padStart(15)}`)

const F=1.49,N=0.83, costo=neto=>neto/N*F
function esc(nom,valorMes,detalle){
  console.log(`\n▓ ${nom}`)
  console.log(`   absorbe ${money(valorMes)}/mes   ${detalle}`)
  console.log(`   ${'neto'.padStart(12)} ${'costo empresa'.padStart(15)} ${'ahorro/mes'.padStart(14)} ${'ahorro/año'.padStart(15)}`)
  ;[1200e3,1500e3,1800e3].forEach(x=>{const c=costo(x),a=valorMes-c
    console.log(`   ${money(x).padStart(12)} ${money(c).padStart(15)} ${money(a).padStart(14)} ${money(a*12).padStart(15)}  ${a>0?'✓':'✗'}`)})
  console.log(`   punto de equilibrio: ${money(valorMes/F*N)} neto`)
}
console.log(`\n${'█'.repeat(76)}\n  LOS TRES ESCENARIOS\n${'█'.repeat(76)}`)
esc('A · FILMMAKER PURO (solo cámara)', sumCam/n*tCam, `${(sumCam/n).toFixed(1)} jornadas de cámara/mes × ${money(tCam)}`)
esc('B · EDITOR PURO (solo edición)', J(edi)/n*tEdi, `${(J(edi)/n).toFixed(1)} jornadas de edición/mes × ${money(tEdi)}`)
esc('C · MIXTO cámara+edición (lo que ya hace Lucho)', (sumCam*tCam+sumEdi*tEdi)/n, `${(sumCam/n).toFixed(1)} cámara + ${(sumEdi/n).toFixed(1)} edición por mes`)

console.log(`\n${'━'.repeat(76)}\n  DE DÓNDE SALE LA EDICIÓN (quién la pide)\n${'━'.repeat(76)}`)
const porAg={}
edi.forEach(l=>{const k=(l.ag||l.cli||'—'); const o=porAg[k]=porAg[k]||{j:0,$:0}; o.j+=l.jorn; o.$+=l.precio})
Object.entries(porAg).sort((a,b)=>b[1].j-a[1].j).slice(0,10).forEach(([k,o])=>
  console.log(`  ${String(o.j).padStart(4)} jorn  ${money(o.$).padStart(12)}  ${money(o.$/o.j).padStart(10)}/j  ${k}`))
const austral=edi.filter(l=>/austral/i.test(l.ag+' '+l.cli+' '+l.proy))
console.log(`\n  Austral (por nombre de agencia/cliente/proyecto): ${J(austral)} jornadas · ${money($(austral))} · ${money($(austral)/Math.max(J(austral),1))}/jornada`)
console.log(`\n  QUIÉN EDITA HOY:`)
const pe={}; edi.forEach(l=>{const o=pe[l.pers]=pe[l.pers]||{j:0,$:0}; o.j+=l.jorn; o.$+=l.precio})
Object.entries(pe).sort((a,b)=>b[1].j-a[1].j).forEach(([p,o])=>
  console.log(`   ${String(o.j).padStart(4)} jorn  ${money(o.$).padStart(12)}  ${money(o.$/o.j).padStart(10)}/j  ${p}`))
