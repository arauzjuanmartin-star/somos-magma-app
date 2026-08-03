/**
 * 80/20 POR SERVICIO — punto B de la Práctica 2 de Mariana:
 * "cuál es el servicio que compone el 80/20 de la facturación — los que más se venden y más dejan".
 *
 * OJO METODOLÓGICO: el sheet NO guarda un precio de venta por servicio. Cada línea de PROYECTOS
 * tiene el COSTO del operador, y el margen de Magma ("Fee Agencia" + "Diferencia") se aplica al
 * PROYECTO ENTERO, no línea por línea. Para poder responder por servicio, acá el margen de cada
 * proyecto se PRORRATEA entre sus líneas en proporción al peso de cada una.
 * Las líneas con staff "Somos Magma" son margen puro (no hay costo externo).
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
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
function norm(p){const s=txt(p).toLowerCase().replace(/[^\wáéíóúñ\s½]/g,'').trim()
  if(/edit|edici/.test(s))return 'Edición'
  if(/motion|anim/.test(s))return 'Motion'
  if(/foto/.test(s))return /1\/2|½|medi/.test(s)?'Foto ½':'Foto 1'
  if(/video/.test(s))return /1\/2|½|medi/.test(s)?'Video ½':'Video 1'
  if(/film/.test(s))return /1\/2|½|medi/.test(s)?'Film ½':'Film 1'
  if(/drone|fpv/.test(s))return 'Drone/FPV'
  if(/asist/.test(s))return 'Asistente'
  if(/produ/.test(s))return 'Producción'
  if(/vivo|stream/.test(s))return 'Vivo'
  if(/sonid|audio/.test(s))return 'Sonido'
  if(/viatic/.test(s))return 'Viáticos'
  if(/rental|alquil/.test(s))return 'Rental'
  if(/comision/.test(s))return 'Comisión'
  if(/makeup|maquilla/.test(s))return 'MakeUp'
  if(/crudo/.test(s))return 'Crudos'
  return txt(p).slice(0,16)||'(otros)'
}
const R=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS',valueRenderOption:'FORMATTED_VALUE'})
const PRO=R.data.values
const H=PRO[0]
const iTot=H.findIndex(x=>txt(x)==='Total'), iFee=H.indexOf('Fee Agencia'), iDif=H.indexOf('Diferencia')
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]

const S={}   // servicio -> {veces, costo, margen, venta}
let nProy=0, totalFacturado=0, margenGlobal=0
PRO.slice(1).forEach(r=>{
  const f=fecha(r[3]); if(!f||f.getFullYear()!==2026)return
  nProy++
  const total=num(r[iTot]); totalFacturado+=total
  const margenProy=num(r[iFee])+num(r[iDif])       // el fee global del proyecto
  const lineas=[]
  PED.forEach(c=>{const p=txt(r[c]); if(!p)return; const v=num(r[c+1]); const pers=txt(r[c+2])
    if(v<=1)return
    lineas.push({k:norm(p), v, magma:/somos magma/i.test(pers)})})
  if(!lineas.length)return
  const pesoTotal=lineas.reduce((s,l)=>s+l.v,0)
  let margenExtra=margenProy
  lineas.forEach(l=>{ if(l.magma) margenExtra+=l.v })   // "Somos Magma" = margen puro
  margenGlobal+=margenExtra
  lineas.forEach(l=>{
    const o=S[l.k]=S[l.k]||{n:0,costo:0,margen:0}
    o.n++
    const prorrateo = pesoTotal>0 ? margenExtra*(l.v/pesoTotal) : 0
    if(l.magma){ o.margen+=prorrateo }               // no suma costo
    else { o.costo+=l.v; o.margen+=prorrateo }
  })
})
const filas=Object.entries(S).map(([k,o])=>({k,...o,venta:o.costo+o.margen,
  pct:(o.costo+o.margen)>0?o.margen/(o.costo+o.margen)*100:0}))
const totV=filas.reduce((s,f)=>s+f.venta,0), totC=filas.reduce((s,f)=>s+f.costo,0), totM=filas.reduce((s,f)=>s+f.margen,0)

console.log(`\n${'█'.repeat(82)}\n  80/20 POR SERVICIO — 2026 (${nProy} proyectos)\n${'█'.repeat(82)}`)
console.log(`  Facturado total ${M(totalFacturado)} · atribuido a servicios ${M(totV)} (el resto son impuestos/IVA)`)
console.log(`  Método: el margen de cada proyecto se prorratea entre sus servicios según el peso de cada línea.\n`)

console.log('  ── LO QUE MÁS SE VENDE ──')
console.log(`  ${'servicio'.padEnd(13)}${'veces'.padStart(7)}${'VENTA atribuida'.padStart(18)}${'% acum'.padStart(9)}`)
let a1=0
filas.slice().sort((x,y)=>y.venta-x.venta).slice(0,10).forEach(f=>{a1+=f.venta
  console.log(`  ${f.k.padEnd(13)}${String(f.n).padStart(7)}${M(f.venta).padStart(18)}${(Math.round(a1/totV*100)+'%').padStart(9)}`)})

console.log('\n  ── LO QUE MÁS DEJA ──')
console.log(`  ${'servicio'.padEnd(13)}${'venta'.padStart(15)}${'costo staff'.padStart(15)}${'DEJA'.padStart(15)}${'margen'.padStart(8)}${'% acum'.padStart(8)}`)
let a2=0
filas.slice().sort((x,y)=>y.margen-x.margen).slice(0,10).forEach(f=>{a2+=f.margen
  console.log(`  ${f.k.padEnd(13)}${M(f.venta).padStart(15)}${M(f.costo).padStart(15)}${M(f.margen).padStart(15)}${(Math.round(f.pct)+'%').padStart(8)}${(Math.round(a2/totM*100)+'%').padStart(8)}`)})
console.log(`  ${'─'.repeat(78)}`)
console.log(`  ${'TOTAL'.padEnd(13)}${M(totV).padStart(15)}${M(totC).padStart(15)}${M(totM).padStart(15)}${(Math.round(totM/totV*100)+'%').padStart(8)}`)

console.log('\n  ── EL NÚCLEO: cuántos servicios explican el 80% ──')
const ord=filas.slice().sort((x,y)=>y.venta-x.venta)
let acc=0, cuantos=0
for(const f of ord){ acc+=f.venta; cuantos++; if(acc/totV>=0.8) break }
console.log(`  ${cuantos} servicios de ${filas.length} explican el 80% de la venta: ${ord.slice(0,cuantos).map(f=>f.k).join(' · ')}`)
