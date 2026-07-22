/**
 * Ficha 360° de un cliente antes de una llamada/reunión. Solo lectura.
 *   node scripts/cliente.mjs "Azcuy"
 * Cruza PROYECTOS, FACTURACION, PRESUPUESTOS y Contactos.
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
const num=v=>{const s=txt(v).replace(/\s/g,'');if(!s)return 0;const neg=/^-/.test(s);const n=parseFloat(s.replace(/[^\d.]/g,''))||0;return neg?-n:n}
const fecha=v=>{const m=txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;const d=new Date(y,+m[2]-1,+m[1]);return isNaN(d)?null:d}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const esTrue=v=>/^(TRUE|VERDADERO|SI|SÍ|X)$/i.test(txt(v))
const hoy=new Date();hoy.setHours(0,0,0,0)
const dias=d=>Math.round((hoy-d)/86400000)
const fmtF=d=>d?d.toLocaleDateString('es-AR'):'—'

const Q=process.argv.slice(2).filter(a=>!a.startsWith('--')).join(' ').trim()
if(!Q){console.log('Uso: node scripts/cliente.mjs "Nombre del cliente"');process.exit(1)}
const q=nrm(Q)
const match=(...cs)=>cs.some(c=>{const v=nrm(c);return v&&(v.includes(q)||q.includes(v))})

const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS','FACTURACION','PRESUPUESTOS','Contactos/agencias','AGENCIAS'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,FAC,PRE,CON,AG]=r.data.valueRanges.map(v=>v.values||[])
const PRC=[12,15,18,21,24,27,30,33,36,39,42,45,48,61,64,67,70,73,76,79,82]

console.log(`\n${'═'.repeat(64)}\n  FICHA DE CLIENTE — "${Q}"\n${'═'.repeat(64)}`)

// ---- datos fiscales / contacto ----
const ag=AG.slice(1).find(a=>match(a[0]))
const contactos=CON.slice(1).filter(c=>match(c[2])||match(c[0]))
console.log(`\n📇 DATOS`)
if(ag) console.log(`   Agencia: ${txt(ag[0])} · CUIT ${txt(ag[1])||'—'} · ${txt(ag[2])||''} · ${txt(ag[3])||''}`)
if(contactos.length) contactos.slice(0,4).forEach(c=>console.log(`   Contacto: ${txt(c[0])}${txt(c[4])?` (${txt(c[4])})`:''} · ${txt(c[1])||'—'} · ${txt(c[5])||'—'}`))
if(!ag&&!contactos.length) console.log(`   (sin ficha en Agencias/Contactos)`)

// ---- proyectos ----
const proy=PRO.slice(1).filter(p=>txt(p[2])&&(match(p[4])||match(p[5]))).map(p=>({
  nro:txt(p[2]),fe:fecha(p[3]),proyecto:txt(p[6]),total:num(p[7]),fee:num(p[8]),
  costos:PRC.reduce((s,c)=>s+num(p[c]),0),pm:txt(p[51])}))
proy.sort((a,b)=>(b.fe||0)-(a.fe||0))
const totFact=proy.reduce((s,p)=>s+p.total,0)
const totMargen=proy.reduce((s,p)=>s+(p.total-p.costos),0)
console.log(`\n📊 TRABAJOS (PROYECTOS ${hoy.getFullYear()})`)
console.log(`   ${proy.length} proyectos · facturado ${money(totFact)} · margen ${money(totMargen)} (${totFact?Math.round(totMargen/totFact*100):0}%)`)
if(proy.length===0&&contactos.length) console.log(`   Sin trabajos en ${hoy.getFullYear()}. Si es un cliente viejo, su historial está en HISTORICO_2024/2025.`)
if(proy.length){
  const ult=proy[0].fe
  const cuando = !ult ? '' : dias(ult)<0 ? ` (próximo evento, en ${-dias(ult)} días)` : ` (hace ${dias(ult)} días)`
  console.log(`   Última/próxima vez: ${fmtF(ult)}${cuando}${ult&&dias(ult)>90?'  ⚠️ FRÍO':''}`)
  console.log(`   Últimos:`)
  proy.slice(0,6).forEach(p=>console.log(`     ${fmtF(p.fe).padStart(10)} · #${p.nro} · ${money(p.total).padStart(13)} · ${p.proyecto.slice(0,40)}${p.pm?` · PM ${p.pm}`:''}`))
}

// ---- facturación ----
const fac=FAC.slice(1).filter(f=>(txt(f[1])||txt(f[8]))&&(match(f[7])||match(f[8])))
const cobrado=fac.filter(f=>esTrue(f[4])).reduce((s,f)=>s+num(f[12]),0)
const pend=fac.filter(f=>!esTrue(f[4])&&num(f[12])>0)
const sinEmitir=pend.filter(f=>!txt(f[14]))
const vencidas=pend.filter(f=>{const v=fecha(f[19]);return v&&v<hoy})
console.log(`\n💵 FACTURACIÓN`)
console.log(`   Cobrado: ${money(cobrado)} · Por cobrar: ${money(pend.reduce((s,f)=>s+num(f[12]),0))} (${pend.length})`)
if(sinEmitir.length) console.log(`   ⚠️ Sin factura emitida: ${money(sinEmitir.reduce((s,f)=>s+num(f[12]),0))} en ${sinEmitir.length}`)
if(vencidas.length) console.log(`   🔥 Vencidas sin cobrar: ${money(vencidas.reduce((s,f)=>s+num(f[12]),0))} en ${vencidas.length}`)

// ---- presupuestos ----
const pre=PRE.slice(1).filter(p=>txt(p[0])&&(match(p[4])||match(p[5])))
const porEstado={}
pre.forEach(p=>{const e=txt(p[3]).toUpperCase()||'(sin estado)';porEstado[e]=porEstado[e]||{n:0,monto:0};porEstado[e].n++;porEstado[e].monto+=num(p[8])})
const espera=pre.filter(p=>/ESPERA|PENDIENTE/.test(txt(p[3]).toUpperCase()))
const zombis=espera.filter(p=>{const fe=fecha(p[1]);return fe&&fe<hoy})
console.log(`\n📝 PRESUPUESTOS`)
console.log(`   ${Object.entries(porEstado).map(([e,d])=>`${e}: ${d.n} (${money(d.monto)})`).join(' · ')}`)
if(zombis.length) console.log(`   🧟 ${zombis.length} en espera con evento ya pasado (${money(zombis.reduce((s,p)=>s+num(p[8]),0))}) — cerrar`)

console.log(`\n${'─'.repeat(64)}`)
if(proy.length && proy[0].fe && dias(proy[0].fe)>90)
  console.log(`  💡 Cliente FRÍO: recurrente (${proy.length} trabajos, ${money(totFact)}) sin actividad hace ${dias(proy[0].fe)} días. Candidato a llamado de recuperación.`)
else if(pend.length)
  console.log(`  💡 Tiene ${money(pend.reduce((s,f)=>s+num(f[12]),0))} por cobrar. Revisar antes de la charla.`)
console.log('')
