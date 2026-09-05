/**
 * AUSTRAL — el caudal de trabajo real. Solo lectura.
 * Cuántos eventos, cuándo, qué se pide, quién lo hace y a cuánto se paga.
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
const ES_AUSTRAL=/austral/i

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS!A:ER','HISTORICO_2025!A:CF'],valueRenderOption:'FORMATTED_VALUE'})
const PRO=R.data.valueRanges[0].values||[]
const H25=R.data.valueRanges[1].values||[]

function parse(rows, maxSlots){
  const out=[]
  for(const r of rows.slice(1)){
    const f=fecha(r[3]); if(!f) continue
    const cli=txt(r[5]), ag=txt(r[4])
    if(!ES_AUSTRAL.test(cli) && !ES_AUSTRAL.test(ag)) continue
    const items=[]
    for(let n=1;n<=maxSlots;n++){
      const {pedido,precio,staff}=SLOT_PROY(n)
      const s=txt(r[pedido]); if(!s) continue
      items.push({serv:s, costo:num(r[precio]), quien:txt(r[staff])||'(sin asignar)'})
    }
    out.push({fecha:f, mes:f.getMonth()+1, anio:f.getFullYear(), nro:txt(r[2]), proy:txt(r[6]),
      total:num(r[7]), fee:num(r[8]), pm:txt(r[51]), items})
  }
  return out
}
const P26=parse(PRO,MAX_SLOTS).filter(p=>p.anio===2026)
const P25=parse(H25,20).filter(p=>p.anio===2025)

const line=c=>console.log('  '+c.repeat(76))
console.log('\n'+'█'.repeat(80))
console.log('  AUSTRAL — CAUDAL DE TRABAJO')
console.log('█'.repeat(80))

for(const [label,P,meses] of [['2025 (año completo)',P25,12],['2026 (ene–ago, 8 meses)',P26,8]]){
  console.log(`\n  ── ${label}`)
  console.log(`     Eventos/proyectos: ${P.length}   ·   ${(P.length/meses).toFixed(1)}/mes`)
  console.log(`     Facturado a Austral: ${M(P.reduce((s,p)=>s+p.total,0))}`)
  const porMes={}
  for(const p of P) porMes[p.mes]=(porMes[p.mes]||0)+1
  console.log('     ' + Array.from({length:12},(_,i)=>i+1).filter(m=>meses>=m).map(m=>`${MES[m]} ${String(porMes[m]||0).padStart(2)}`).join(' · '))
}

console.log('\n  ── QUÉ SE PIDE EN AUSTRAL (2026, ene–ago) — todos los servicios cargados')
const serv={}
for(const p of P26) for(const it of p.items){
  const k=it.serv.toLowerCase().replace(/\s+/g,' ').trim()
  ;(serv[k] ||= {n:0,c:0,quien:{}})
  serv[k].n++; serv[k].c+=it.costo
  serv[k].quien[it.quien]=(serv[k].quien[it.quien]||0)+1
}
for(const [k,v] of Object.entries(serv).sort((a,b)=>b[1].n-a[1].n)){
  const top=Object.entries(v.quien).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([q,n])=>`${q} ${n}`).join(', ')
  console.log(`     ${k.padEnd(34).slice(0,34)} ${String(v.n).padStart(3)}×  prom ${M(v.c/v.n).padStart(11)}  → ${top}`)
}

console.log('\n  ── QUIÉN TRABAJA HOY EN AUSTRAL (2026)')
const q26={}
for(const p of P26) for(const it of p.items){ (q26[it.quien] ||= {n:0,c:0}); q26[it.quien].n++; q26[it.quien].c+=it.costo }
for(const [q,v] of Object.entries(q26).sort((a,b)=>b[1].c-a[1].c))
  console.log(`     ${q.padEnd(30).slice(0,30)} ${String(v.n).padStart(3)} servicios  ${M(v.c).padStart(13)}  prom ${M(v.c/v.n)}`)

console.log('\n  ── DETALLE MES A MES 2026 (eventos y qué se hizo)')
for(let m=1;m<=8;m++){
  const g=P26.filter(p=>p.mes===m); if(!g.length) continue
  console.log(`\n     ${MES[m].toUpperCase()} — ${g.length} eventos`)
  for(const p of g){
    console.log(`       ${String(p.fecha.getDate()).padStart(2)}/${String(m).padStart(2,'0')}  #${p.nro.padEnd(5)} ${p.proy.slice(0,40).padEnd(40)} ${M(p.total).padStart(12)}`)
    for(const it of p.items) console.log(`               · ${it.serv.slice(0,44).padEnd(44)} ${M(it.costo).padStart(11)}  ${it.quien}`)
  }
}
console.log('')
