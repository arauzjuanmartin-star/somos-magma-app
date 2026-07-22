import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ERR=/^#(ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)/
const txt=v=>{const s=String(v??'').trim();return ERR.test(s)?'':s}
const nrm=v=>txt(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
const num=v=>{const s=txt(v).replace(/\s/g,'');if(!s)return 0;const neg=/^-/.test(s);const n=parseFloat(s.replace(/[^\d.]/g,''))||0;return neg?-n:n}
const fecha=v=>{const m=txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;const d=new Date(y,+m[2]-1,+m[1]);return isNaN(d)?null:d}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')

const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS'],valueRenderOption:'FORMATTED_VALUE'})
const PRO=r.data.valueRanges[0].values||[]

// ---- CHURN: ¿estos clientes de Mariana aparecen en 2026? ----
console.log('\n═══ VERIFICACIÓN CHURN — ¿aparecen en PROYECTOS 2026? ═══\n')
const listaMar=['Azcuy','Grupo Roca','Lucas Vignale','Green Deco','Buro','We Corp','La Gata','Team Tulaga','Creators Lab','ABV','Almarena','Martin Mosquera','Naty Dalzotto','Lau Castro','Mujer Financiera']
const proy2026=PRO.slice(1).filter(row=>{const f=fecha(row[3]);return txt(row[2])&&f&&f.getFullYear()===2026})
listaMar.forEach(cli=>{
  const hits=proy2026.filter(row=>nrm(row[4]).includes(nrm(cli))||nrm(row[5]).includes(nrm(cli)))
  const monto=hits.reduce((s,row)=>s+num(row[7]),0)
  const ult=hits.map(row=>fecha(row[3])).filter(Boolean).sort((a,b)=>b-a)[0]
  console.log(`   ${cli.padEnd(18)} ${hits.length===0?'❌ NO volvió en 2026 (confirma churn)':`✓ ${hits.length} proy en 2026 · ${money(monto)}${ult?' · últ '+ult.toLocaleDateString('es-AR'):''}`}`)
})

// ---- TICKET afinado: sacando el ruido ----
console.log('\n\n═══ TICKET PROMEDIO — con y sin ruido ═══\n')
const todos=proy2026.map(row=>({m:num(row[7]),ped:[11,14,17,20,23,26,29,32,35,38].filter(c=>txt(row[c])).length})).filter(x=>x.m>0)
const stat=(arr,lbl)=>{const s=arr.map(x=>x.m).sort((a,b)=>a-b);const sum=s.reduce((a,b)=>a+b,0)
  console.log(`   ${lbl}`)
  console.log(`      n=${s.length} · total ${money(sum)} · PROMEDIO ${money(sum/s.length)} · MEDIANA ${money(s[Math.floor(s.length/2)])}`)}
stat(todos,'TODOS los proyectos 2026')
stat(todos.filter(x=>x.m>=50000),'sacando los de $1 y menores a $50k (el truco del fee agencia)')
// separar "eventos" (tienen foto/video/film) de "solo edición/servicio suelto"
const esEvento=row=>[11,14,17,20,23,26].some(c=>/foto|video|film/i.test(txt(row[c])))
const eventos=proy2026.filter(esEvento).map(row=>({m:num(row[7])})).filter(x=>x.m>0)
const soloEdit=proy2026.filter(row=>!esEvento(row)).map(row=>({m:num(row[7])})).filter(x=>x.m>0)
stat(eventos,'solo EVENTOS (con cobertura foto/video/film)')
stat(soloEdit,'solo ediciones/servicios sueltos (sin cobertura)')

console.log('\n   → Para "cuántos proyectos por semana" conviene separar: un evento no es lo mismo que una edición suelta.')
