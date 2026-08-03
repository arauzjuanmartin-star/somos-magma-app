/**
 * ¿Cuadra cada proyecto por dentro?
 * Total del cliente = costo de los pedidos + Fee Agencia + Ganancias + IIBB + Ajuste
 * Los que no cuadran tienen mal cargado algo, y hacen que cualquier análisis de
 * margen por proyecto sea poco confiable.
 *   node scripts/auditar-proyectos.mjs [--lista]
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const LISTA=process.argv.includes('--lista')
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const PRO=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS!A:CI',valueRenderOption:'FORMATTED_VALUE'})).data.values||[]
const H=PRO[0]
const iTot=H.findIndex(x=>txt(x)==='Total'), iFee=H.indexOf('Fee Agencia')
const iGan=H.indexOf('Imp. Ganancias'), iIIBB=H.indexOf('IIBB'), iAju=H.indexOf('Ajuste')
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]

const p={}
PRO.slice(1).forEach(r=>{const f=fecha(r[3]);if(!f||f.getFullYear()!==2026)return
  const n=txt(r[2]);if(!n)return
  const x=p[n]||={nro:n,ag:txt(r[4]),nombre:txt(r[6]),total:0,fee:0,gan:0,iibb:0,aju:0,costo:0,comision:0,sinStaff:0,pedidos:0}
  x.total=Math.max(x.total,num(r[iTot])); x.fee=Math.max(x.fee,num(r[iFee]))
  x.gan=Math.max(x.gan,num(r[iGan])); x.iibb=Math.max(x.iibb,num(r[iIIBB])); x.aju=num(r[iAju])||x.aju
  PED.forEach(c=>{const et=txt(r[c]),v=num(r[c+1]),pe=txt(r[c+2]); if(!et||v<=1)return
    x.pedidos++; if(!pe)x.sinStaff++
    if(/comision/i.test(et)) x.comision+=v; else x.costo+=v })})
const ps=Object.values(p).filter(x=>x.total>0)
ps.forEach(x=>{ x.suma=x.costo+x.comision+x.fee+x.gan+x.iibb+x.aju; x.dif=x.suma-x.total })

const cuadran=ps.filter(x=>Math.abs(x.dif)<2), fallan=ps.filter(x=>Math.abs(x.dif)>=2)
console.log(`\n${'█'.repeat(80)}\n  AUDITORÍA DE PROYECTOS 2026 — ¿cuadra cada uno por dentro?\n${'█'.repeat(80)}`)
console.log(`\n  Regla: Total = costo de los pedidos + Fee Agencia + Ganancias + IIBB + Ajuste\n`)
console.log(`  \x1b[32m✓ cuadran   ${String(cuadran.length).padStart(4)} de ${ps.length}   (${(cuadran.length/ps.length*100).toFixed(0)}%)\x1b[0m`)
console.log(`  \x1b[31m✗ no cuadran ${String(fallan.length).padStart(3)} de ${ps.length}   (${(fallan.length/ps.length*100).toFixed(0)}%)  ·  descuadre total ${M(fallan.reduce((a,x)=>a+x.dif,0))}\x1b[0m`)

const causa=x=>{
  if(x.total<10000)                              return 'Total en cero o simbólico'
  if(x.comision>0)                               return 'Tiene líneas "Comisión"'
  if(x.pedidos===0)                              return 'Sin pedidos cargados'
  if(x.sinStaff===x.pedidos)                     return 'Ningún pedido tiene staff'
  if(Math.abs(Math.abs(x.dif)-x.costo)<2)        return 'El costo está duplicado o falta entero'
  return 'Otro — revisar a mano'
}
const porCausa={}
fallan.forEach(x=>{const c=causa(x); (porCausa[c]=porCausa[c]||{n:0,v:0,ps:[]}); porCausa[c].n++; porCausa[c].v+=Math.abs(x.dif); porCausa[c].ps.push(x)})
console.log(`\n\x1b[1m■ POR QUÉ NO CUADRAN\x1b[0m\n`)
Object.entries(porCausa).sort((a,b)=>b[1].n-a[1].n).forEach(([c,d])=>
  console.log(`  ${c.padEnd(38)}${String(d.n).padStart(4)} proyectos   ${M(d.v).padStart(15)} de descuadre`))

console.log(`\n\x1b[1m■ LOS 12 DESCUADRES MÁS GRANDES\x1b[0m\n`)
console.log(`  ${'n°'.padEnd(7)}${'agencia'.padEnd(18)}${'proyecto'.padEnd(30)}${'total'.padStart(14)}${'suma partes'.padStart(15)}${'descuadre'.padStart(14)}`)
fallan.sort((a,b)=>Math.abs(b.dif)-Math.abs(a.dif)).slice(0,12).forEach(x=>
  console.log(`  ${x.nro.padEnd(7)}${x.ag.slice(0,16).padEnd(18)}${x.nombre.slice(0,28).padEnd(30)}${M(x.total).padStart(14)}${M(x.suma).padStart(15)}${M(x.dif).padStart(14)}`))

if(LISTA){
  console.log(`\n\x1b[1m■ TODOS LOS QUE NO CUADRAN\x1b[0m\n`)
  Object.entries(porCausa).forEach(([c,d])=>{
    console.log(`\n  \x1b[36m${c}\x1b[0m (${d.n})`)
    d.ps.sort((a,b)=>Math.abs(b.dif)-Math.abs(a.dif)).forEach(x=>
      console.log(`     #${x.nro.padEnd(7)}${x.ag.slice(0,16).padEnd(18)}${x.nombre.slice(0,30).padEnd(32)}${M(x.dif).padStart(14)}`))})
}
console.log(`\n  Mientras estos ${fallan.length} no se arreglen, cualquier margen por proyecto es aproximado.\n`)
