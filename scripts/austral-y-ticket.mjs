/**
 * Dos análisis que pidió Juan:
 *   1. AUSTRAL: cuántas media jornada / jornada completa / ediciones, y su ticket
 *   2. TICKET PROMEDIO de Magma separando Austral del resto, y qué servicio sale más
 * Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ERR=/^#(ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)/
const txt=v=>{const s=String(v??'').trim();return ERR.test(s)?'':s}
const nrm=v=>txt(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
const num=v=>{const s=txt(v).replace(/\s/g,'');if(!s)return 0;return parseFloat(s.replace(/[^\d.]/g,''))||0}
const fecha=v=>{const m=txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const med=a=>{const s=[...a].sort((x,y)=>x-y);const m=Math.floor(s.length/2);return s.length?(s.length%2?s[m]:(s[m-1]+s[m])/2):0}

const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS',valueRenderOption:'FORMATTED_VALUE'})
const PRO=r.data.values||[]
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const p26=PRO.slice(1).filter(x=>{const f=fecha(x[3]);return txt(x[2])&&f&&f.getFullYear()===2026})

// clasificar cada proyecto por sus pedidos
const clasif=row=>{
  const peds=PED.map(c=>nrm(row[c])).filter(Boolean)
  const tiene=re=>peds.some(p=>re.test(p))
  const cuenta=re=>peds.filter(p=>re.test(p)).length
  const media=cuenta(/1\/2|½|1\/2/)
  const persENT=cuenta(/foto 1\b|video 1\b|film 1\b/)   // "1" entero = jornada completa/persona entera
  const ediciones=cuenta(/edic|edit/)
  const tieneCobertura=tiene(/foto|video|film/)
  const soloEdicion=ediciones>0 && !tieneCobertura
  return {peds, media, persENT, ediciones, tieneCobertura, soloEdicion,
    personas:PED.filter((c,k)=>nrm(row[c])&&!/edic|viatic|produ|otros/i.test(nrm(row[c]))).length}
}

// ============ 1. AUSTRAL ============
const austral=p26.filter(x=>/austral/i.test(txt(x[4]))||/austral/i.test(txt(x[5])))
console.log(`\n${'█'.repeat(66)}\n  AUSTRAL — ${austral.length} proyectos en 2026\n${'█'.repeat(66)}`)
let mj=0, jc=0, edi=0, soloEd=0, conCob=0
const tickets=[]
austral.forEach(x=>{ const c=clasif(x); tickets.push(num(x[7]))
  mj+=c.media; jc+=c.persENT; edi+=c.ediciones
  if(c.soloEdicion)soloEd++; if(c.tieneCobertura)conCob++
})
console.log(`\n  DESGLOSE DE SERVICIOS (sumando todos los pedidos):`)
console.log(`     Media jornada (½):        ${mj}`)
console.log(`     Persona/jornada entera:   ${jc}`)
console.log(`     Ediciones:                ${edi}`)
console.log(`\n  TIPO DE PROYECTO:`)
console.log(`     con cobertura (evento):   ${conCob}`)
console.log(`     solo edición:             ${soloEd}`)
console.log(`\n  TICKET AUSTRAL:`)
console.log(`     ${austral.length} proyectos · total ${money(tickets.reduce((s,t)=>s+t,0))}`)
console.log(`     promedio ${money(tickets.reduce((s,t)=>s+t,0)/tickets.length)} · mediana ${money(med(tickets))}`)
console.log(`     más chico ${money(Math.min(...tickets))} · más grande ${money(Math.max(...tickets))}`)
// margen Austral
const factA=austral.reduce((s,x)=>s+num(x[7]),0)
const costA=austral.reduce((s,x)=>s+[12,15,18,21,24,27,30,33,36,39,42,45,48,61,64,67,70,73,76,79,82].reduce((a,c)=>a+num(x[c]),0),0)
console.log(`\n  MARGEN AUSTRAL: ${Math.round((factA-costA)/factA*100)}% (facturado ${money(factA)} · staff ${money(costA)})`)

// ============ 2. TICKET: Austral vs resto ============
console.log(`\n\n${'█'.repeat(66)}\n  TICKET PROMEDIO — Austral vs el resto\n${'█'.repeat(66)}\n`)
const esAustral=x=>/austral/i.test(txt(x[4]))||/austral/i.test(txt(x[5]))
const stat=(arr,lbl)=>{const t=arr.map(x=>num(x[7])).filter(v=>v>0)
  console.log(`  ${lbl.padEnd(34)} n=${String(t.length).padStart(3)} · prom ${money(t.reduce((s,v)=>s+v,0)/t.length).padStart(13)} · mediana ${money(med(t)).padStart(12)}`)}
stat(p26,'TODOS los proyectos')
stat(p26.filter(esAustral),'  Austral')
stat(p26.filter(x=>!esAustral(x)),'  Sin Austral')
const evento=x=>clasif(x).tieneCobertura
stat(p26.filter(x=>evento(x)&&!esAustral(x)),'  Eventos sin Austral')
stat(p26.filter(x=>!evento(x)),'  Solo ediciones/sueltos')

// ============ 3. QUÉ SALE MÁS ============
console.log(`\n\n${'█'.repeat(66)}\n  QUÉ COMBO SALE MÁS (2026, todos)\n${'█'.repeat(66)}\n`)
const svcCat=s=>{const t=nrm(s).replace(/[^a-z0-9 /½]/g,'')
  if(/^foto/.test(t))return /1\/2|½/.test(t)?'Foto ½':'Foto 1'
  if(/^video/.test(t))return /1\/2|½/.test(t)?'Video ½':'Video 1'
  if(/^film/.test(t))return /1\/2|½/.test(t)?'Film ½':'Film 1'
  if(/edic|edit/.test(t))return 'Edición'; if(!t)return null; return null}
const arq={}
p26.forEach(x=>{const cats=[...new Set(PED.map(c=>svcCat(x[c])).filter(Boolean))].sort();if(!cats.length)return
  const k=cats.join(' + ');arq[k]=arq[k]||{n:0,total:0};arq[k].n++;arq[k].total+=num(x[7])})
console.log(`  ${'COMBO'.padEnd(34)}${'VECES'.padStart(6)}${'TICKET PROM'.padStart(14)}`)
Object.entries(arq).sort((a,b)=>b[1].n-a[1].n).slice(0,10).forEach(([k,d])=>
  console.log(`  ${k.slice(0,33).padEnd(34)}${String(d.n).padStart(6)}${money(d.total/d.n).padStart(14)}`))
