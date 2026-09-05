/**
 * AUSTRAL — base para la propuesta del reemplazo de Lucho. Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { SLOT_PROY, MAX_SLOTS } from '../lib/slots.js'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[$\s]/g,'').replace(/,/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const MES=['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const AUS=/austral/i
const ES_COB=s=>/film|foto|video|drone|dron/i.test(s) && !/edit/i.test(s)
const TIPO=s=>/foto/i.test(s)?'FOTO':/film/i.test(s)?'FILM':'VIDEO'

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,
  ranges:['PROYECTOS!A:ER','HISTORICO_2025!A:AH','HISTORICO_2024!A:AH','FACTURACION!A:Z'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,H25,H24,FAC]=R.data.valueRanges.map(v=>v.values||[])

// ---- 2026 desde PROYECTOS
const P26=[]
for(const r of PRO.slice(1)){
  const f=fecha(r[3]); if(!f||f.getFullYear()!==2026) continue
  if(!AUS.test(txt(r[5])) && !AUS.test(txt(r[4]))) continue
  const items=[]
  for(let n=1;n<=MAX_SLOTS;n++){ const s=SLOT_PROY(n); const sv=txt(r[s.pedido]); if(!sv) continue
    items.push({serv:sv,costo:num(r[s.precio]),quien:txt(r[s.staff])||'(sin asignar)'}) }
  P26.push({f,mes:f.getMonth()+1,nro:txt(r[2]),proy:txt(r[6]),total:num(r[7]),items})
}
// ---- histórico
function hist(rows,anio){
  const out=[]
  for(const r of rows.slice(1)){
    if(num(r[0])!==anio) continue
    if(!AUS.test(txt(r[4])) && !AUS.test(txt(r[5]))) continue
    const f=fecha(r[2]); const mes=f?f.getMonth()+1:num(r[1])
    const staff=[]
    for(let i=15;i<=25;i+=2){ const q=txt(r[i]); if(q) staff.push({quien:q,pago:num(r[i+1])}) }
    out.push({mes,nro:txt(r[3]),proy:txt(r[6]),total:num(r[7]),staff})
  }
  return out
}
const A25=hist(H25,2025), A24=hist(H24,2024)

const L='─'.repeat(78)
console.log('\n'+'█'.repeat(80));console.log('  AUSTRAL — LA BASE PARA LA PROPUESTA');console.log('█'.repeat(80))

console.log('\n  1) CUÁNTOS EVENTOS/TRABAJOS POR AÑO')
console.log('  '+L)
for(const [a,A,ms] of [['2024',A24,12],['2025',A25,12]]){
  const pm={}; A.forEach(p=>pm[p.mes]=(pm[p.mes]||0)+1)
  console.log(`     ${a}: ${String(A.length).padStart(3)} trabajos (${(A.length/ms).toFixed(1)}/mes)  ${M(A.reduce((s,p)=>s+p.total,0)).padStart(14)} facturado`)
  console.log('           '+Array.from({length:12},(_,i)=>`${MES[i+1]} ${String(pm[i+1]||0).padStart(2)}`).join(' · '))
}
{ const pm={}; P26.forEach(p=>pm[p.mes]=(pm[p.mes]||0)+1)
  console.log(`     2026: ${String(P26.length).padStart(3)} trabajos ene-ago (${(P26.length/8).toFixed(1)}/mes)  ${M(P26.reduce((s,p)=>s+p.total,0)).padStart(14)} facturado`)
  console.log('           '+Array.from({length:8},(_,i)=>`${MES[i+1]} ${String(pm[i+1]||0).padStart(2)}`).join(' · '))
  console.log(`     Proyección 2026 completo al ritmo actual: ~${Math.round(P26.length/8*12)} trabajos · ~${M(P26.reduce((s,p)=>s+p.total,0)/8*12)}`)
}

console.log('\n  2) JORNADAS DE COBERTURA (ir al evento) — 2026 ene-ago')
console.log('  '+L)
const cob=[]
P26.forEach(p=>p.items.filter(i=>ES_COB(i.serv)).forEach(i=>cob.push({...i,mes:p.mes,nro:p.nro,proy:p.proy,tipo:TIPO(i.serv)})))
console.log(`     Total ${cob.length} jornadas de cobertura = ${(cob.length/8).toFixed(1)}/mes`)
console.log('     MES   jornadas   FOTO  FILM  VIDEO   pagado')
for(let m=1;m<=8;m++){ const g=cob.filter(c=>c.mes===m)
  console.log(`     ${MES[m]}   ${String(g.length).padStart(8)}   ${String(g.filter(c=>c.tipo==='FOTO').length).padStart(4)}  ${String(g.filter(c=>c.tipo==='FILM').length).padStart(4)}  ${String(g.filter(c=>c.tipo==='VIDEO').length).padStart(5)}   ${M(g.reduce((s,c)=>s+c.costo,0)).padStart(12)}`) }
const tot=cob.reduce((s,c)=>s+c.costo,0)
console.log(`     ${'TOTAL'.padEnd(5)}  ${String(cob.length).padStart(8)}   ${String(cob.filter(c=>c.tipo==='FOTO').length).padStart(4)}  ${String(cob.filter(c=>c.tipo==='FILM').length).padStart(4)}  ${String(cob.filter(c=>c.tipo==='VIDEO').length).padStart(5)}   ${M(tot).padStart(12)}`)
console.log(`     Promedio pagado por jornada de cobertura: ${M(tot/cob.length)}   ·   costo cámara/mes: ${M(tot/8)}`)

console.log('\n  3) QUIÉN LAS HACE Y A CUÁNTO')
console.log('  '+L)
const q={}; cob.forEach(c=>{(q[c.quien] ||= {n:0,c:0}); q[c.quien].n++; q[c.quien].c+=c.costo})
for(const [k,v] of Object.entries(q).sort((a,b)=>b[1].n-a[1].n))
  console.log(`     ${k.padEnd(32).slice(0,32)} ${String(v.n).padStart(3)} jorn (${(v.n/8).toFixed(1)}/mes)  ${M(v.c/v.n).padStart(11)}/jorn   total ${M(v.c)}`)

console.log('\n  4) LA TARIFA DE LUCHO EN AUSTRAL, MES A MES (para ver cómo se movió)')
console.log('  '+L)
for(let m=1;m<=8;m++){ const g=cob.filter(c=>c.mes===m && /chavez/i.test(c.quien)); if(!g.length){console.log(`     ${MES[m]}   —`);continue}
  const v=g.map(c=>c.costo)
  console.log(`     ${MES[m]}   ${String(g.length).padStart(2)} jorn   min ${M(Math.min(...v)).padStart(10)}  prom ${M(v.reduce((a,b)=>a+b,0)/v.length).padStart(10)}  max ${M(Math.max(...v)).padStart(10)}`) }

console.log('\n  5) EDICIÓN DE VIDEO EN AUSTRAL (lo que NO entra en el acuerdo de foto)')
console.log('  '+L)
const ed=[]; P26.forEach(p=>p.items.filter(i=>/edit/i.test(i.serv)).forEach(i=>ed.push({...i,mes:p.mes})))
console.log(`     ${ed.length} ediciones en 8 meses (${(ed.length/8).toFixed(1)}/mes) · ${M(ed.reduce((s,e)=>s+e.costo,0))} · prom ${M(ed.reduce((s,e)=>s+e.costo,0)/ed.length)}`)
const qe={}; ed.forEach(e=>{(qe[e.quien] ||= {n:0,c:0}); qe[e.quien].n++; qe[e.quien].c+=e.costo})
for(const [k,v] of Object.entries(qe).sort((a,b)=>b[1].n-a[1].n)) console.log(`       ${k.padEnd(32).slice(0,32)} ${String(v.n).padStart(3)}×  prom ${M(v.c/v.n)}`)

console.log('\n  6) EL PRECIO DE VENTA DE UNA COBERTURA DE AUSTRAL')
console.log('  '+L)
const conCob=P26.filter(p=>p.items.some(i=>ES_COB(i.serv)))
const tots=conCob.map(p=>p.total).sort((a,b)=>a-b)
console.log(`     ${conCob.length} eventos con cobertura · ticket promedio ${M(tots.reduce((a,b)=>a+b,0)/tots.length)} · mediana ${M(tots[Math.floor(tots.length/2)])}`)
const dist={}; conCob.forEach(p=>dist[p.total]=(dist[p.total]||0)+1)
console.log('     ' + Object.entries(dist).sort((a,b)=>a[0]-b[0]).map(([t,n])=>`${M(+t)}×${n}`).join('  '))
console.log('')
