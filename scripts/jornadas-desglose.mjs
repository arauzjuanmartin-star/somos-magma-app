/**
 * Desglose fino de jornadas 2026: por MES, por ROL y por PERSONA.
 * Separa lo que un FILMMAKER fijo puede cubrir de lo que no (asistente, edición, sonido...).
 * Usa los días reales cargados en CG/CH. Solo lectura.
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

// clasificación de roles — el orden importa
function rol(ped){
  const p=txt(ped).toLowerCase()
  if(/comision|rental|alquiler|viatico|servicio|crudos|catering/.test(p)) return 'NO-JORNADA'
  if(/edit|edici|color|motion|anim|dise/.test(p))       return 'EDICION'
  if(/dirfoto|dir de fot|director de fot/.test(p))      return 'DIRFOTO'
  if(/asist/.test(p))                                   return 'ASISTENTE'
  if(/produ/.test(p))                                   return 'PRODUCCION'
  if(/sonid|audio/.test(p))                             return 'SONIDO'
  if(/vivo|stream/.test(p))                             return 'VIVO'
  if(/locu/.test(p))                                    return 'LOCUCION'
  if(/drone|dron|fpv/.test(p))                          return 'DRONE'
  if(/makeup|maquilla|model|peluq/.test(p))             return 'OTROS'
  if(/film|c[aá]mara|camara|video|foto/.test(p))        return 'CAMARA'
  return 'SIN-CLASIF'
}
const CUBRE_FILMMAKER=new Set(['CAMARA','DIRFOTO'])

const R=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS',valueRenderOption:'FORMATTED_VALUE'})
const PRO=R.data.values
function pf(s){const m=txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?{mes:+m[2],anio:+m[3]}:null}

const lineas=[]
PRO.slice(1).forEach(row=>{
  const f=pf(row[3]); if(!f||f.anio!==2026)return
  const dias=num(row[84])||1
  const exc={}; txt(row[85]).split('|').forEach(par=>{const m=par.match(/^\s*(.+?):(\d+)\s*$/); if(m)exc[m[1].trim()]=+m[2]})
  PED.forEach(pc=>{
    const ped=txt(row[pc]); if(!ped)return
    const precio=num(row[pc+1]), pers=txt(row[pc+2])
    if(precio<=1||!pers||/somos magma/i.test(pers))return
    const r=rol(ped); if(r==='NO-JORNADA')return
    lineas.push({mes:f.mes,pers,ped,precio,rol:r,jorn:exc[pers]??dias,proy:txt(row[6]),npresu:txt(row[2])})
  })
})
const MESES=[1,2,3,4,5,6,7], n=MESES.length
const win=lineas.filter(l=>MESES.includes(l.mes))
const J=a=>a.reduce((s,x)=>s+x.jorn,0), $=a=>a.reduce((s,x)=>s+x.precio,0)

console.log(`\n${'█'.repeat(78)}\n  JORNADAS POR MES (todas las disciplinas) — 2026\n${'█'.repeat(78)}`)
console.log(`  mes    jornadas   de las cuales CÁMARA    costo total`)
MESES.forEach(m=>{const d=win.filter(l=>l.mes===m)
  const cam=d.filter(l=>CUBRE_FILMMAKER.has(l.rol))
  console.log(`  ${MES[m].padEnd(5)}  ${String(J(d)).padStart(6)}       ${String(J(cam)).padStart(6)}            ${money($(d)).padStart(13)}`)})
console.log(`  ${'─'.repeat(60)}`)
console.log(`  TOTAL  ${String(J(win)).padStart(6)}       ${String(J(win.filter(l=>CUBRE_FILMMAKER.has(l.rol)))).padStart(6)}`)
console.log(`  PROM   ${(J(win)/n).toFixed(1).padStart(6)}       ${(J(win.filter(l=>CUBRE_FILMMAKER.has(l.rol)))/n).toFixed(1).padStart(6)}   ← el "41/mes" era TODO junto`)

console.log(`\n${'━'.repeat(78)}\n  POR ROL — qué puede cubrir un FILMMAKER fijo y qué no\n${'━'.repeat(78)}`)
const roles={}; win.forEach(l=>{const r=roles[l.rol]=roles[l.rol]||{j:0,$:0}; r.j+=l.jorn; r.$+=l.precio})
console.log(`  ${'rol'.padEnd(12)}${'jornadas'.padStart(9)}${'/mes'.padStart(7)}${'costo'.padStart(15)}${'/mes'.padStart(13)}   ¿lo cubre el fijo?`)
Object.entries(roles).sort((a,b)=>b[1].j-a[1].j).forEach(([r,d])=>
  console.log(`  ${r.padEnd(12)}${String(d.j).padStart(9)}${(d.j/n).toFixed(1).padStart(7)}${money(d.$).padStart(15)}${money(d.$/n).padStart(13)}   ${CUBRE_FILMMAKER.has(r)?'SÍ':'no'}`))
const camJ=J(win.filter(l=>CUBRE_FILMMAKER.has(l.rol))), cam$=$(win.filter(l=>CUBRE_FILMMAKER.has(l.rol)))
console.log(`\n  → CÁMARA + DIRFOTO: ${camJ} jornadas (${(camJ/n).toFixed(1)}/mes) por ${money(cam$)} (${money(cam$/n)}/mes)`)
console.log(`  → tarifa media real de cámara: ${money(cam$/camJ)}/jornada`)

console.log(`\n${'━'.repeat(78)}\n  POR PERSONA — solo CÁMARA/DIRFOTO\n${'━'.repeat(78)}`)
const pc={}; win.filter(l=>CUBRE_FILMMAKER.has(l.rol)).forEach(l=>{const p=pc[l.pers]=pc[l.pers]||{j:0,$:0,meses:new Set()}
  p.j+=l.jorn; p.$+=l.precio; p.meses.add(l.mes)})
console.log(`  ${'jorn'.padStart(5)} ${'/mes'.padStart(6)} ${'costo'.padStart(13)} ${'$/jornada'.padStart(12)}  persona`)
Object.entries(pc).sort((a,b)=>b[1].j-a[1].j).forEach(([p,d])=>
  console.log(`  ${String(d.j).padStart(5)} ${(d.j/n).toFixed(1).padStart(6)} ${money(d.$).padStart(13)} ${money(d.$/d.j).padStart(12)}  ${p}`))

console.log(`\n${'━'.repeat(78)}\n  TODAS las disciplinas por persona (para ver quién hace qué)\n${'━'.repeat(78)}`)
const pr={}; win.forEach(l=>{const k=pr[l.pers]=pr[l.pers]||{}; k[l.rol]=(k[l.rol]||0)+l.jorn})
Object.entries(pr).sort((a,b)=>Object.values(b[1]).reduce((s,v)=>s+v,0)-Object.values(a[1]).reduce((s,v)=>s+v,0))
 .slice(0,18).forEach(([p,k])=>{
  const tot=Object.values(k).reduce((s,v)=>s+v,0)
  console.log(`  ${String(tot).padStart(3)}j  ${p.slice(0,28).padEnd(30)} ${Object.entries(k).sort((a,b)=>b[1]-a[1]).map(([r,v])=>`${r} ${v}`).join(' · ')}`)})

console.log(`\n${'━'.repeat(78)}\n  LUCHO (Jorge Luis Chavez) — detalle\n${'━'.repeat(78)}`)
const lucho=win.filter(l=>/jorge luis chavez/i.test(l.pers))
const lc=lucho.filter(l=>CUBRE_FILMMAKER.has(l.rol))
console.log(`  Jornadas TOTALES:  ${J(lucho)}  por ${money($(lucho))}`)
console.log(`  De cámara:         ${J(lc)}  por ${money($(lc))}   → ${(J(lc)/n).toFixed(1)} jornadas/mes  ·  ${money($(lc)/J(lc))}/jornada`)
console.log(`\n  mes    jornadas cámara   costo`)
MESES.forEach(m=>{const d=lc.filter(l=>l.mes===m)
  console.log(`  ${MES[m].padEnd(5)}  ${String(J(d)).padStart(8)}         ${money($(d)).padStart(12)}`)})
const otros=lucho.filter(l=>!CUBRE_FILMMAKER.has(l.rol))
if(otros.length) console.log(`\n  Lucho en otros roles: ${otros.map(l=>l.rol+' '+l.jorn+'j').join(' · ')}`)
