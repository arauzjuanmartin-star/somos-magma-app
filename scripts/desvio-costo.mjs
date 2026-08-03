/**
 * DESVÍO DE COSTO — presupuestado contra lo que realmente se pagó al staff.
 *
 * Criterio de Juan (03/08/2026): "cuando cargo el staff es lo real. Yo puedo
 * presupuestar pero después pagar menos o más."
 *   · presupuestado = columna Subtotal (viene del presupuesto aprobado)
 *   · real          = suma de los Precios de cada pedido, que es lo que se paga
 *
 * OJO: si un proyecto todavía no tiene el staff cargado, su "real" está incompleto.
 * Esos se separan y no ensucian el número.
 *
 *   node scripts/desvio-costo.mjs          → resumen
 *   node scripts/desvio-costo.mjs --lista  → todos los casos
 *   node scripts/desvio-costo.mjs --csv    → CSV para el sheet
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const LISTA=process.argv.includes('--lista'), CSV=process.argv.includes('--csv')
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>(n<0?'−$':'$')+Math.abs(Math.round(n)).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const PRO=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS!A:CI',valueRenderOption:'FORMATTED_VALUE'})).data.values||[]
const H=PRO[0]
const iTot=H.findIndex(x=>txt(x)==='Total'), iSub=H.indexOf('Subtotal')
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]

// Casos revisados con Juan (03/08/2026) que están bien así, aunque el staff
// figure en cero. No son pendientes: no hay nadie esperando cobrar.
const VALIDADOS = {
  '1683':'Austral · el staff va en $0, confirmado',
  '1684':'Austral · el staff va en $0, confirmado',
  '1829':'la edición la hizo la casa (Somos Magma $1)',
  '2913':'se le pagó a Lucho y no se cobra al cliente, cerrado por Juan',
}

const p={}
PRO.slice(1).forEach(r=>{const f=fecha(r[3]);if(!f||f.getFullYear()!==2026)return
  const n=txt(r[2]);if(!n)return
  const x=p[n]||={nro:n,fecha:txt(r[3]),ag:txt(r[4]),nombre:txt(r[6]),total:0,sub:0,real:0,propio:0,ped:0,conStaff:0}
  x.total=Math.max(x.total,num(r[iTot])); x.sub=Math.max(x.sub,num(r[iSub]))
  PED.forEach(c=>{const et=txt(r[c]),v=num(r[c+1]),pe=txt(r[c+2]); if(!et||v<=1)return
    x.ped++; if(pe)x.conStaff++
    if(/somos magma/i.test(pe)) x.propio+=v; else x.real+=v })})
const ps=Object.values(p).filter(x=>x.total>0)
ps.forEach(x=>{ x.costoReal=x.real+x.propio; x.desvio=x.costoReal-x.sub
  x.nota = VALIDADOS[x.nro] || ''
  x.estado = x.nota ? 'Revisado — está bien'
    : x.ped===0 ? 'Sin pedidos'
    : (x.conStaff===0 ? 'Staff sin cargar' : (x.conStaff<x.ped ? 'Staff a medio cargar' : 'Staff completo')) })

const validados=ps.filter(x=>x.estado==='Revisado — está bien')
const completos=ps.filter(x=>x.estado==='Staff completo')
const parciales=ps.filter(x=>x.estado==='Staff a medio cargar')
const pendientes=ps.filter(x=>x.estado==='Staff sin cargar'||x.estado==='Sin pedidos')
const conDesvio=completos.filter(x=>Math.abs(x.desvio)>=2)

if(CSV){
  console.log('Estado,N°,Fecha,Agencia,Proyecto,Total,Presupuestado,Pagado real,Desvio,% sobre presupuesto')
  ps.sort((a,b)=>Math.abs(b.desvio)-Math.abs(a.desvio)).forEach(x=>
    console.log(`"${x.estado}",${x.nro},${x.fecha},"${x.ag}","${x.nombre.replace(/"/g,"'")}",${Math.round(x.total)},${Math.round(x.sub)},${Math.round(x.costoReal)},${Math.round(x.desvio)},${x.sub?(x.desvio/x.sub*100).toFixed(0):''}`))
  process.exit(0)
}

const S=(a,k)=>a.reduce((s,x)=>s+x[k],0)
console.log(`\n${'█'.repeat(86)}\n  DESVÍO DE COSTO 2026 — lo presupuestado contra lo que se pagó de verdad\n${'█'.repeat(86)}`)
console.log(`\n  El costo real es el staff cargado en cada pedido. El Subtotal es lo que se presupuestó.\n`)
console.log(`  ${'estado'.padEnd(24)}${'proy'.padStart(5)}${'presupuestado'.padStart(16)}${'pagado real'.padStart(16)}${'desvío'.padStart(15)}`)
console.log(`  ${'─'.repeat(76)}`)
;[['Staff completo',completos],['Staff a medio cargar',parciales],['Falta cargar el staff',pendientes],['Revisado — está bien',validados]].forEach(([l,a])=>{
  if(!a.length)return
  console.log(`  ${l.padEnd(24)}${String(a.length).padStart(5)}${M(S(a,'sub')).padStart(16)}${M(S(a,'costoReal')).padStart(16)}${(/Falta|Revisado/.test(l)?'—':M(S(a,'desvio'))).padStart(15)}`)})
console.log(`  ${'─'.repeat(76)}`)
console.log(`  ${'TOTAL'.padEnd(24)}${String(ps.length).padStart(5)}${M(S(ps,'sub')).padStart(16)}${M(S(ps,'costoReal')).padStart(16)}`)

console.log(`\n\x1b[1m■ EL NÚMERO\x1b[0m`)
const d=S(completos,'desvio')
console.log(`\n  De los ${completos.length} proyectos con el staff cargado entero:`)
console.log(`     presupuestado para staff   ${M(S(completos,'sub')).padStart(16)}`)
console.log(`     pagado de verdad           ${M(S(completos,'costoReal')).padStart(16)}`)
console.log(`     \x1b[1mdesvío                     ${M(d).padStart(16)}   ${d>0?'\x1b[31mse pagó de MÁS\x1b[0m':'\x1b[32mse pagó de MENOS\x1b[0m'}  (${(d/S(completos,'sub')*100).toFixed(1)}%)`)
const mas=conDesvio.filter(x=>x.desvio>0), menos=conDesvio.filter(x=>x.desvio<0)
console.log(`\n  ${conDesvio.length} de esos ${completos.length} tuvieron desvío:`)
console.log(`     ${String(mas.length).padStart(3)} se pagaron de más    ${M(S(mas,'desvio')).padStart(15)}`)
console.log(`     ${String(menos.length).padStart(3)} se pagaron de menos  ${M(S(menos,'desvio')).padStart(15)}`)
if(pendientes.length) console.log(`\n  \x1b[33m${pendientes.length} proyectos todavía no tienen el staff cargado (${M(S(pendientes,'total'))} facturados) — no entran en el desvío.\x1b[0m`)

const ver=(t,a)=>{ console.log(`\n\x1b[1m■ ${t}\x1b[0m\n`)
  console.log(`  ${'n°'.padEnd(7)}${'fecha'.padEnd(11)}${'agencia'.padEnd(18)}${'proyecto'.padEnd(32)}${'presup.'.padStart(13)}${'pagado'.padStart(13)}${'desvío'.padStart(13)}`)
  a.forEach(x=>console.log(`  ${x.nro.padEnd(7)}${x.fecha.padEnd(11)}${x.ag.slice(0,16).padEnd(18)}${x.nombre.slice(0,30).padEnd(32)}${M(x.sub).padStart(13)}${M(x.costoReal).padStart(13)}${M(x.desvio).padStart(13)}`))}
const ord=a=>a.slice().sort((x,y)=>Math.abs(y.desvio)-Math.abs(x.desvio))
if(LISTA){ ver(`LOS ${conDesvio.length} CON DESVÍO`, ord(conDesvio))
  if(pendientes.length) ver(`LOS ${pendientes.length} QUE FALTA CARGAR STAFF`, pendientes.sort((a,b)=>b.total-a.total)) }
else { ver('LOS 15 DESVÍOS MÁS GRANDES', ord(conDesvio).slice(0,15))
  console.log(`\n  (--lista para ver los ${conDesvio.length}, --csv para llevarlo al sheet)`) }
console.log('')
