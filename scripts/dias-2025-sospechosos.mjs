/**
 * (1) Carga las 5 correcciones que dio Juan sobre los "sin match".
 * (2) De los que quedan sin match, saca los SOSPECHOSOS de multi-día:
 *     los que tienen un evento de varios días en el Calendar dentro de su ventana.
 * PREVIEW por defecto; con --escribir carga las 5.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const ESCRIBIR=process.argv.includes('--escribir')
const CAL='/private/tmp/claude-501/-Users-dronjuan-somos-magma-app/ecd947ac-0d54-475a-815e-ef8ee6b06411/scratchpad/cal/todos.jsonl'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9\s]/g,' ').replace(/\s+/g,' ').trim().toLowerCase()
const dkey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

// Confirmado por Juan 2026-07-31 (fila -> días / excepciones)
const NUEVAS={
  167:{d:3, exc:{}, nota:'AgroActiva-Iveco: 3 días Juan'},
  35 :{d:1, exc:{}, nota:'Expo agro Capsulas: es EDICIÓN, no jornada de rodaje'},
  108:{d:3, exc:{}, nota:'Costa del Este: 3 días cada uno'},
  92 :{d:1, exc:{}, nota:'Eventos Galaxia: 1 sola jornada larga'},
  5  :{d:1, exc:{}, nota:'Gauchada Andreani: 1 día'},
}

const R=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'HISTORICO_2025',valueRenderOption:'FORMATTED_VALUE'})
const H=R.data.values||[]
function pf(s){const m=txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?new Date(+m[3],+m[2]-1,+m[1]):null}
const proys=[]
H.slice(1).forEach((r,i)=>{
  const nom=txt(r[6]); if(!nom)return
  const st=[]; [15,17,19,21,23,25].forEach(sc=>{const p=txt(r[sc]); const pr=num(r[sc+1])
    if(p&&pr>1&&!/somos magma/i.test(p)) st.push({pers:p,precio:pr})})
  if(!st.length)return
  const f=pf(r[2]); if(!f)return
  proys.push({fila:i+2,fecha:f,nom,n:norm(nom),ag:txt(r[5])||txt(r[4])||'—',st,
    costo:st.reduce((s,x)=>s+x.precio,0), yaTiene:num(r[31])>0})
})

// ---- (1) cargar las 5 ----
const data=[]
Object.entries(NUEVAS).forEach(([f,cfg])=>{
  const p=proys.find(x=>x.fila===+f)
  if(!p){ console.log(`⚠ fila ${f} no encontrada`); return }
  data.push({fila:+f,nom:p.nom,d:cfg.d,nota:cfg.nota})
})
console.log(`\n${'━'.repeat(78)}\n  ${ESCRIBIR?'ESCRIBIENDO':'PREVIEW'} — 5 correcciones\n${'━'.repeat(78)}`)
data.forEach(d=>console.log(`  f${String(d.fila).padStart(4)}  Días=${d.d}  ${d.nom.slice(0,32).padEnd(34)} ${d.nota}`))
if(ESCRIBIR){
  const payload=data.flatMap(d=>[
    {range:`HISTORICO_2025!AF${d.fila}`,values:[[d.d]]},
    {range:`HISTORICO_2025!AH${d.fila}`,values:[['revisado']]},
  ])
  await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data:payload}})
  console.log(`  ✓ ${data.length} cargadas`)
}

// ---- (2) sospechosos entre los que quedan sin días ----
const ev=readFileSync(CAL,'utf8').trim().split('\n').map(l=>JSON.parse(l)).map(e=>{
  const allday=e.ini.length===10||/T00:00:00Z$/.test(e.ini)
  const di=new Date(e.ini), df=new Date(e.fin||e.ini)
  return {s:e.s,n:norm(e.s),ini:dkey(di),d0:di,dias:allday?Math.max(1,Math.round((df-di)/86400000)):1}
}).filter(e=>e.n.length>2)
const RUIDO=/^(reunion|reunon|call|llamado|pagar|cobrar|feriado|vacaciones|cumple|entrega|mail|enviar|presupuesto|almuerzo con|dentista|medico|posible)/
const evs=ev.filter(e=>!RUIDO.test(e.n))
const multiEv=evs.filter(e=>e.dias>1)

const pend=proys.filter(p=>!p.yaTiene && !NUEVAS[p.fila])
console.log(`\n${'█'.repeat(78)}\n  SOSPECHOSOS — sin días cargados y con un evento MULTI-DÍA encima\n${'█'.repeat(78)}`)
console.log(`  Quedan sin días: ${pend.length}  ·  ${money(pend.reduce((s,p)=>s+p.costo,0))}\n`)
const sos=[]
pend.forEach(p=>{
  const cerca=multiEv.filter(e=>{const dd=Math.round((p.fecha-e.d0)/86400000); return dd>=0&&dd<e.dias})
    .concat(multiEv.filter(e=>{const dd=Math.round((e.d0-p.fecha)/86400000); return dd>0&&dd<=2}))
  if(cerca.length) sos.push({...p,cerca:[...new Set(cerca)]})
})
sos.sort((a,b)=>b.costo-a.costo).forEach(p=>{
  console.log(`\n  ${p.fecha.toLocaleDateString('es-AR').padEnd(11)} ${p.nom.slice(0,34).padEnd(36)} ${(p.ag||'—').slice(0,13).padEnd(15)} ${money(p.costo).padStart(12)}  [f${p.fila}]`)
  console.log(`      staff: ${p.st.map(s=>s.pers+' '+money(s.precio)).join(' · ')}`)
  console.log(`      calendar: ${p.cerca.map(e=>`«${e.s.slice(0,30)}» ${e.dias}d`).join('  ')}`)
})
console.log(`\n  ${sos.length} sospechosos · ${money(sos.reduce((s,p)=>s+p.costo,0))}`)
console.log(`  Los otros ${pend.length-sos.length} no tienen ningún evento largo cerca → 1 jornada.`)
