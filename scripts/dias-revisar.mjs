/**
 * Lista para revisar con Juan: proyectos que probablemente duraron más de 1 día.
 * Agrupado POR AGENCIA. 2026 (PROYECTOS) + 2025 (HISTORICO_2025).
 * Solo lectura — no escribe nada.
 */
import { google } from 'googleapis'
import { readFileSync, writeFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
// TODOS los bloques de pedido: 1-12, Otros, y 13-20
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const ED=/edit|edici|post|color|dise|anim/i

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS','HISTORICO_2025','RRHH'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,H25,RR]=R.data.valueRanges.map(v=>v.values||[])
const tarifaRR={}
RR.slice(1).forEach(r=>{const n=txt(r[0]).toLowerCase(); if(n) tarifaRR[n]={media:num(r[11]),jornada:num(r[12])}})

// ---------- 2026 ----------
const p26=[]
PRO.slice(1).forEach(row=>{
  const fecha=txt(row[3]); if(!/\/2026$/.test(fecha))return
  const staff=[]
  PED.forEach(pc=>{const ped=txt(row[pc]); if(!ped||ED.test(ped))return
    const precio=num(row[pc+1]), pers=txt(row[pc+2])
    if(precio<=1||!pers||/somos magma/i.test(pers))return
    staff.push({ped,precio,pers})})
  if(!staff.length)return
  p26.push({npresu:txt(row[2]),fecha,agencia:txt(row[4])||'(sin agencia)',cliente:txt(row[5]),
    proy:txt(row[6]),total:num(row[7]),staff,costo:staff.reduce((s,x)=>s+x.precio,0)})
})
// tarifa modal por persona (2026)
const ac26={}; p26.forEach(p=>p.staff.forEach(s=>(ac26[s.pers.toLowerCase()]=ac26[s.pers.toLowerCase()]||[]).push(s.precio)))
const md26={}; Object.entries(ac26).forEach(([k,a])=>{const c={};a.forEach(x=>c[x]=(c[x]||0)+1)
  md26[k]=+Object.entries(c).sort((x,y)=>y[1]-x[1]||(+x[0])-(+y[0]))[0][0]})
function ref26(pers,ped){const t=tarifaRR[pers.toLowerCase()], media=/1\/2|½/.test(ped)
  if(t&&t.jornada) return media?(t.media||t.jornada/2):t.jornada
  return md26[pers.toLowerCase()]||0}
p26.forEach(p=>{
  p.sos=p.staff.map(s=>{const r=ref26(s.pers,s.ped); return {...s,ref:r,dias:r?s.precio/r:1}})
  p.maxD=Math.max(...p.sos.map(s=>s.dias))
  p.dispar=new Set(p.sos.filter(s=>s.dias>=1.6).map(s=>Math.round(s.dias))).size>1
})

// ---------- 2025 ----------
const p25=[]
H25.slice(1).forEach(r=>{
  if(!txt(r[6]))return
  const staff=[]
  ;[15,17,19,21,23,25].forEach(sc=>{const pers=txt(r[sc]); const precio=num(r[sc+1])
    if(!pers||precio<=1||/somos magma/i.test(pers))return
    staff.push({pers,precio,ped:''})})
  if(!staff.length)return
  // en HISTORICO_2025 la agencia suele venir cargada en la columna "Cliente"
  p25.push({fecha:txt(r[2]),agencia:txt(r[5])||txt(r[4])||'(sin agencia)',cliente:txt(r[5])?txt(r[4]):'',
    proy:txt(r[6]),total:num(r[7]),staff,costo:staff.reduce((s,x)=>s+x.precio,0),fila:0})
})
const ac25={}; p25.forEach(p=>p.staff.forEach(s=>(ac25[s.pers.toLowerCase()]=ac25[s.pers.toLowerCase()]||[]).push(s.precio)))
const md25={}; Object.entries(ac25).forEach(([k,a])=>{const c={};a.forEach(x=>c[x]=(c[x]||0)+1)
  md25[k]=+Object.entries(c).sort((x,y)=>y[1]-x[1]||(+x[0])-(+y[0]))[0][0]})
p25.forEach(p=>{
  p.sos=p.staff.map(s=>{const r=md25[s.pers.toLowerCase()]||0; return {...s,ref:r,dias:r?s.precio/r:1}})
  p.maxD=Math.max(...p.sos.map(s=>s.dias))
  p.dispar=new Set(p.sos.filter(s=>s.dias>=1.6).map(s=>Math.round(s.dias))).size>1
})

// ---------- salida por agencia ----------
let out=''
const L=s=>{out+=s+'\n'; console.log(s)}
function bloque(titulo,lista){
  const sos=lista.filter(p=>p.maxD>=1.6).sort((a,b)=>b.costo-a.costo)
  L(`\n${'█'.repeat(78)}\n  ${titulo} — ${sos.length} proyectos a revisar  (${money(sos.reduce((s,p)=>s+p.costo,0))} en staff)\n${'█'.repeat(78)}`)
  const porAg={}
  sos.forEach(p=>(porAg[p.agencia]=porAg[p.agencia]||[]).push(p))
  Object.entries(porAg).sort((a,b)=>b[1].reduce((s,p)=>s+p.costo,0)-a[1].reduce((s,p)=>s+p.costo,0)).forEach(([ag,ps])=>{
    L(`\n▓ ${ag.toUpperCase()}  (${ps.length} proy · ${money(ps.reduce((s,p)=>s+p.costo,0))})`)
    ps.forEach(p=>{
      const flag=p.dispar?'  ⚠ CADA UNO DISTINTO':''
      L(`\n   ${p.fecha}  ${p.proy}${p.npresu?'  ['+p.npresu+']':''}   staff ${money(p.costo)}   → ~${Math.round(p.maxD)} días?${flag}`)
      if(p.cliente&&p.cliente!==ag) L(`      cliente: ${p.cliente}`)
      p.sos.sort((a,b)=>b.precio-a.precio).forEach(s=>{
        const d=s.dias>=1.6?`~${Math.round(s.dias)}d`:'1d'
        L(`        ${money(s.precio).padStart(12)}  ${(s.ped||'—').padEnd(12)} ${s.pers.slice(0,26).padEnd(28)} ${d}`)})
    })
  })
}
bloque('2026 · PROYECTOS',p26)
bloque('2025 · HISTORICO_2025',p25)
writeFileSync('/private/tmp/claude-501/-Users-dronjuan-somos-magma-app/ecd947ac-0d54-475a-815e-ef8ee6b06411/scratchpad/dias-revisar.txt',out)
console.log('\n\n(guardado en scratchpad/dias-revisar.txt)')
