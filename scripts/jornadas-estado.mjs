/**
 * ESTADO del análisis de jornadas: qué está cargado, qué falta, y qué pinta raro.
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
function rol(p0){const p=txt(p0).toLowerCase()
  if(/comision|rental|alquiler|viatico|servicio|crudos|catering/.test(p))return 'NO'
  if(/edit|edici|color|motion|anim|dise/.test(p))return 'EDICION'
  if(/asist/.test(p))return 'ASIST'
  if(/produ/.test(p))return 'PRODU'
  if(/vivo|stream/.test(p))return 'VIVO'
  if(/sonid|audio/.test(p))return 'SONIDO'
  if(/locu/.test(p))return 'LOCU'
  if(/drone|dron|fpv/.test(p))return 'DRONE'
  if(/makeup|maquilla|model|peluq/.test(p))return 'OTROS'
  if(/film|c[aá]mara|camara|video|foto|dirfoto/.test(p))return 'CAMARA'
  return 'SIN'}
function pf(s){const m=txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?{mes:+m[2],anio:+m[3]}:null}

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS','PRESUPUESTOS','HISTORICO_2025'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,PRE,H25]=R.data.valueRanges.map(v=>v.values||[])
const iCant=PRE[0].indexOf('Cant. Fechas')
const cantF={}; PRE.slice(1).forEach(r=>{const n=txt(r[0]); const c=num(r[iCant]); if(n&&c)cantF[n]=c})

console.log(`\n${'█'.repeat(78)}\n  ESTADO DE LA CARGA DE JORNADAS\n${'█'.repeat(78)}`)
let p2026=0, conDias=0, revisados=0, sinDiasPeroCant=0
const pendientes=[], lineas=[]
PRO.slice(1).forEach(row=>{
  const f=pf(row[3]); if(!f||f.anio!==2026)return
  p2026++
  const dias=num(row[84]), origen=txt(row[86]), n=txt(row[2])
  if(dias)conDias++
  if(origen==='revisado')revisados++
  const exc={}; txt(row[85]).split('|').forEach(p=>{const m=p.match(/^\s*(.+?):(\d+)\s*$/); if(m)exc[m[1].trim()]=+m[2]})
  let costo=0, tieneStaff=false
  PED.forEach(pc=>{const ped=txt(row[pc]); if(!ped)return
    const precio=num(row[pc+1]), pers=txt(row[pc+2])
    if(precio<=1||!pers||/somos magma/i.test(pers))return
    const r=rol(ped); if(r==='NO')return
    tieneStaff=true; costo+=precio
    lineas.push({mes:f.mes,rol:r,precio,pers,jorn:exc[pers]??(dias||1),ped,proy:txt(row[6]),npresu:n})})
  // pendiente: el presu dice 2+ fechas pero Días quedó vacío
  if(!dias && cantF[n]>1 && tieneStaff){ sinDiasPeroCant++; pendientes.push({n,fecha:txt(row[3]),proy:txt(row[6]),cant:cantF[n],costo}) }
})
console.log(`  Proyectos 2026:                    ${p2026}`)
console.log(`  Con "Días" cargado:                ${conDias}   (${revisados} revisados con vos)`)
console.log(`  Sin "Días" → se asumen 1 jornada:   ${p2026-conDias}`)
console.log(`\n  ⚠ PENDIENTES REALES — el presupuesto dice 2+ fechas pero Días está vacío: ${sinDiasPeroCant}`)
pendientes.sort((a,b)=>b.costo-a.costo).slice(0,15).forEach(p=>
  console.log(`     [${p.n.padEnd(6)}] ${p.fecha.padEnd(11)} ${p.proy.slice(0,38).padEnd(40)} presu dice ${p.cant}  · staff ${money(p.costo)}`))

// 2025
let n25=0
H25.slice(1).forEach(r=>{ if(txt(r[6])&&[15,17,19,21,23,25].some(c=>txt(r[c]))) n25++ })
console.log(`\n  2025 (HISTORICO_2025): ${n25} proyectos con staff · Días cargados: 0  ← SIN EMPEZAR`)

// ---- anomalías ----
console.log(`\n${'█'.repeat(78)}\n  COSAS RARAS\n${'█'.repeat(78)}`)
const J=a=>a.reduce((s,x)=>s+x.jorn,0), $=a=>a.reduce((s,x)=>s+x.precio,0)
const w=lineas.filter(l=>l.mes<=7)

console.log(`\n▓ 1. MAYO se dispara`)
console.log(`   mes    jornadas   costo`)
for(let m=1;m<=7;m++){const d=w.filter(l=>l.mes===m)
  console.log(`   ${MES[m].padEnd(5)}  ${String(J(d)).padStart(7)}   ${money($(d)).padStart(13)}`)}
const may=w.filter(l=>l.mes===5)
console.log(`   Mayo = ${(J(may)/(J(w)/7)).toFixed(1)}x el promedio. Proyectos que lo explican:`)
const mp={}; may.forEach(l=>{const o=mp[l.npresu]=mp[l.npresu]||{proy:l.proy,j:0,$:0}; o.j+=l.jorn; o.$+=l.precio})
Object.entries(mp).sort((a,b)=>b[1].j-a[1].j).slice(0,6).forEach(([n,o])=>
  console.log(`      [${n.padEnd(6)}] ${String(o.j).padStart(3)} jorn  ${money(o.$).padStart(12)}  ${o.proy.slice(0,36)}`))

console.log(`\n▓ 2. Tarifas por jornada fuera de rango (cámara y edición)`)
;['CAMARA','EDICION'].forEach(r=>{
  const d=w.filter(l=>l.rol===r)
  const t=d.map(l=>l.precio/l.jorn).sort((a,b)=>a-b)
  const med=t[Math.floor(t.length/2)]
  console.log(`\n   ${r}: mediana ${money(med)}/jornada`)
  d.filter(l=>l.precio/l.jorn > med*2.5).sort((a,b)=>b.precio/b.jorn-a.precio/a.jorn).slice(0,6).forEach(l=>
    console.log(`      ${money(l.precio/l.jorn).padStart(12)}/j  ${String(l.jorn).padStart(2)}j  ${l.pers.slice(0,24).padEnd(26)} ${l.ped.padEnd(12)} ${l.proy.slice(0,26)} [${l.npresu}]`))
})

console.log(`\n▓ 3. Pedidos que no pude clasificar`)
const sin=w.filter(l=>l.rol==='SIN')
if(!sin.length) console.log(`   ninguno ✓`)
else{const g={}; sin.forEach(l=>{g[l.ped]=(g[l.ped]||0)+1})
  Object.entries(g).sort((a,b)=>b[1]-a[1]).forEach(([p,c])=>console.log(`   ${String(c).padStart(3)}x  "${p}"`))}

console.log(`\n▓ 4. N° de presupuesto duplicados en PROYECTOS 2026`)
const cnt={}; PRO.slice(1).forEach(row=>{const f=pf(row[3]); if(f&&f.anio===2026){const n=txt(row[2]); if(n)cnt[n]=(cnt[n]||0)+1}})
const dups=Object.entries(cnt).filter(([,c])=>c>1)
if(!dups.length) console.log(`   ninguno ✓`)
else dups.forEach(([n,c])=>console.log(`   [${n}] aparece ${c} veces  ← "Días" se carga en la fila equivocada`))
