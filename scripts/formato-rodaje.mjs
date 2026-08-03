import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const norm=p=>{const s=txt(p).replace(/[^\p{L}\p{N}\s½/+-]/gu,'').trim().toLowerCase()
  if(!s)return null
  if(/^(viaticos|comision|otros|servicio)/.test(s))return null
  if(/edit/.test(s))return 'Edición'
  if(/12hs/.test(s))return 'completa'
  if(/(foto|video|film|fotos)\s*(½|1\/2)/.test(s))return 'media'
  if(/(foto|video|film|fotos)\s*1?$/.test(s))return 'completa'
  return 'otro'}
const PRO=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS!A:CI',valueRenderOption:'FORMATTED_VALUE'})).data.values||[]
const iTot=PRO[0].findIndex(x=>txt(x)==='Total')
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const proy={}
PRO.slice(1).forEach(r=>{const f=fecha(r[3]);if(!f||f.getFullYear()!==2026)return
  const n=txt(r[2]);if(!n)return
  const p=proy[n]||={total:0,media:0,comp:0,edic:0,ag:txt(r[4])}
  p.total=Math.max(p.total,num(r[iTot]))
  PED.forEach(c=>{const v=norm(r[c]);if(v==='media')p.media++;else if(v==='completa')p.comp++;else if(v==='Edición')p.edic++})})
const ps=Object.values(proy).filter(p=>p.total>0&&(p.media||p.comp))

console.log('\n\x1b[1m■ FORMATO DE RODAJE — qué vendés realmente (2026)\x1b[0m\n')
const fmtK=p=>{
  if(p.media&&p.comp) return `mixto (${p.comp} completa + ${p.media} media)`
  const n=p.media||p.comp, tipo=p.media?'media jornada':'jornada completa'
  return `${n} ${n===1?'persona':'personas'} × ${tipo}`
}
const g={}
ps.forEach(p=>{const k=fmtK(p);(g[k]=g[k]||{n:0,v:0,ed:0}); g[k].n++; g[k].v+=p.total; g[k].ed+=p.edic})
const tot=ps.reduce((a,p)=>a+p.total,0)
console.log(`  ${'formato'.padEnd(34)}${'proy'.padStart(6)}${'%'.padStart(6)}${'facturado'.padStart(16)}${'%'.padStart(7)}${'TICKET'.padStart(15)}`)
Object.entries(g).sort((a,b)=>b[1].v-a[1].v).forEach(([k,d])=>{
  if(d.n<2&&d.v<5e6)return
  console.log(`  ${k.padEnd(34)}${String(d.n).padStart(6)}${(d.n/ps.length*100).toFixed(0).padStart(5)}%${M(d.v).padStart(16)}${(d.v/tot*100).toFixed(0).padStart(6)}%${M(d.v/d.n).padStart(15)}`)})

console.log('\n\x1b[1m■ LO MISMO, SIMPLIFICADO: media vs completa\x1b[0m\n')
const simple={}
ps.forEach(p=>{const k=p.media&&p.comp?'mixto':(p.media?'media jornada':'jornada completa')
  ;(simple[k]=simple[k]||{n:0,v:0,pers:0}); simple[k].n++; simple[k].v+=p.total; simple[k].pers+=(p.media+p.comp)})
console.log(`  ${'tipo'.padEnd(20)}${'proy'.padStart(6)}${'%'.padStart(6)}${'facturado'.padStart(16)}${'TICKET'.padStart(15)}${'pers/proy'.padStart(11)}`)
Object.entries(simple).sort((a,b)=>b[1].v-a[1].v).forEach(([k,d])=>
  console.log(`  ${k.padEnd(20)}${String(d.n).padStart(6)}${(d.n/ps.length*100).toFixed(0).padStart(5)}%${M(d.v).padStart(16)}${M(d.v/d.n).padStart(15)}${(d.pers/d.n).toFixed(1).padStart(11)}`))

console.log('\n\x1b[1m■ EL PRECIO POR PERSONA-JORNADA (lo que hay que mirar para vender)\x1b[0m\n')
;[['1 persona × media jornada',p=>p.media===1&&!p.comp],['2 personas × media jornada',p=>p.media===2&&!p.comp],
  ['1 persona × jornada completa',p=>p.comp===1&&!p.media],['2 personas × jornada completa',p=>p.comp===2&&!p.media]].forEach(([lbl,f])=>{
  const s=ps.filter(f); if(!s.length)return
  const v=s.reduce((a,p)=>a+p.total,0), unidades=s.reduce((a,p)=>a+p.media*0.5+p.comp,0)
  console.log(`  ${lbl.padEnd(32)}${String(s.length).padStart(4)} proy ${M(v).padStart(15)}  ticket ${M(v/s.length).padStart(13)}  →  ${M(v/unidades)} por jornada entera`)})
