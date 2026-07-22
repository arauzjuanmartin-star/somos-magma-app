/**
 * Vista comercial / marketing — el embudo, qué vender, a quién llamar. Solo lectura.
 *   node scripts/marketing.mjs
 * Responde: cómo viene el embudo, qué servicio empujar, dónde profundizar,
 * a quién recuperar y qué presupuestos cerrar (con contacto para llamar).
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
const hoy=new Date();hoy.setHours(0,0,0,0)
const dias=d=>Math.round((hoy-d)/86400000)
const ANIO=hoy.getFullYear()

const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PRESUPUESTOS','PROYECTOS','Contactos/agencias'],valueRenderOption:'FORMATTED_VALUE'})
const [PRE,PRO,CON]=r.data.valueRanges.map(v=>v.values||[])
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const PRC=[12,15,18,21,24,27,30,33,36,39,42,45,48,61,64,67,70,73,76,79,82]

console.log(`\n${'█'.repeat(66)}\n  MARKETING / COMERCIAL — SOMOS MAGMA · ${hoy.toLocaleDateString('es-AR')}\n${'█'.repeat(66)}`)

// ---------- 1. EMBUDO ----------
const pres=PRE.slice(1).filter(p=>txt(p[0]))
const est={}
pres.forEach(p=>{const e=txt(p[3]).toUpperCase()||'(sin estado)';est[e]=est[e]||{n:0,monto:0};est[e].n++;est[e].monto+=num(p[8])})
const apro=(est['APROBADO']?.n)||0, desa=(est['DESAPROBADO']?.n)||0, esp=(est['EN ESPERA']?.n)||0, rep=(est['REPRESUPUESTADO']?.n)||0
const decididos=apro+desa
console.log(`\n═══ 1. EL EMBUDO ═══\n`)
Object.entries(est).sort((a,b)=>b[1].monto-a[1].monto).forEach(([e,d])=>
  console.log(`   ${e.padEnd(18)} ${String(d.n).padStart(4)} presus · ${money(d.monto).padStart(16)}`))
console.log(`\n   ➜ TASA DE CIERRE: ${decididos?Math.round(apro/decididos*100):0}% (${apro} aprobados de ${decididos} decididos)`)
console.log(`   ➜ EN ESPERA sin decidir: ${esp} presus por ${money(est['EN ESPERA']?.monto||0)}`)

// ---------- 2. QUÉ VENDER ----------
const proy=PRO.slice(1).filter(p=>{const f=fecha(p[3]);return txt(p[2])&&f&&f.getFullYear()===ANIO})
const svcCat=s=>{const t=String(s||'').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu,'').trim().toLowerCase()
  if(/^foto/.test(t))return t.includes('1/2')||t.includes('½')?'Foto 1/2':'Foto 1'
  if(/^video/.test(t))return t.includes('1/2')||t.includes('½')?'Video 1/2':'Video 1'
  if(/^film/.test(t))return t.includes('1/2')||t.includes('½')?'Film 1/2':'Film 1'
  if(/edit/.test(t))return 'Edición'; if(!t)return null; return null}
const arq={}
proy.forEach(p=>{
  const cats=[...new Set(PED.map(c=>svcCat(p[c])).filter(Boolean))].sort()
  if(!cats.length)return
  const k=cats.join(' + ')
  const costos=PRC.reduce((s,c)=>s+num(p[c]),0)
  arq[k]=arq[k]||{n:0,total:0,margen:0}
  arq[k].n++; arq[k].total+=num(p[7]); arq[k].margen+=num(p[7])-costos})
console.log(`\n\n═══ 2. QUÉ EMPUJAR (los combos que más dejan) ═══\n`)
console.log(`   ${'COMBO'.padEnd(32)}${'VECES'.padStart(6)}${'TICKET'.padStart(14)}${'MARGEN'.padStart(9)}${'DEJÓ'.padStart(15)}`)
Object.entries(arq).filter(([,d])=>d.n>=3).sort((a,b)=>b[1].margen-a[1].margen).slice(0,8).forEach(([k,d])=>
  console.log(`   ${k.slice(0,31).padEnd(32)}${String(d.n).padStart(6)}${money(d.total/d.n).padStart(14)}${(Math.round(d.margen/d.total*100)+'%').padStart(9)}${money(d.margen).padStart(15)}`))

// ---------- 3. DÓNDE PROFUNDIZAR ----------
const cli={}
proy.forEach(p=>{const k=txt(p[5])||txt(p[4]);if(!k)return
  const costos=PRC.reduce((s,c)=>s+num(p[c]),0)
  cli[k]=cli[k]||{n:0,total:0,margen:0,ult:null}
  cli[k].n++;cli[k].total+=num(p[7]);cli[k].margen+=num(p[7])-costos
  const f=fecha(p[3]); if(f&&(!cli[k].ult||f>cli[k].ult))cli[k].ult=f})
console.log(`\n\n═══ 3. DÓNDE PROFUNDIZAR (mejores clientes por margen) ═══\n`)
console.log(`   ${'CLIENTE'.padEnd(26)}${'TRAB'.padStart(6)}${'FACTURADO'.padStart(15)}${'MARGEN'.padStart(9)}`)
Object.entries(cli).filter(([,d])=>d.total>1000).sort((a,b)=>b[1].margen-a[1].margen).slice(0,8).forEach(([k,d])=>
  console.log(`   ${k.slice(0,25).padEnd(26)}${String(d.n).padStart(6)}${money(d.total).padStart(15)}${(Math.round(d.margen/d.total*100)+'%').padStart(9)}`))

// ---------- 4. A QUIÉN LLAMAR (fríos) ----------
const INT=/^(juan|sofi|sofia|somos magma|magma)$/i
const frios=Object.entries(cli).filter(([k,d])=>!INT.test(k.trim())&&d.n>=3&&d.ult&&dias(d.ult)>75&&d.total>=1000000).sort((a,b)=>b[1].total-a[1].total)
console.log(`\n\n═══ 4. A QUIÉN LLAMAR (recurrentes que se enfriaron) ═══\n`)
if(!frios.length) console.log(`   Ninguno ✓`)
frios.slice(0,6).forEach(([k,d])=>{
  const c=CON.slice(1).find(x=>nrm(x[2])===nrm(k)||nrm(x[0])===nrm(k))
  console.log(`   ${k.padEnd(24)} ${d.n} trab · ${money(d.total).padStart(14)} · hace ${dias(d.ult)} días`)
  if(c) console.log(`      → ${txt(c[0])} · ${txt(c[1])||'sin mail'} · ${txt(c[5])||'sin tel'}`)})

// ---------- 5. QUÉ CERRAR (en espera, más grandes/viejos, con contacto) ----------
const espera=pres.filter(p=>/ESPERA|PENDIENTE/.test(txt(p[3]).toUpperCase())).map(p=>({
  nro:txt(p[0]),fe:fecha(p[1]),fPre:fecha(p[9]),ag:txt(p[4]),cl:txt(p[5]),proy:txt(p[6]),
  monto:num(p[8]),ct:txt(p[10]),pm:txt(p[2])})).sort((a,b)=>b.monto-a.monto)
console.log(`\n\n═══ 5. QUÉ CERRAR (los 8 más grandes en espera) ═══\n`)
espera.slice(0,8).forEach(e=>{
  const c=CON.slice(1).find(x=>nrm(x[0])===nrm(e.ct))
  const edad=e.fPre?`${dias(e.fPre)}d sin respuesta`:''
  const pasado=e.fe&&e.fe<hoy?' ⚠️ EVENTO YA PASÓ':''
  console.log(`   ${money(e.monto).padStart(14)} · #${e.nro} · ${(e.cl||e.ag).slice(0,22)} — ${e.proy.slice(0,32)}`)
  console.log(`      ${edad}${pasado}${e.pm?` · PM ${e.pm}`:''}${e.ct?` · contacto ${e.ct}`:''}${c&&txt(c[5])?` ${txt(c[5])}`:''}`)})

console.log(`\n${'─'.repeat(66)}`)
console.log(`  💡 El rol del dueño es traer negocios: la sección 4 y 5 son tu lista de llamados de esta semana.`)
console.log('')
