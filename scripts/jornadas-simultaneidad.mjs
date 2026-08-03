/**
 * SIMULTANEIDAD de jornadas de campo — 2025 y 2026 juntos.
 * Responde: ¿cuántos días al mes hay rodaje? ¿cuántos eventos caen el mismo día?
 * Es lo que decide si un filmmaker fijo se llena o queda ocioso.
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
const esMonto=v=>/^\$?\s*[\d.,]+\s*$/.test(txt(v))&&txt(v)!==''
const CAMPO=/filmmaker|fot[oó]graf|drone|fpv|c[aá]mara/i, EDIC=/editor|motion|colorista|dise/i
const ALIAS={'juan':'Juan Martin Arauz','santino':'Santino D’ Angelo','sofi':'Sofia Maria Grenier Basavilbaso','felipe':'Felipe Martinez','gaspar':'Gaspar Peñalba','lulu':'Lucía María Grenier Basavilbaso','ivan':'Ivan Aranda','tom':'Tomás Halbach','lucas':'Lucas Ignacio Godoy','lucho':'Jorge Luis Chavez','pablo':'Pablo Leonel Molanes Araujo','blas':'Blas Lafontaine','julian':'Julián Exequiel Pérez','pedro':'Pedro Maddonni','dani':'Daniela Viviana Ayala','tutu':'Martin Nahuel Litman (Tutu)','locutora':'Paula Ximena Pereira','sonidista':'Martin Remedi','stefi foto':'Stefania Geraldince Bosco'}
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
function rol26(p0){const p=txt(p0).toLowerCase()
  if(/comision|rental|alquiler|viatico|servicio|crudos|catering/.test(p))return 'NO'
  if(/edit|edici|color|motion|anim|dise/.test(p))return 'EDICION'
  if(/asist/.test(p))return 'ASIST'
  if(/produ/.test(p))return 'PRODU'
  if(/vivo|stream/.test(p))return 'VIVO'
  if(/sonid|audio/.test(p))return 'SONIDO'
  if(/locu/.test(p))return 'LOCU'
  if(/drone|dron|fpv/.test(p))return 'DRONE'
  if(/makeup|maquilla|model|peluq/.test(p))return 'OTROS'
  if(/film|c[aá]mara|camara|video|foto|dirfoto/.test(p))return 'CAMPO'
  return 'SIN'}

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['HISTORICO_2025','PROYECTOS','RRHH'],valueRenderOption:'FORMATTED_VALUE'})
const [H25,PRO,RH]=R.data.valueRanges.map(v=>v.values||[])
const rubro={}; RH.slice(1).forEach(r=>{const n=txt(r[0]); if(n&&!rubro[n])rubro[n]=txt(r[1])})
const canon=n=>ALIAS[txt(n).toLowerCase()]||txt(n)

// ---- 2025 ----
const dias25={}, costo25={}
H25.slice(1).forEach(r=>{
  const f=txt(r[2]); if(!f)return
  ;[15,17,19,23,25].forEach(c=>{
    const n=txt(r[c]); if(!n||esMonto(n))return
    if(/somos magma|viatico|comisi/i.test(n))return
    const rb=rubro[canon(n)]||''
    if(!CAMPO.test(rb))return
    dias25[f]=(dias25[f]||0)+1; costo25[f]=(costo25[f]||0)+num(r[c+1])
  })
})
// ---- 2026 ----
const dias26={}, costo26={}
PRO.slice(1).forEach(r=>{
  const f=txt(r[3]); if(!/^\d{1,2}\/\d{1,2}\/2026$/.test(f))return
  PED.forEach(c=>{
    const ped=txt(r[c]); if(!ped)return
    const precio=num(r[c+1]), pers=txt(r[c+2])
    if(precio<=1||!pers||/somos magma/i.test(pers))return
    if(rol26(ped)!=='CAMPO')return
    dias26[f]=(dias26[f]||0)+1; costo26[f]=(costo26[f]||0)+precio
  })
})

function informe(nombre,dias,costo,meses,diasCalendario){
  const ds=Object.entries(dias), tot=ds.length
  const jorn=ds.reduce((s,[,n])=>s+n,0)
  const $tot=Object.values(costo).reduce((s,v)=>s+v,0)
  console.log(`\n${'━'.repeat(74)}\n  ${nombre}\n${'━'.repeat(74)}`)
  console.log(`  días con rodaje: ${tot} de ${diasCalendario} (${Math.round(tot/diasCalendario*100)}% del período)`)
  console.log(`  = ${(tot/meses).toFixed(1)} días con trabajo por mes  ·  ${jorn} jornadas de campo  ·  ${money($tot)}`)
  const dist={}; ds.forEach(([,n])=>{const k=Math.min(n,5); dist[k]=(dist[k]||0)+1})
  console.log(`\n  ${'personas ese día'.padEnd(18)}${'días'.padStart(6)}${'%'.padStart(7)}`)
  for(let k=1;k<=5;k++){const d=dist[k]||0; if(!d)continue
    console.log(`  ${(k===5?'5 o más':String(k)).padEnd(18)}${String(d).padStart(6)}${(Math.round(d/tot*100)+'%').padStart(7)}`)}
  const tarifa=$tot/jorn
  console.log(`\n  tarifa media de campo: ${money(tarifa)}/jornada`)
  console.log(`  → un fijo cubre 1 evento/día = ${tot} jornadas de ${jorn} (${Math.round(tot/jorn*100)}%)`)
  console.log(`  → esas ${tot} jornadas hoy cuestan ${money(tot*tarifa)} al año en freelance`)
  console.log(`  → TECHO para pagar un fijo (todo incluido): ${money(tot*tarifa/meses)}/mes`)
  const ociosos=Math.max(0,22-tot/meses)
  console.log(`  → ocupación: ${(tot/meses).toFixed(1)} de ~22 días hábiles → ${ociosos.toFixed(1)} días/mes sin rodaje`)
  return {tot,jorn,tarifa,techo:tot*tarifa/meses,diasMes:tot/meses}
}
console.log(`\n${'█'.repeat(74)}\n  ¿SE LLENA UN FILMMAKER FIJO? — simultaneidad de jornadas de campo\n${'█'.repeat(74)}`)
const a=informe('2025 (año completo)',dias25,costo25,12,365)
const b=informe('2026 (ene–jul)',dias26,costo26,7,212)
console.log(`\n${'━'.repeat(74)}\n  CONCLUSIÓN\n${'━'.repeat(74)}`)
console.log(`  días con rodaje/mes:  2025 ${a.diasMes.toFixed(1)}   ·   2026 ${b.diasMes.toFixed(1)}`)
console.log(`  techo de sueldo:      2025 ${money(a.techo)}/mes   ·   2026 ${money(b.techo)}/mes`)
console.log(`\n  Un filmmaker fijo NO se llena solo con rodaje: sobran ~${Math.max(0,22-b.diasMes).toFixed(0)} días hábiles al mes.`)
console.log(`  El puesto cierra si esos días edita → buscar FILMMAKER + EDITOR, no filmmaker puro.`)
