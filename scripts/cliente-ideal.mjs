/**
 * CLIENTE IDEAL — quién deja plata de verdad, con datos.
 *
 * El nicho ya está decidido (agencias y productoras). Lo que falta es cuál.
 * "El que más factura" no es la respuesta: lo que importa es cuánto margen deja
 * por cada jornada de recurso que consume, porque las jornadas son el cuello
 * de botella real (hay ~16 por mes).
 *
 * Por cada cliente mide:
 *   · margen ($ y %) — facturado menos freelancers
 *   · MARGEN POR JORNADA — el número que ordena de verdad
 *   · formato que compra · recurrencia · velocidad de cobro
 *
 * Solo lectura.  node scripts/cliente-ideal.mjs [año]
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ANIO=parseInt(process.argv.find(a=>/^\d{4}$/.test(a)))||2026
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const yes=v=>/^(s[ií]|true|x|✓)$/i.test(txt(v))
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const norm=p=>{const s=txt(p).replace(/[^\p{L}\p{N}\s½/+-]/gu,'').trim().toLowerCase()
  if(!s)return null
  if(/^(viaticos|comision|otros|servicio)/.test(s))return null
  if(/edit/.test(s))return 'edicion'
  if(/12hs/.test(s))return 'completa'
  if(/(foto|video|film|fotos)\s*(½|1\/2)/.test(s))return 'media'
  if(/(foto|video|film|fotos)\s*1?$/.test(s))return 'completa'
  return 'apoyo'}

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS!A:CZ','FACTURACION!A:V'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,FAC]=R.data.valueRanges.map(v=>v.values||[])
const H=PRO[0]
const iTot=H.findIndex(x=>txt(x)==='Total'), iGan=H.indexOf('Imp. Ganancias'), iIIBB=H.indexOf('IIBB')
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const FH=FAC[0], fNro=FH.indexOf('N° Presupuesto'), fEm=FH.indexOf('Fecha emision'), fCo=FH.indexOf('Fecha cobro')
const cobro={}
FAC.slice(1).forEach(r=>{ const n=txt(r[fNro]); if(!n)return
  const em=fecha(r[fEm]), co=fecha(r[fCo])
  if(em&&co) cobro[n]=Math.round((co-em)/864e5) })

const proy={}
PRO.slice(1).forEach(r=>{ const f=fecha(r[3]); if(!f||f.getFullYear()!==ANIO)return
  const n=txt(r[2]); if(!n)return
  const p=proy[n]||={nro:n,mes:f.getMonth()+1,ag:txt(r[4])||txt(r[5])||'(sin agencia)',total:0,costo:0,propio:0,gan:0,iibb:0,media:0,comp:0,edic:0}
  p.total=Math.max(p.total,num(r[iTot])); p.gan=Math.max(p.gan,num(r[iGan])); p.iibb=Math.max(p.iibb,num(r[iIIBB]))
  PED.forEach(c=>{ const v=norm(r[c]); if(!v)return
    if(v==='media')p.media++; else if(v==='completa')p.comp++; else if(v==='edicion')p.edic++
    const precio=num(r[c+1]), pers=txt(r[c+2])
    if(precio>1){ if(/somos magma/i.test(pers)) p.propio+=precio; else p.costo+=precio } }) })
// fuera los datos rotos: un proyecto de $1.000 con $190.000 de costo no dice nada
const ps=Object.values(proy).filter(p=>p.total>=10000)
const rotos=Object.values(proy).filter(p=>p.total>0&&p.total<10000)

const cli={}
ps.forEach(p=>{ const k=p.ag
  const c=cli[k]||={ag:k,n:0,v:0,costo:0,mg:0,jorn:0,edic:0,meses:new Set(),formatos:{},dias:[],cobrado:0}
  c.n++; c.v+=p.total; c.costo+=p.costo; c.mg+=p.total-p.costo
  c.jorn+=p.media*0.5+p.comp; c.edic+=p.edic; c.meses.add(p.mes)
  const gente=p.media+p.comp
  const f = !gente ? (p.edic?'solo edición':'otro')
    : (p.media&&p.comp) ? 'mixto'
    : `${gente} × ${p.media?'media':'completa'}`
  c.formatos[f]=(c.formatos[f]||0)+1
  if(cobro[p.nro]!==undefined) c.dias.push(cobro[p.nro])
  cli[k]=c })
// sin costo de staff cargado no se puede medir el margen: se marca, no se rankea
const cs=Object.values(cli).map(c=>({...c,
  sinCosto: c.costo===0,
  mgPct:c.mg/c.v, mgJorn:c.jorn?c.mg/c.jorn:0, ticket:c.v/c.n, recur:c.meses.size,
  diasProm:c.dias.length?Math.round(c.dias.reduce((a,b)=>a+b,0)/c.dias.length):null,
  formato:Object.entries(c.formatos).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—'}))

const totV=ps.reduce((a,p)=>a+p.total,0), totMg=ps.reduce((a,p)=>a+p.total-p.costo,0)
console.log(`\n${'█'.repeat(104)}\n  QUIÉN DEJA PLATA — ${ANIO} · ${cs.length} clientes · ${M(totV)} · margen ${M(totMg)}\n${'█'.repeat(104)}`)

// ── el ranking que importa: margen por jornada de recurso ──
const relev=cs.filter(c=>c.jorn>=2&&!c.sinCosto)
const sinDato=cs.filter(c=>c.jorn>=2&&c.sinCosto)
console.log(`\n\x1b[1m■ ORDENADO POR LO QUE DEJA CADA JORNADA DE TRABAJO\x1b[0m`)
console.log(`  (solo clientes con 2+ jornadas en el año. Las jornadas son el recurso escaso: hay ~16 por mes)\n`)
console.log(`  ${'cliente'.padEnd(24)}${'proy'.padStart(5)}${'facturado'.padStart(15)}${'margen'.padStart(15)}${'mg%'.padStart(6)}${'jorn'.padStart(7)}${'$/JORNADA'.padStart(14)}${'meses'.padStart(7)}${'cobra'.padStart(8)}  formato típico`)
console.log(`  ${'─'.repeat(126)}`)
relev.sort((a,b)=>b.mgJorn-a.mgJorn).forEach(c=>{
  const alto=c.mgJorn>900000, bajo=c.mgJorn<600000
  const col=alto?'\x1b[32m':(bajo?'\x1b[31m':'')
  console.log(`  ${col}${c.ag.slice(0,22).padEnd(24)}${String(c.n).padStart(5)}${M(c.v).padStart(15)}${M(c.mg).padStart(15)}${(c.mgPct*100).toFixed(0).padStart(5)}%${c.jorn.toFixed(1).padStart(7)}${M(c.mgJorn).padStart(14)}${String(c.recur).padStart(6)}/12${(c.diasProm!==null?c.diasProm+'d':'—').padStart(8)}  ${c.formato}\x1b[0m`)})

// ── el perfil que sale de los datos ──
if(sinDato.length) console.log(`\n  \x1b[33m${sinDato.length} cliente(s) quedan afuera por no tener costo de staff cargado: ${sinDato.map(c=>c.ag).join(', ')}\x1b[0m`)
if(rotos.length) console.log(`  \x1b[33m${rotos.length} proyecto(s) con total menor a $10.000 excluidos por dato roto\x1b[0m`)
const top=relev.filter(c=>c.mgJorn>=900000), bot=relev.filter(c=>c.mgJorn<600000)
const prom=a=>a.length?a.reduce((s,c)=>s+c.ticket,0)/a.length:0
const promJ=a=>a.length?a.reduce((s,c)=>s+c.jorn,0)/a.length:0
console.log(`\n\x1b[1m■ QUÉ TIENEN EN COMÚN LOS QUE DEJAN MÁS\x1b[0m\n`)
console.log(`  ${'  '.padEnd(24)}${'clientes'.padStart(10)}${'facturado'.padStart(16)}${'margen'.padStart(16)}${'ticket prom'.padStart(15)}${'jorn/cliente'.padStart(14)}`)
;[['Dejan +$900k/jornada',top],['Dejan −$600k/jornada',bot]].forEach(([l,a])=>
  console.log(`  ${l.padEnd(24)}${String(a.length).padStart(10)}${M(a.reduce((s,c)=>s+c.v,0)).padStart(16)}${M(a.reduce((s,c)=>s+c.mg,0)).padStart(16)}${M(prom(a)).padStart(15)}${promJ(a).toFixed(1).padStart(14)}`))
console.log(`\n  Formatos de los que más dejan:  ${[...new Set(top.map(c=>c.formato))].join(' · ')}`)
console.log(`  Formatos de los que menos dejan: ${[...new Set(bot.map(c=>c.formato))].join(' · ')}`)

// ── dónde está el volumen dormido ──
console.log(`\n\x1b[1m■ CLIENTES QUE DEJAN BIEN PERO TRAEN POCO VOLUMEN — a quién pedirle más\x1b[0m\n`)
relev.filter(c=>c.mgJorn>=800000&&c.jorn<10).sort((a,b)=>b.mgJorn-a.mgJorn).forEach(c=>
  console.log(`  ${c.ag.slice(0,22).padEnd(24)}${String(c.n).padStart(4)} proy ${c.jorn.toFixed(1).padStart(6)} jornadas   deja ${M(c.mgJorn).padStart(12)}/jornada   activo ${c.recur}/12 meses`))
console.log('')
