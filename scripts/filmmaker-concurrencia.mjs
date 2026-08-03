/**
 * ¿Cuántos filmmakers fijos absorbe la operación?
 * Mira PROYECTOS: por día de evento, cuántos pedidos de CÁMARA hay en simultáneo.
 * Un fijo cubre 1 rodaje por día. Si hay días con 3 eventos, el 3ro sigue siendo freelance.
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
const CAMARA=/film|c[aá]mara|camara|video|foto/i
const EDIT=/edit|edici|post|color/i

const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS',valueRenderOption:'FORMATTED_VALUE'})
const PRO=r.data.values||[]
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47]
const PRC=PED.map(p=>p+1), STF=PED.map(p=>p+2)

// fecha DD/MM/YYYY o D/M/YYYY -> {key,mes}
function parseF(s){const m=txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if(!m)return null
  return {key:`${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`,mes:+m[2],anio:+m[3],dia:+m[1]}}

const dias={} // fechaKey -> [{proy, pedido, precio, staff}]
let sinFecha=0
PRO.slice(1).forEach(row=>{
  const f=parseF(row[3]); const nom=txt(row[6]); const npresu=txt(row[2])
  if(!nom&&!npresu) return
  const cams=[]
  PED.forEach((pc,k)=>{const p=txt(row[pc]); if(!p) return
    if(EDIT.test(p)) return
    if(!CAMARA.test(p)) return
    cams.push({pedido:p,precio:num(row[PRC[k]]),staff:txt(row[STF[k]])})})
  if(!cams.length) return
  if(!f){sinFecha++;return}
  if(f.anio!==2026) return
  ;(dias[f.key]=dias[f.key]||{mes:f.mes,items:[]}).items.push({proy:nom.slice(0,32),npresu,cams})
})

console.log(`\n${'█'.repeat(74)}\n  CONCURRENCIA: ¿cuántos rodajes de cámara caen el MISMO día?\n${'█'.repeat(74)}`)
if(sinFecha) console.log(`  (${sinFecha} proyectos con cámara sin fecha válida — no entran)`)

const porMes={}
Object.entries(dias).forEach(([k,d])=>{
  const nPersonas=d.items.reduce((s,it)=>s+it.cams.length,0) // pedidos de cámara ese día
  const m=porMes[d.mes]=porMes[d.mes]||{dias:0,eventos:0,pedidos:0, hist:{}, plataPrimero:0, plataResto:0}
  m.dias++; m.eventos+=d.items.length; m.pedidos+=nPersonas
  m.hist[nPersonas]=(m.hist[nPersonas]||0)+1
  // plata: el "primer" pedido de cada día lo cubriría el fijo, el resto sigue freelance
  const todos=d.items.flatMap(it=>it.cams).sort((a,b)=>b.precio-a.precio)
  m.plataPrimero+=todos[0]?.precio||0
  m.plataResto+=todos.slice(1).reduce((s,c)=>s+c.precio,0)
})

console.log(`\n  mes   días c/rodaje   pedidos cámara   máx simultáneos`)
const mesesOrd=Object.keys(porMes).map(Number).sort((a,b)=>a-b)
mesesOrd.forEach(m=>{const d=porMes[m]
  const max=Math.max(...Object.keys(d.hist).map(Number))
  console.log(`  ${MES[m].padEnd(4)}  ${String(d.dias).padStart(8)}      ${String(d.pedidos).padStart(8)}         ${max}`)})

console.log(`\n  DISTRIBUCIÓN — de los días con rodaje, cuántos pedidos simultáneos:`)
const histTotal={}
Object.values(porMes).forEach(m=>Object.entries(m.hist).forEach(([k,v])=>histTotal[k]=(histTotal[k]||0)+v))
const totDias=Object.values(histTotal).reduce((s,v)=>s+v,0)
Object.keys(histTotal).map(Number).sort((a,b)=>a-b).forEach(k=>{
  const v=histTotal[k]
  console.log(`   ${k} pedido${k>1?'s':''} simultáneo${k>1?'s':''}: ${String(v).padStart(4)} días  ${'▇'.repeat(Math.round(v/totDias*50))} ${Math.round(v/totDias*100)}%`)})

// --- cuánto absorbería 1 fijo vs 2 fijos ---
console.log(`\n${'━'.repeat(74)}\n  CUÁNTO GASTO ABSORBE UN FIJO (a 1 rodaje por día)\n${'━'.repeat(74)}`)
const activos=mesesOrd.filter(m=>porMes[m].dias>=5)
let absorbe1=0, resto1=0, absorbe2=0, resto2=0, diasTot=0
Object.entries(dias).forEach(([k,d])=>{
  if(!activos.includes(d.mes)) return
  diasTot++
  const todos=d.items.flatMap(it=>it.cams).sort((a,b)=>b.precio-a.precio)
  absorbe1+=todos[0]?.precio||0; resto1+=todos.slice(1).reduce((s,c)=>s+c.precio,0)
  absorbe2+=todos.slice(0,2).reduce((s,c)=>s+c.precio,0); resto2+=todos.slice(2).reduce((s,c)=>s+c.precio,0)
})
const nAct=activos.length
console.log(`  Ventana: ${activos.map(m=>MES[m]).join(', ')} (${nAct} meses, ${diasTot} días con rodaje)`)
console.log(`  Días con rodaje por mes: ${(diasTot/nAct).toFixed(1)}`)
console.log(`\n  Con 1 FIJO:  absorbe ${money(absorbe1/nAct)}/mes  ·  queda freelance ${money(resto1/nAct)}/mes`)
console.log(`  Con 2 FIJOS: absorben ${money(absorbe2/nAct)}/mes  ·  queda freelance ${money(resto2/nAct)}/mes`)
