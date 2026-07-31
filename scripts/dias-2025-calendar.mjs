/**
 * Cruza HISTORICO_2025 contra el Calendar de Somos Magma para sacar la duración real.
 * PREVIEW por defecto. Con --escribir carga HISTORICO_2025!AF (Días) y AG.
 *
 * OJO: en eventos all-day de Google, end.date es EXCLUSIVO
 * (ini 11/3 fin 15/3 = 4 días: 11,12,13,14).
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
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/[^a-zA-Z0-9\s]/g,' ').replace(/\s+/g,' ').trim().toLowerCase()
const dkey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

// ---------- calendar ----------
const ev=readFileSync(CAL,'utf8').trim().split('\n').map(l=>JSON.parse(l)).map(e=>{
  const allday = e.ini.length===10 || /T00:00:00Z$/.test(e.ini)
  const di=new Date(e.ini), df=new Date(e.fin||e.ini)
  let dias=1
  if(allday){ dias=Math.max(1, Math.round((df-di)/86400000)) }   // end EXCLUSIVO
  else { const d1=dkey(di), d2=dkey(new Date(df-1)); dias = d1===d2 ? 1 : Math.max(1,Math.round((new Date(d2)-new Date(d1))/86400000)+1) }
  return {s:e.s, n:norm(e.s), ini:dkey(di), dias, allday}
}).filter(e=>e.n.length>2)
// descartar ruido de agenda que no son rodajes
const RUIDO=/^(reunion|reunon|call|llamado|pagar|cobrar|feriado|vacaciones|cumple|entrega|mail|enviar|presupuesto|almuerzo con|dentista|medico)/
const evs=ev.filter(e=>!RUIDO.test(e.n))
console.log(`Calendar 2025: ${ev.length} eventos · ${evs.length} tras descartar agenda interna · ${evs.filter(e=>e.dias>1).length} de más de 1 día`)

// ---------- proyectos 2025 ----------
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
  proys.push({fila:i+2,fecha:f,fkey:dkey(f),nom,n:norm(nom),ag:txt(r[5])||txt(r[4])||'—',
    st,costo:st.reduce((s,x)=>s+x.precio,0),diasAct:num(r[31])})
})
console.log(`HISTORICO_2025: ${proys.length} proyectos con staff\n`)

// ---------- match ----------
// puntaje: palabras compartidas / palabras del proyecto, con la fecha cerca
const STOP=new Set(['de','del','la','el','los','las','y','en','con','para','por','a','video','fotos','foto'])
const pal=s=>s.split(' ').filter(w=>w.length>2&&!STOP.has(w))
function score(a,b){
  const A=pal(a), B=new Set(pal(b)); if(!A.length)return 0
  return A.filter(w=>B.has(w)).length/A.length
}
const res=[]
proys.forEach(p=>{
  let mejor=null
  evs.forEach(e=>{
    const dd=Math.round((new Date(e.ini)-p.fecha)/86400000)
    if(dd<-2||dd>6) return                       // el evento arranca cerca de la fecha del proyecto
    const sc=Math.max(score(p.n,e.n), score(e.n,p.n))
    if(sc<0.5) return
    const cand={e,sc,dd}
    if(!mejor||cand.sc>mejor.sc||(cand.sc===mejor.sc&&Math.abs(cand.dd)<Math.abs(mejor.dd))) mejor=cand
  })
  res.push({...p,match:mejor})
})
const conM=res.filter(r=>r.match), sinM=res.filter(r=>!r.match)
const multi=conM.filter(r=>r.match.e.dias>1)
console.log(`${'━'.repeat(76)}\n  RESULTADO DEL CRUCE\n${'━'.repeat(76)}`)
console.log(`  Matchearon con el Calendar:  ${conM.length} de ${proys.length}  (${Math.round(conM.length/proys.length*100)}%)`)
console.log(`     de esos, MULTI-DÍA:       ${multi.length}`)
console.log(`     de 1 día:                 ${conM.length-multi.length}`)
console.log(`  SIN match (quedan en 1):     ${sinM.length}  ·  ${money(sinM.reduce((s,r)=>s+r.costo,0))} en staff`)

console.log(`\n${'━'.repeat(76)}\n  MULTI-DÍA DETECTADOS POR CALENDAR (top 25 por plata)\n${'━'.repeat(76)}`)
multi.sort((a,b)=>b.costo-a.costo).slice(0,25).forEach(r=>
  console.log(`  ${r.fecha.toLocaleDateString('es-AR').padEnd(11)} ${r.nom.slice(0,32).padEnd(34)} ${money(r.costo).padStart(12)}  → ${r.match.e.dias}d  «${r.match.e.s.slice(0,30)}»`))

console.log(`\n${'━'.repeat(76)}\n  SIN MATCH — los 15 más caros (a revisar a mano)\n${'━'.repeat(76)}`)
sinM.sort((a,b)=>b.costo-a.costo).slice(0,15).forEach(r=>
  console.log(`  ${r.fecha.toLocaleDateString('es-AR').padEnd(11)} ${(r.ag||'—').slice(0,14).padEnd(16)} ${r.nom.slice(0,34).padEnd(36)} ${money(r.costo).padStart(12)}`))

if(!ESCRIBIR){ console.log(`\n  PREVIEW — no se escribió nada. Con --escribir carga los ${conM.length} que matchearon.`) }
else{
  const data=conM.map(r=>({range:`HISTORICO_2025!AF${r.fila}`,values:[[r.match.e.dias]]}))
  for(let i=0;i<data.length;i+=400)
    await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data:data.slice(i,i+400)}})
  console.log(`\n  ✓ Escritos ${data.length} valores en HISTORICO_2025!AF`)
}
