/**
 * Muestra el staff de los proyectos 2025 que estamos revisando:
 *  (a) los 17 multi-día que confirmó Juan
 *  (b) los sin match más caros — por si la fecha cargada tapa un evento de varios días
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
const CAL='/private/tmp/claude-501/-Users-dronjuan-somos-magma-app/ecd947ac-0d54-475a-815e-ef8ee6b06411/scratchpad/cal/todos.jsonl'
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9\s]/g,' ').replace(/\s+/g,' ').trim().toLowerCase()
const dkey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

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
    st,costo:st.reduce((s,x)=>s+x.precio,0)})
})

// Los 17 que confirmó Juan (por fecha + nombre)
const OBJETIVO=[
 ['12/3/2025','Ivecco Expo Agro'],['27/3/2025','Evento Traumatologos'],['4/4/2025','Timelapse Pascua'],
 ['8/8/2025','Bagó Universo Sofitel Cardales'],['7/8/2025','Iveco Cordoba'],['1/5/2025','Roca Room'],
 ['19/6/2025','Roca Room'],['18/1/2025','Leo Leiva'],['26/3/2025','Santander Equality CiB (Hyat)'],
 ['30/10/2025','Axion Ostara'],['15/10/2025','Stand Roemmers La Rural'],['29/11/2025','Comafi Fin de año'],
 ['8/9/2025','AOG (LA RURAL) IVECO'],['10/12/2025','Latam - Madero Walk'],['8/12/2025','Locución Video Latam'],
 ['8/12/2025','Edición Video Latam'],['26/3/2025','Santander'],
]
console.log(`\n${'█'.repeat(78)}\n  (a) LOS 17 — staff real de cada uno\n${'█'.repeat(78)}`)
OBJETIVO.forEach(([fe,nom])=>{
  const p=proys.find(x=>x.fecha.toLocaleDateString('es-AR')===fe && x.nom===nom)
  if(!p){ console.log(`\n  ⚠ NO ENCONTRADO: ${fe} ${nom}`); return }
  console.log(`\n  ${fe.padEnd(11)} ${p.nom}   [fila ${p.fila}]  ${money(p.costo)}`)
  p.st.forEach(s=>console.log(`      ${money(s.precio).padStart(12)}  ${s.pers}`))
})

// Sin match, los más caros — con los eventos del Calendar cerca de esa fecha
const ev=readFileSync(CAL,'utf8').trim().split('\n').map(l=>JSON.parse(l)).map(e=>{
  const allday=e.ini.length===10||/T00:00:00Z$/.test(e.ini)
  const di=new Date(e.ini), df=new Date(e.fin||e.ini)
  const dias=allday?Math.max(1,Math.round((df-di)/86400000)):1
  return {s:e.s,n:norm(e.s),ini:dkey(di),dias}
})
const STOP=new Set(['de','del','la','el','los','las','y','en','con','para','por','a','video','fotos','foto'])
const pal=s=>s.split(' ').filter(w=>w.length>2&&!STOP.has(w))
const score=(a,b)=>{const A=pal(a),B=new Set(pal(b)); return A.length?A.filter(w=>B.has(w)).length/A.length:0}
const sinM=proys.filter(p=>!ev.some(e=>{
  const dd=Math.round((new Date(e.ini)-p.fecha)/86400000)
  return dd>=-2&&dd<=6&&Math.max(score(p.n,e.n),score(e.n,p.n))>=0.5
}))
console.log(`\n\n${'█'.repeat(78)}\n  (b) SIN MATCH — top 22 por plata, con qué había en el Calendar esos días\n${'█'.repeat(78)}`)
sinM.sort((a,b)=>b.costo-a.costo).slice(0,22).forEach(p=>{
  console.log(`\n  ${p.fecha.toLocaleDateString('es-AR').padEnd(11)} ${p.nom}  ·  ${p.ag}  ·  ${money(p.costo)}  [fila ${p.fila}]`)
  p.st.forEach(s=>console.log(`      ${money(s.precio).padStart(12)}  ${s.pers}`))
  const cerca=ev.filter(e=>{const dd=Math.round((new Date(e.ini)-p.fecha)/86400000); return dd>=-3&&dd<=7})
  if(cerca.length) console.log(`      calendar esos días: ${cerca.map(e=>`«${e.s.slice(0,26)}»${e.dias>1?' ('+e.dias+'d)':''}`).join('  ')}`)
  else console.log(`      calendar: (nada cerca)`)
})
console.log(`\n  Total sin match: ${sinM.length} · ${money(sinM.reduce((s,p)=>s+p.costo,0))}`)
