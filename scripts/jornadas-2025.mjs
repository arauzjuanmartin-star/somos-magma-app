/**
 * JORNADAS 2025 — reconstruye el análisis de jornadas sobre HISTORICO_2025
 * para poder compararlo con 2026 (scripts/jornadas-desglose.mjs).
 *
 * PROBLEMA: HISTORICO_2025 tiene otra estructura que PROYECTOS:
 *   - Staff 1..6 (cols 15,17,19,21,23,25) + Pago 1..6 — SIN el "Pedido" (no se sabe el rol por trabajo)
 *   - nombres abreviados ("Juan", "Sofi") en vez de nombre completo
 *   - la col 21 ("Staff 4") NO tiene nombres: son montos sueltos (169 filas, $18,6M) con Pago 4 = 0
 *   - la columna "Días" existe pero está vacía en las 458 filas
 *
 * SOLUCIÓN:
 *   - rol se infiere del Rubro de RRHH (por persona, no por trabajo)
 *   - los multi-jornada se DETECTAN por múltiplo de la tarifa habitual de cada persona
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
const numAR=v=>{const s=txt(v).replace(/[^\d.,]/g,'').replace(/\./g,'').replace(',','.');const n=parseFloat(s);return isNaN(n)?0:n}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const MES=['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const mediana=a=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2}

// apodo 2025 -> nombre completo RRHH
const ALIAS={
  'juan':'Juan Martin Arauz','santino':'Santino D’ Angelo','sofi':'Sofia Maria Grenier Basavilbaso',
  'felipe':'Felipe Martinez','gaspar':'Gaspar Peñalba','lulu':'Lucía María Grenier Basavilbaso',
  'ivan':'Ivan Aranda','tom':'Tomás Halbach','lucas':'Lucas Ignacio Godoy','lucho':'Jorge Luis Chavez',
  'pablo':'Pablo Leonel Molanes Araujo','blas':'Blas Lafontaine','julian':'Julián Exequiel Pérez',
  'pedro':'Pedro Maddonni','dani':'Daniela Viviana Ayala','tutu':'Martin Nahuel Litman (Tutu)',
  'locutora':'Paula Ximena Pereira','sonidista':'Martin Remedi','stefi foto':'Stefania Geraldince Bosco',
}
// rubro RRHH -> ¿lo cubre un filmmaker fijo? (trabajo de campo, presencia física)
const CAMPO=/filmmaker|fot[oó]graf|drone|fpv|c[aá]mara/i
const EDIC=/editor|motion|colorista|dise/i

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['HISTORICO_2025','RRHH'],valueRenderOption:'FORMATTED_VALUE'})
const [H,RH]=R.data.valueRanges.map(v=>v.values||[])

const rubro={}
RH.slice(1).forEach(r=>{const n=txt(r[0]); if(n&&!rubro[n]) rubro[n]=txt(r[1])})
const canon=n=>{const k=txt(n).toLowerCase(); return ALIAS[k]||txt(n)}
function clase(nombre){
  const rb=rubro[canon(nombre)]||''
  if(!rb) return 'SIN-RUBRO'
  if(CAMPO.test(rb)) return 'CAMPO'
  if(EDIC.test(rb))  return 'EDICION'
  return 'OTRO'
}

const S=[15,17,19,23,25]           // columnas de staff REALES (21 excluida a propósito)
const COL_SUELTA=21
const esMonto=v=>/^\$?\s*[\d.,]+\s*$/.test(txt(v))&&txt(v)!==''

// ---------- 1. leer líneas ----------
const lineas=[], sueltos=[]
H.slice(1).forEach((r,i)=>{
  const mes=num(r[1]), fecha=txt(r[2]), proy=txt(r[6]), nro=txt(r[3])
  if(!mes) return
  S.forEach(c=>{
    const n=txt(r[c]); const pago=num(r[c+1])
    if(!n||esMonto(n)) return
    if(/somos magma|viatico|comisi/i.test(n)) return
    lineas.push({mes,fila:i+2,nro,proy,pers:canon(n),crudo:n,pago,clase:clase(n)})
  })
  if(esMonto(r[COL_SUELTA])){ const m=numAR(r[COL_SUELTA]); if(m>0) sueltos.push({mes,fila:i+2,nro,proy,monto:m}) }
})

console.log(`\n${'█'.repeat(78)}\n  JORNADAS 2025 — reconstruido desde HISTORICO_2025\n${'█'.repeat(78)}`)
console.log(`  líneas de staff con nombre: ${lineas.length}`)
console.log(`  costos sin nombre (col "Staff 4"): ${sueltos.length} por ${money(sueltos.reduce((s,x)=>s+x.monto,0))}`)

// ---------- 2. tarifa habitual por persona -> detectar multi-jornada ----------
const porPers={}
lineas.forEach(l=>{(porPers[l.pers]=porPers[l.pers]||[]).push(l)})
const tarifa={}
Object.entries(porPers).forEach(([p,ls])=>{
  const pagos=ls.map(l=>l.pago).filter(v=>v>0)
  tarifa[p]=mediana(pagos)
})
// jornadas = round(pago / tarifa habitual), acotado 1..6
// solo si la tarifa habitual es creíble (>= $20.000): con pagos corruptos el múltiplo se dispara
const TARIFA_MIN=20000
lineas.forEach(l=>{
  const t=tarifa[l.pers]
  l.jorn=1
  if(t>=TARIFA_MIN&&l.pago>0){ const r=l.pago/t; l.jorn=Math.max(1,Math.min(6,Math.round(r))); l.ratio=r }
})
const sinTarifaFiable=[...new Set(lineas.filter(l=>tarifa[l.pers]<TARIFA_MIN).map(l=>l.pers))]
const multi=lineas.filter(l=>l.jorn>1)

console.log(`\n${'━'.repeat(78)}\n  MULTI-JORNADA DETECTADAS (pago = múltiplo de la tarifa habitual)\n${'━'.repeat(78)}`)
console.log(`  líneas que serían más de 1 jornada: ${multi.length}  →  ${multi.reduce((s,l)=>s+l.jorn,0)-multi.length} jornadas extra`)
if(sinTarifaFiable.length) console.log(`  ⚠ sin tarifa fiable (se cuentan 1 jornada c/u): ${sinTarifaFiable.join(', ')}`)
console.log(`\n  ${'fila'.padStart(5)} ${'pago'.padStart(11)} ${'habitual'.padStart(10)} ${'jorn'.padStart(4)}  persona · proyecto`)
multi.sort((a,b)=>b.jorn-a.jorn).slice(0,20).forEach(l=>
  console.log(`  ${String(l.fila).padStart(5)} ${money(l.pago).padStart(11)} ${money(tarifa[l.pers]).padStart(10)} ${String(l.jorn).padStart(4)}  ${l.crudo} · ${l.proy.slice(0,32)}`))
if(multi.length>20) console.log(`  … y ${multi.length-20} más`)

// ---------- 3. por mes ----------
const J=a=>a.reduce((s,x)=>s+x.jorn,0), $=a=>a.reduce((s,x)=>s+x.pago,0)
console.log(`\n${'━'.repeat(78)}\n  POR MES — 2025\n${'━'.repeat(78)}`)
console.log(`  mes    jornadas   de campo   edición    costo staff`)
let TJ=0,TC=0
for(let m=1;m<=12;m++){
  const d=lineas.filter(l=>l.mes===m); if(!d.length)continue
  const camp=d.filter(l=>l.clase==='CAMPO'), edi=d.filter(l=>l.clase==='EDICION')
  TJ+=J(d); TC+=J(camp)
  console.log(`  ${MES[m].padEnd(5)}  ${String(J(d)).padStart(8)}   ${String(J(camp)).padStart(8)}  ${String(J(edi)).padStart(8)}   ${money($(d)).padStart(13)}`)
}
console.log(`  ${'─'.repeat(62)}`)
console.log(`  TOTAL  ${String(TJ).padStart(8)}   ${String(TC).padStart(8)}`)
console.log(`  PROM   ${(TJ/12).toFixed(1).padStart(8)}   ${(TC/12).toFixed(1).padStart(8)}   ← por mes`)

// ---------- 4. por persona ----------
console.log(`\n${'━'.repeat(78)}\n  POR PERSONA — 2025 (rubro según RRHH)\n${'━'.repeat(78)}`)
console.log(`  ${'jorn'.padStart(5)} ${'/mes'.padStart(6)} ${'costo'.padStart(13)} ${'$/jorn'.padStart(11)}  ${'clase'.padEnd(10)} persona`)
const agg={}
lineas.forEach(l=>{const a=agg[l.pers]=agg[l.pers]||{j:0,$:0,clase:l.clase}; a.j+=l.jorn; a.$+=l.pago})
Object.entries(agg).sort((a,b)=>b[1].j-a[1].j).slice(0,22).forEach(([p,d])=>
  console.log(`  ${String(d.j).padStart(5)} ${(d.j/12).toFixed(1).padStart(6)} ${money(d.$).padStart(13)} ${money(d.j?d.$/d.j:0).padStart(11)}  ${d.clase.padEnd(10)} ${p}`))

// ---------- 5. campo vs edición ----------
console.log(`\n${'━'.repeat(78)}\n  CAMPO vs EDICIÓN — 2025\n${'━'.repeat(78)}`)
const cls={}
lineas.forEach(l=>{const c=cls[l.clase]=cls[l.clase]||{j:0,$:0}; c.j+=l.jorn; c.$+=l.pago})
Object.entries(cls).sort((a,b)=>b[1].j-a[1].j).forEach(([c,d])=>
  console.log(`  ${c.padEnd(12)} ${String(d.j).padStart(5)} jorn (${(d.j/12).toFixed(1)}/mes)  ${money(d.$).padStart(14)}  ${money(d.j?d.$/d.j:0)}/jornada`))
const camp=lineas.filter(l=>l.clase==='CAMPO')
console.log(`\n  → tarifa mediana de campo 2025: ${money(mediana(camp.filter(l=>l.pago>0).map(l=>l.pago/l.jorn)))}/jornada`)

// ---------- 6. el agujero ----------
console.log(`\n${'━'.repeat(78)}\n  LO QUE NO SE PUEDE ATRIBUIR\n${'━'.repeat(78)}`)
console.log(`  ${sueltos.length} costos sin nombre en la col "Staff 4" por ${money(sueltos.reduce((s,x)=>s+x.monto,0))}`)
const vals={}; sueltos.forEach(s=>vals[s.monto]=(vals[s.monto]||0)+1)
console.log(`  montos más repetidos: ${Object.entries(vals).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([v,n])=>`${n}x ${money(+v)}`).join(' · ')}`)
console.log(`  → si fueran jornadas de edición, son ~${sueltos.length} jornadas más (${(sueltos.length/12).toFixed(1)}/mes) que hoy no figuran.`)

// ---------- 7. SIMULTANEIDAD — lo que decide si un fijo alcanza ----------
// "no podés mandar un filmmaker a dos lugares": lo que importa no es el total de
// jornadas sino cuántas caen el MISMO día. Un fijo cubre 1 evento por día.
console.log(`\n${'━'.repeat(78)}\n  SIMULTANEIDAD — cuántos eventos de campo por día (2025)\n${'━'.repeat(78)}`)
const porFecha={}
H.slice(1).forEach(r=>{
  const f=txt(r[2]); if(!f) return
  let camp=0
  S.forEach(c=>{ const n=txt(r[c]); if(!n||esMonto(n))return; if(/somos magma|viatico|comisi/i.test(n))return
    if(clase(n)==='CAMPO') camp++ })
  if(camp>0) porFecha[f]=(porFecha[f]||0)+camp
})
const dias=Object.entries(porFecha)
const dist={}
dias.forEach(([,n])=>{const k=Math.min(n,6); dist[k]=(dist[k]||0)+1})
const totalDias=dias.length
console.log(`  días del año con al menos 1 jornada de campo: ${totalDias} de 365 (${Math.round(totalDias/365*100)}%)`)
console.log(`\n  ${'personas ese día'.padEnd(18)}${'días'.padStart(6)}${'%'.padStart(7)}   ¿lo cubre 1 fijo?`)
for(let k=1;k<=6;k++){ const d=dist[k]||0; if(!d)continue
  console.log(`  ${(k===6?'6 o más':String(k)).padEnd(18)}${String(d).padStart(6)}${(Math.round(d/totalDias*100)+'%').padStart(7)}   ${k===1?'SÍ':'no, faltan '+(k-1)}`) }
const cubre1=dist[1]||0
const jornadasTotales=dias.reduce((s,[,n])=>s+n,0)
console.log(`\n  → un solo filmmaker fijo cubre ${cubre1} de ${totalDias} días (${Math.round(cubre1/totalDias*100)}%) sin ayuda`)
console.log(`  → pero en jornadas: cubriría ${totalDias} de ${jornadasTotales} (${Math.round(totalDias/jornadasTotales*100)}%) — 1 por día que haya trabajo`)
const sobran=jornadasTotales-totalDias
console.log(`  → quedan ${sobran} jornadas (${(sobran/12).toFixed(1)}/mes) que SÍ o SÍ son de otro`)
// ¿cuántos días por mes tiene trabajo?
console.log(`\n  días con trabajo por mes:`)
const dm={}
dias.forEach(([f,n])=>{const m=f.match(/^(\d{1,2})\/(\d{1,2})\//); if(m)dm[+m[2]]=(dm[+m[2]]||0)+1})
let l=''
for(let m=1;m<=12;m++){ l+=`${MES[m]} ${String(dm[m]||0).padStart(2)}   ` }
console.log(`     ${l}`)
console.log(`     promedio: ${(totalDias/12).toFixed(1)} días con trabajo por mes`)
