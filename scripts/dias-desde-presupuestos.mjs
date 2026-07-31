/**
 * PREVIEW (no escribe): cruza PRESUPUESTOS."Cant. Fechas" -> PROYECTOS."Días".
 * Muestra cuántos proyectos se resuelven solos, cuáles chocan con mi estimación,
 * y cuáles quedan para revisar a mano con Juan.
 * Correr con --escribir para aplicar.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const ESCRIBIR = process.argv.includes('--escribir')
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const ED=/edit|edici|post|color|dise|anim/i
const NOJORNADA=/comision|model|makeup|maquilla|viatico/i

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PRESUPUESTOS','PROYECTOS','RRHH'],valueRenderOption:'FORMATTED_VALUE'})
const [PRE,PRO,RR]=R.data.valueRanges.map(v=>v.values||[])
const hPre=PRE[0], iN=0, iCant=hPre.indexOf('Cant. Fechas'), iProyP=hPre.indexOf('Proyecto')

// PRESUPUESTOS: N° -> cant fechas (si hay duplicados con valores distintos, marcar)
const cant={}, dupConflicto=new Set()
PRE.slice(1).forEach(r=>{const n=txt(r[iN]); if(!n)return
  const c=num(r[iCant]); if(!c)return
  if(cant[n]!==undefined && cant[n]!==c) dupConflicto.add(n)
  cant[n]=c})

// tarifas para la estimación de contraste
const tRR={}; RR.slice(1).forEach(r=>{const n=txt(r[0]).toLowerCase(); if(n)tRR[n]={media:num(r[11]),jornada:num(r[12])}})
const proyectos=[]
PRO.slice(1).forEach((row,i)=>{
  const fecha=txt(row[3]); if(!/\/2026$/.test(fecha))return
  const staff=[]
  PED.forEach(pc=>{const ped=txt(row[pc]); if(!ped||ED.test(ped)||NOJORNADA.test(ped))return
    const precio=num(row[pc+1]), pers=txt(row[pc+2])
    if(precio<=1||!pers||/somos magma/i.test(pers))return
    staff.push({ped,precio,pers})})
  proyectos.push({fila:i+2,npresu:txt(row[2]),fecha,agencia:txt(row[4]),proy:txt(row[6]),
    staff,costo:staff.reduce((s,x)=>s+x.precio,0),diasActual:num(row[84])})
})
const ac={}; proyectos.forEach(p=>p.staff.forEach(s=>(ac[s.pers.toLowerCase()]=ac[s.pers.toLowerCase()]||[]).push(s.precio)))
const md={}; Object.entries(ac).forEach(([k,a])=>{const c={};a.forEach(x=>c[x]=(c[x]||0)+1)
  md[k]=+Object.entries(c).sort((x,y)=>y[1]-x[1]||(+x[0])-(+y[0]))[0][0]})
function est(p){ if(!p.staff.length)return 1
  return Math.max(1,...p.staff.map(s=>{const t=tRR[s.pers.toLowerCase()],media=/1\/2|½/.test(s.ped)
    const r=(t&&t.jornada)?(media?(t.media||t.jornada/2):t.jornada):(md[s.pers.toLowerCase()]||0)
    return r?Math.min(6,Math.round(s.precio/r)):1}))}

const conDato=[], sinDato=[], conflicto=[]
proyectos.forEach(p=>{
  const c=cant[p.npresu]
  const e=est(p)
  if(c!==undefined){ p.cant=c; p.est=e; conDato.push(p); if(Math.abs(c-e)>=2&&p.costo>500000) conflicto.push(p) }
  else if(e>=2) sinDato.push({...p,est:e})
})
console.log(`\n${'█'.repeat(76)}\n  CRUCE PRESUPUESTOS."Cant. Fechas" → PROYECTOS."Días"\n${'█'.repeat(76)}`)
console.log(`  Proyectos 2026:                       ${proyectos.length}`)
console.log(`  Ya tienen Cant. Fechas en PRESUPUESTOS: ${conDato.length}  ← se cargan solos`)
console.log(`     de esos, multi-día (>1):            ${conDato.filter(p=>p.cant>1).length}`)
console.log(`  SIN dato y sospechosos de multi-día:   ${sinDato.length}  ← a revisar con Juan`)
if(dupConflicto.size) console.log(`  ⚠ N° duplicados con valores distintos: ${[...dupConflicto].join(', ')}`)

console.log(`\n${'━'.repeat(76)}\n  DONDE EL DATO DEL SHEET NO COINCIDE CON LA ESTIMACIÓN (revisar)\n${'━'.repeat(76)}`)
conflicto.sort((a,b)=>b.costo-a.costo).slice(0,15).forEach(p=>
  console.log(`  [${p.npresu.padEnd(6)}] ${p.fecha.padEnd(11)} ${p.proy.slice(0,34).padEnd(36)} staff ${money(p.costo).padStart(12)}   sheet dice ${p.cant}d · yo estimo ${p.est}d`))

console.log(`\n${'━'.repeat(76)}\n  SIN DATO — a definir con Juan (top 20 por plata)\n${'━'.repeat(76)}`)
sinDato.sort((a,b)=>b.costo-a.costo).slice(0,20).forEach(p=>
  console.log(`  [${p.npresu.padEnd(6)}] ${p.fecha.padEnd(11)} ${(p.agencia||'—').slice(0,14).padEnd(16)} ${p.proy.slice(0,32).padEnd(34)} ${money(p.costo).padStart(12)}  ~${p.est}d?`))

if(!ESCRIBIR){ console.log(`\n  ⚠ PREVIEW — no se escribió nada. Correr con --escribir para aplicar los ${conDato.length}.`) }
else {
  const data=conDato.map(p=>({range:`PROYECTOS!CG${p.fila}`,values:[[p.cant]]}))
  for(let i=0;i<data.length;i+=500)
    await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data:data.slice(i,i+500)}})
  console.log(`\n  ✓ Escritos ${data.length} valores en PROYECTOS!CG`)
}
