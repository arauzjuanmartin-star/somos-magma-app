/** Lulú y Tom: cuánto cobran realmente (sueldo+extras) · Ostara desglose · conversión de presus normalizada */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim(), num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const NOM={'Lucía María Grenier Basavilbaso':'Lulú','Tomás Halbach':'Tom','Daniela Viviana Ayala':'Dani'}
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS!A:CI','PRESUPUESTOS!A:CI'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,PRE]=R.data.valueRanges.map(v=>v.values||[])

console.log('════ 1. EXTRAS REALES ene-ago 2026 (líneas de staff en PROYECTOS) ════')
const g={}
PRO.slice(1).forEach(r=>{const f=fecha(r[3]); if(!f||f.getFullYear()!==2026||f.getMonth()>7)return
  PED.forEach(c=>{const ped=txt(r[c]); if(!ped)return; const st=txt(r[c+2]), pr=num(r[c+1]); if(pr<=1)return
    const k=NOM[st]; if(!k)return
    g[k]=g[k]||{n:0,$:0,tipo:{}}; g[k].n++; g[k].$+=pr
    const t=/edici|edit|motion/i.test(ped)?'edición':/asist/i.test(ped)?'asistente':/produc/i.test(ped)?'producción':/foto|video|film|camar/i.test(ped)?'cámara':'otros'
    g[k].tipo[t]=g[k].tipo[t]||{n:0,$:0}; g[k].tipo[t].n++; g[k].tipo[t].$+=pr })})
const SUELDO={'Lulú':1300000,'Tom':1300000,'Dani':1900000}, MONO={'Lulú':447000,'Dani':92000,'Tom':0}
Object.entries(g).forEach(([k,v])=>{const ex=v.$/8
  console.log(`\n${k}: ${v.n} trabajos · ${M(v.$)} en 8 meses = ${M(ex)}/mes de extras`)
  Object.entries(v.tipo).sort((a,b)=>b[1].$-a[1].$).forEach(([t,d])=>console.log('    ',t.padEnd(12),String(d.n).padStart(3),M(d.$)))
  console.log(`    → COBRA ${M(SUELDO[k]+ex)}/mes  ·  LE CUESTA A MAGMA ${M(SUELDO[k]+ex+(MONO[k]||0))}/mes (con monotributo)`)})

console.log('\n════ 2. OSTARA — cómo se divide ════')
const ost={}
PRO.slice(1).forEach(r=>{const f=fecha(r[3]); if(!f||f.getFullYear()!==2026||f.getMonth()>7)return
  if(!/ostara/i.test(txt(r[4])))return
  const cli=txt(r[5])||'(sin cliente final)', pm=txt(r[51])||'—', t=num(r[7])
  let tipo='evento'; const peds=PED.map(c=>txt(r[c])).filter(Boolean).join(' ')
  if(/edici|edit|motion/i.test(peds)&&!/foto|video|film|camar/i.test(peds))tipo='solo edición'
  ost[cli]=ost[cli]||{n:0,$:0,pm:{},ed:0}; ost[cli].n++; ost[cli].$+=t; ost[cli].pm[pm]=(ost[cli].pm[pm]||0)+1
  if(tipo==='solo edición')ost[cli].ed++ })
Object.entries(ost).sort((a,b)=>b[1].$-a[1].$).forEach(([k,v])=>
  console.log(k.slice(0,30).padEnd(31),String(v.n).padStart(3),'proy',M(v.$).padStart(14),' solo-edición:',String(v.ed).padStart(2),' PM:',Object.entries(v.pm).map(([p,c])=>p+' '+c).join(', ')))

console.log('\n════ 3. CONVERSIÓN DE PRESUPUESTOS — cruda vs sin Austral ni ediciones sueltas ════')
const conv={}
PRE.slice(1).forEach(r=>{const f=fecha(r[9])||fecha(r[1]); if(!f||f.getFullYear()!==2026)return
  const pm=txt(r[2])||'—', est=txt(r[3]), ag=txt(r[4]), apr=/aprob/i.test(est)
  const peds=[11,13,15,17,19,21,23,25,27,29,31,33].map(c=>txt(r[c])).filter(Boolean).join(' ')
  const soloEd=/edici|edit|motion/i.test(peds)&&!/foto|video|film|camar/i.test(peds)
  const austral=/austral/i.test(ag)
  conv[pm]=conv[pm]||{n:0,a:0,fn:0,fa:0}
  conv[pm].n++; if(apr)conv[pm].a++
  if(!austral&&!soloEd){conv[pm].fn++; if(apr)conv[pm].fa++} })
console.log('PM'.padEnd(10),'TODOS'.padEnd(18),'SIN AUSTRAL NI EDICIONES SUELTAS')
Object.entries(conv).filter(([k,v])=>v.n>20).sort((a,b)=>b[1].n-a[1].n).forEach(([k,v])=>
  console.log(k.padEnd(10),`${v.a}/${v.n} = ${Math.round(v.a/v.n*100)}%`.padEnd(18),
    v.fn?`${v.fa}/${v.fn} = ${Math.round(v.fa/v.fn*100)}%`:'—'))
