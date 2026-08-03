/**
 * ¿Conviene contratar un filmmaker FIJO?
 * Lee PAGOS_STAFF 2026 y separa el gasto en freelancers de CÁMARA/FILMMAKER
 * del resto (edición, sonido, drone, producción...). Por mes y por persona.
 * Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const MES=['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

const CAMARA=/film|c[aá]mara|camara|video|foto|df\b|director de fot/i
const EDIT=/edit|edici|post|color/i
const OTROS=/sonid|drone|dron|producci|asisten|maquilla|gaffer|el[eé]ctric|arte|guion|locu/i

const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PAGOS_STAFF','PROYECTOS'],valueRenderOption:'FORMATTED_VALUE'})
const [PAG,PRO]=r.data.valueRanges.map(v=>v.values||[])

console.log('\nHEADERS PAGOS_STAFF:'); PAG[0].forEach((h,i)=>console.log(`  [${i}] ${h}`))

// mapa n° presu -> pedidos por persona, para clasificar cuando Servicio está vacío
const PRC=[12,15,18,21,24,27,30,33,36,39,42,45,48,61,64,67,70,73,76,79,82]
const STF=[13,16,19,22,25,28,31,34,37,40,43,46,49,62,65,68,71,74,77,80,83]
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const proyPed={} // "n°|persona" -> [pedidos]
PRO.slice(1).forEach(row=>{const n=txt(row[2]);if(!n)return
  STF.forEach((sc,k)=>{const p=txt(row[sc]);if(!p)return
    const key=`${n}|${p.toLowerCase()}`;(proyPed[key]=proyPed[key]||[]).push(txt(row[PED[k]]))})})

function clasificar(servicio,npresu,persona){
  const s=txt(servicio)
  if(EDIT.test(s)) return 'edicion'
  if(CAMARA.test(s)) return 'camara'
  if(OTROS.test(s)) return 'otros'
  const peds=proyPed[`${txt(npresu)}|${txt(persona).toLowerCase()}`]||[]
  const j=peds.join(' ')
  if(EDIT.test(j)&&!CAMARA.test(j)) return 'edicion'
  if(CAMARA.test(j)&&!EDIT.test(j)) return 'camara'
  if(OTROS.test(j)) return 'otros'
  return 'sinclasif'
}

// equipo interno (no son freelancers de cámara a reemplazar)
const INTERNO=/somos magma|sofia|sof[ií]a|juan mart|luciana|lucia |lulu|tom[aá]s|daniel|dani /i

const filas=[]
PAG.slice(1).forEach((row,i)=>{
  const persona=txt(row[1]); if(!persona) return
  const notas=txt(row[11]), fpago=txt(row[0])
  if(/2025|migrad/i.test(notas)||/\/2025/.test(fpago)) return
  const mesRef=parseInt(txt(row[2]))||0
  const monto=num(row[6])||num(row[7])
  if(monto<=1) return // el $1 a Somos Magma es atajo de fee agencia
  filas.push({fila:i+2,persona,mesRef,npresu:txt(row[3]),proy:txt(row[4]).slice(0,34),
    serv:txt(row[5]),monto,cls:clasificar(row[5],row[3],persona),interno:INTERNO.test(persona)})
})

// dedup por (persona + n° presu + monto)
const vistos=new Set()
filas.forEach(f=>{const k=`${f.persona}|${f.npresu}|${Math.round(f.monto)}`
  if(f.npresu&&vistos.has(k)) f.dup=true; else if(f.npresu) vistos.add(k)})

const vivos=filas.filter(f=>!f.dup)
const meses=[...new Set(vivos.map(f=>f.mesRef))].filter(m=>m>0).sort((a,b)=>a-b)

console.log(`\n${'█'.repeat(72)}\n  GASTO EN STAFF 2026 — ¿cuánto es CÁMARA/FILMMAKER?\n${'█'.repeat(72)}`)
const cats=['camara','edicion','otros','sinclasif']
for(const m of meses){
  const del=vivos.filter(f=>f.mesRef===m&&!f.interno)
  if(!del.length) continue
  const tot=del.reduce((s,f)=>s+f.monto,0)
  const porCat=cats.map(c=>[c,del.filter(f=>f.cls===c).reduce((s,f)=>s+f.monto,0)])
  console.log(`\n${MES[m].toUpperCase()}  total externo ${money(tot)}`)
  porCat.forEach(([c,v])=>{ if(v) console.log(`   ${c.padEnd(11)} ${money(v).padStart(13)}  (${Math.round(v/tot*100)}%)`)})
}

// --- foco cámara ---
const cam=vivos.filter(f=>f.cls==='camara'&&!f.interno)
const totCam=cam.reduce((s,f)=>s+f.monto,0)
const nMeses=meses.length||1
console.log(`\n${'━'.repeat(72)}\n  CÁMARA / FILMMAKER (solo externos)\n${'━'.repeat(72)}`)
console.log(`  Total ${MES[meses[0]]}–${MES[meses.at(-1)]}: ${money(totCam)}   ·   promedio ${money(totCam/nMeses)}/mes`)

const porMes={}
cam.forEach(f=>{porMes[f.mesRef]=porMes[f.mesRef]||{tot:0,proys:new Set(),gente:new Set()}
  porMes[f.mesRef].tot+=f.monto; if(f.npresu)porMes[f.mesRef].proys.add(f.npresu); porMes[f.mesRef].gente.add(f.persona)})
console.log(`\n  mes    gasto cámara     laburos   personas distintas`)
meses.forEach(m=>{const d=porMes[m];if(!d)return
  console.log(`  ${MES[m].padEnd(5)} ${money(d.tot).padStart(14)}   ${String(d.proys.size).padStart(5)}     ${d.gente.size}`)})

const porPersona={}
cam.forEach(f=>{const p=porPersona[f.persona]=porPersona[f.persona]||{tot:0,n:0,proys:new Set(),meses:new Set()}
  p.tot+=f.monto;p.n++;if(f.npresu)p.proys.add(f.npresu);p.meses.add(f.mesRef)})
console.log(`\n  QUIÉN SE LLEVA LA PLATA DE CÁMARA:`)
Object.entries(porPersona).sort((a,b)=>b[1].tot-a[1].tot).slice(0,15).forEach(([p,d])=>
  console.log(`   ${money(d.tot).padStart(13)}  ${String(d.proys.size).padStart(3)} laburos  en ${d.meses.size} meses   ${p}`))

// costo promedio por jornada/laburo
const totProys=new Set(cam.filter(f=>f.npresu).map(f=>f.npresu)).size
console.log(`\n  ${totProys} laburos de cámara en ${nMeses} meses = ${(totProys/nMeses).toFixed(1)}/mes`)
console.log(`  Costo promedio por laburo: ${money(totCam/Math.max(totProys,1))}`)

const sin=vivos.filter(f=>f.cls==='sinclasif'&&!f.interno)
if(sin.length) console.log(`\n  ⚠ sin clasificar: ${sin.length} filas por ${money(sin.reduce((s,f)=>s+f.monto,0))} (revisar servicio vacío)`)
