/**
 * PRACTICA 3 — sección B: "priorizar clientes que paguen corto, aunque el margen
 * sea menor". Para poder priorizar hay que SABER quién paga corto.
 *
 * Mide, por agencia/cliente, los días entre la FECHA DEL EVENTO y la FECHA DE COBRO
 * (es el ciclo que Magma financia). Cruza con el margen real de PROYECTOS para ver
 * el trade-off: quién paga rápido, quién deja más, y quién hace las dos cosas.
 * Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;const d=new Date(y,+m[2]-1,+m[1]);return isNaN(d)?null:d}
const HOY=new Date(2026,7,12)

const [F,P] = await Promise.all([
  sheets.spreadsheets.values.get({spreadsheetId:ID,range:'FACTURACION',valueRenderOption:'FORMATTED_VALUE'}),
  sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS',valueRenderOption:'FORMATTED_VALUE'}),
])
const FAC=F.data.values, PRO=P.data.values, HP=PRO[0]
const iTot=HP.findIndex(x=>txt(x)==='Total'), iAg=HP.indexOf('Agencia')
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]

// margen real por agencia (PROYECTOS 2026)
const margenAg={}
PRO.slice(1).forEach(r=>{
  const f=fecha(r[3]); if(!f||f.getFullYear()!==2026)return
  const ag=txt(r[iAg])||txt(r[iAg+1])||'(sin agencia)'
  const total=num(r[iTot])
  let costo=0
  PED.forEach(c=>{const p=txt(r[c]); if(!p)return; const v=num(r[c+1]); const pers=txt(r[c+2])
    if(v<=1)return; if(!/somos magma/i.test(pers)) costo+=v })
  margenAg[ag]=margenAg[ag]||{fact:0,costo:0}
  margenAg[ag].fact+=total; margenAg[ag].costo+=costo
})

// días de cobro por agencia (FACTURACION 2026)
const ag={}
let sinFechaCobro=0
FAC.slice(1).forEach(r=>{
  const fev=fecha(r[6]); if(!fev||fev.getFullYear()!==2026)return
  const nombre=txt(r[7])||txt(r[8])||'(sin agencia)'
  const monto=num(r[10])||num(r[12])
  if(!monto)return
  const cobrado=/true|sí|si|x/i.test(txt(r[4]))
  const fcob=fecha(r[5])
  ag[nombre]=ag[nombre]||{n:0,fact:0,dias:[],cobrado:0,pendiente:0,pendDias:[],falsos:0}
  ag[nombre].n++; ag[nombre].fact+=monto
  // OJO: 90 de 124 filas cobradas de 2026 tienen Fecha cobro IDÉNTICA a Fecha Evento.
  // Eso no es un cobro el mismo día: es el marcado masivo viejo (pre-app), que copió
  // la fecha del evento. Esas filas NO miden nada — se descartan.
  if(cobrado && fcob && txt(r[5])!==txt(r[6])){
    const d=Math.round((fcob-fev)/86400000)
    if(d>=-30 && d<400){ ag[nombre].dias.push(d); ag[nombre].cobrado+=monto }
  } else if(cobrado && fcob){
    ag[nombre].falsos=(ag[nombre].falsos||0)+1
  } else if(!cobrado){
    ag[nombre].pendiente+=monto
    ag[nombre].pendDias.push(Math.round((HOY-fev)/86400000))
    if(!fcob) sinFechaCobro++
  }
})

const med=a=>{if(!a.length)return null;const o=[...a].sort((x,y)=>x-y);return o[Math.floor(o.length/2)]}
const lista=Object.entries(ag).filter(([,v])=>v.fact>1_000_000).map(([k,v])=>{
  const m=margenAg[k]
  return {
    nombre:k, n:v.n, fact:v.fact,
    dias:med(v.dias), muestras:v.dias.length, falsos:v.falsos||0,
    pendiente:v.pendiente, pendDias:med(v.pendDias),
    margen: m && m.fact ? 1-m.costo/m.fact : null,
  }
}).sort((a,b)=>b.fact-a.fact)

console.log('\n████ QUIÉN PAGA CORTO — 2026 (facturación > $1M) ████')
console.log('  Días = mediana entre la fecha del evento y la fecha de cobro real.\n')
console.log('  AGENCIA / CLIENTE                 facturado 2026   fact.  días  muestras   margen     POR COBRAR  antigüedad')
console.log('  ' + '─'.repeat(108))
for(const x of lista){
  console.log(`  ${x.nombre.slice(0,32).padEnd(33)}${M(x.fact).padStart(14)} ${String(x.n).padStart(5)}  ${(x.dias===null?'—':String(x.dias)).padStart(4)}  ${String(x.muestras).padStart(8)}   ${(x.margen===null?'—':(x.margen*100).toFixed(0)+'%').padStart(6)}  ${(x.pendiente?M(x.pendiente):'—').padStart(13)}  ${(x.pendDias!==null&&x.pendiente?x.pendDias+'d':'').padStart(9)}`)
}

const conDias=lista.filter(x=>x.dias!==null&&x.muestras>=2)
const total=conDias.reduce((s,x)=>s+x.fact,0)
const promPond=conDias.reduce((s,x)=>s+x.dias*x.fact,0)/total
console.log(`\n  Mediana ponderada del sistema: ${promPond.toFixed(0)} días desde el evento hasta cobrar.`)

console.log('\n████ EL CUADRANTE — paga corto vs. deja margen ████')
const corte = med(conDias.map(x=>x.dias))
const margenes = conDias.filter(x=>x.margen!==null).map(x=>x.margen)
const corteM = med(margenes)
console.log(`  Corte: ${corte} días · ${(corteM*100).toFixed(0)}% de margen\n`)
const cuad = { 'A · PAGA CORTO + BUEN MARGEN — empujar':[], 'B · paga corto, margen bajo — sirve para caja':[], 'C · paga largo, buen margen — negociar plazo':[], 'D · paga largo + margen bajo — revisar o soltar':[] }
for(const x of conDias){
  if(x.margen===null) continue
  const corto=x.dias<=corte, bueno=x.margen>=corteM
  const k = corto&&bueno ? 'A · PAGA CORTO + BUEN MARGEN — empujar'
        : corto ? 'B · paga corto, margen bajo — sirve para caja'
        : bueno ? 'C · paga largo, buen margen — negociar plazo'
        : 'D · paga largo + margen bajo — revisar o soltar'
  cuad[k].push(x)
}
for(const [k,v] of Object.entries(cuad)){
  const f=v.reduce((s,x)=>s+x.fact,0)
  console.log(`  ▸ ${k}  —  ${M(f)}`)
  v.sort((a,b)=>b.fact-a.fact).forEach(x=>console.log(`       ${x.nombre.slice(0,30).padEnd(31)} ${M(x.fact).padStart(13)}  ${String(x.dias).padStart(3)}d  ${(x.margen*100).toFixed(0)}%`))
  console.log('')
}
