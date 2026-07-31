/**
 * Carga 2025: los 17 multi-día confirmados por Juan + los de 1 día que validó el Calendar.
 * SEMÁNTICA: "Días x persona" = TOTAL de jornadas de esa persona en el proyecto,
 * sin importar cuántas líneas de pago tenga (las líneas son conceptos de cobro).
 * PREVIEW por defecto; con --escribir aplica.
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

// fila -> {d: días del proyecto, exc: {persona: total jornadas}}
const CONF={
  36 :{d:4, exc:{},                nota:'Juan 4 jornadas (2 líneas de cobro, no 2 jornadas)'},
  62 :{d:1, exc:{'Juan':2},        nota:'Juan 2 · Sofi 1 · Ivan 1'},
  94 :{d:1, exc:{'Julian':3},      nota:'Felipe 1 · Julián 3 (2 líneas de cobro)'},
  232:{d:2, exc:{},                nota:'Santino 2 · Lucas 2'},
  229:{d:2, exc:{},                nota:'Juan 2'},
  125:{d:1, exc:{},                nota:'1 día todos'},
  186:{d:1, exc:{},                nota:'1 día todos'},
  6  :{d:2, exc:{},                nota:'Juan 2'},
  57 :{d:2, exc:{},                nota:'Santino 2'},
  341:{d:1, exc:{},                nota:'1 día cada uno'},
  329:{d:3, exc:{},                nota:'Santino 3 (3 líneas de cobro, no 9 jornadas)'},
  412:{d:1, exc:{},                nota:'1 día cada uno'},
  271:{d:1, exc:{'Juan':2},        nota:'Felipe 1 · Juan 2'},
  433:{d:1, exc:{},                nota:'1 día cada uno'},
  427:{d:1, exc:{},                nota:'locución, 1 día'},
  426:{d:1, exc:{},                nota:'edición, 1 día'},
  56 :{d:1, exc:{},                nota:'1 día'},
}

const R=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'HISTORICO_2025',valueRenderOption:'FORMATTED_VALUE'})
const H=R.data.values||[]
function pf(s){const m=txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?new Date(+m[3],+m[2]-1,+m[1]):null}
const proys=[]
H.slice(1).forEach((r,i)=>{
  const nom=txt(r[6]); if(!nom)return
  const st=[]; [15,17,19,21,23,25].forEach(sc=>{const p=txt(r[sc]); const pr=num(r[sc+1])
    if(p&&pr>1&&!/somos magma/i.test(p)) st.push(p)})
  if(!st.length)return
  const f=pf(r[2]); if(!f)return
  proys.push({fila:i+2,fecha:f,nom,n:norm(nom),st:[...new Set(st)]})
})

// los de 1 día validados por Calendar
const ev=readFileSync(CAL,'utf8').trim().split('\n').map(l=>JSON.parse(l)).map(e=>{
  const allday=e.ini.length===10||/T00:00:00Z$/.test(e.ini)
  const di=new Date(e.ini), df=new Date(e.fin||e.ini)
  return {n:norm(e.s),ini:dkey(di),dias:allday?Math.max(1,Math.round((df-di)/86400000)):1}
}).filter(e=>e.n.length>2)
const RUIDO=/^(reunion|reunon|call|llamado|pagar|cobrar|feriado|vacaciones|cumple|entrega|mail|enviar|presupuesto|almuerzo con|dentista|medico)/
const evs=ev.filter(e=>!RUIDO.test(e.n))
const STOP=new Set(['de','del','la','el','los','las','y','en','con','para','por','a','video','fotos','foto'])
const pal=s=>s.split(' ').filter(w=>w.length>2&&!STOP.has(w))
const score=(a,b)=>{const A=pal(a),B=new Set(pal(b)); return A.length?A.filter(w=>B.has(w)).length/A.length:0}
const unDia=[]
proys.forEach(p=>{
  if(CONF[p.fila])return
  let m=null
  evs.forEach(e=>{const dd=Math.round((new Date(e.ini)-p.fecha)/86400000)
    if(dd<-2||dd>6)return
    const sc=Math.max(score(p.n,e.n),score(e.n,p.n))
    if(sc>=0.5&&(!m||sc>m.sc)) m={e,sc}})
  if(m&&m.e.dias===1) unDia.push(p)
})

const data=[], problemas=[]
Object.entries(CONF).forEach(([f,cfg])=>{
  const fila=+f, p=proys.find(x=>x.fila===fila)
  if(!p){ problemas.push(`fila ${fila} no encontrada`); return }
  const excOK={}
  Object.entries(cfg.exc).forEach(([pers,d])=>{
    if(p.st.some(s=>norm(s)===norm(pers))) excOK[pers]=d
    else problemas.push(`fila ${fila}: "${pers}" no está en el staff (hay: ${p.st.join(', ')})`)
  })
  const excStr=Object.entries(excOK).map(([k,v])=>`${k}:${v}`).join(' | ')
  data.push({fila,nom:p.nom,d:cfg.d,exc:excStr,nota:cfg.nota,tipo:'revisado'})
})
unDia.forEach(p=>data.push({fila:p.fila,nom:p.nom,d:1,exc:'',nota:'',tipo:'calendar'}))

console.log(`\n${'━'.repeat(78)}\n  ${ESCRIBIR?'ESCRIBIENDO':'PREVIEW'} — 2025\n${'━'.repeat(78)}`)
console.log(`\n  CONFIRMADOS POR JUAN (${data.filter(d=>d.tipo==='revisado').length}):`)
data.filter(d=>d.tipo==='revisado').sort((a,b)=>a.fila-b.fila).forEach(d=>{
  console.log(`   f${String(d.fila).padStart(4)}  Días=${d.d}  ${d.nom.slice(0,34).padEnd(36)} ${d.nota}`)
  if(d.exc) console.log(`   ${''.padEnd(6)}└─ ${d.exc}`)})
console.log(`\n  VALIDADOS POR CALENDAR como 1 día: ${data.filter(d=>d.tipo==='calendar').length}`)
if(problemas.length){ console.log(`\n  ⚠ PROBLEMAS:`); problemas.forEach(p=>console.log('    · '+p)) }

if(!ESCRIBIR) console.log(`\n  PREVIEW — no se escribió nada (${data.length} filas listas).`)
else{
  // AH = Días origen (se crea si no existe)
  const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets.properties'})
  const sp=meta.data.sheets.find(s=>s.properties.title==='HISTORICO_2025').properties
  if(sp.gridProperties.columnCount<34)
    await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[{appendDimension:{sheetId:sp.sheetId,dimension:'COLUMNS',length:34-sp.gridProperties.columnCount}}]}})
  await sheets.spreadsheets.values.update({spreadsheetId:ID,range:'HISTORICO_2025!AH1',valueInputOption:'USER_ENTERED',requestBody:{values:[['Días origen']]}})
  const payload=data.flatMap(d=>[
    {range:`HISTORICO_2025!AF${d.fila}`,values:[[d.d]]},
    {range:`HISTORICO_2025!AG${d.fila}`,values:[[d.exc]]},
    {range:`HISTORICO_2025!AH${d.fila}`,values:[[d.tipo]]},
  ])
  for(let i=0;i<payload.length;i+=450)
    await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data:payload.slice(i,i+450)}})
  console.log(`\n  ✓ ${data.length} proyectos escritos en HISTORICO_2025 (AF/AG/AH)`)
}
