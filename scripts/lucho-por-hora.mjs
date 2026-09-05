/**
 * LUCHO por HORA vs por jornada vs fijo mensual — la cuenta real.
 * Convierte lo que ya se le pagó en 2026 a horas y compara los 3 modelos.
 * Solo lectura.  Flags: --media=4 --entera=8 --hora=41000
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const arg=(k,d)=>{const a=process.argv.find(x=>x.startsWith('--'+k+'='));return a?parseFloat(a.split('=')[1]):d}
const H_MEDIA=arg('media',4), H_ENTERA=arg('entera',8)
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const MES=['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const ES_LUCHO=/jorge\s*luis\s*chav|^lucho$|chavez.*jorge/i

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS'],valueRenderOption:'FORMATTED_VALUE'})
const PRO=R.data.valueRanges[0].values||[]

// clasificar cada línea: media jornada / jornada entera / edición / otro
function clasificar(s){
  if(/edit|edicion|edición/i.test(s)) return 'edicion'
  if(/viatic|viático/i.test(s))       return 'otro'
  if(/½|1\/2/.test(s))                return 'media'
  if(/\b1\b/.test(s))                 return 'entera'
  return 'sinunidad'
}
const HORAS={media:H_MEDIA, entera:H_ENTERA, edicion:0, otro:0, sinunidad:0}

const lineas=[]
for(const r of PRO.slice(1)){
  const f=fecha(r[3]); if(!f||f.getFullYear()!==2026) continue
  for(const i of PED){
    const serv=txt(r[i]); if(!serv) continue
    if(!ES_LUCHO.test(txt(r[i+2]))) continue
    const tipo=clasificar(serv)
    lineas.push({m:f.getMonth()+1, serv, tipo, costo:num(r[i+1]), horas:HORAS[tipo]})
  }
}
const S=(a,k)=>a.reduce((s,x)=>s+x[k],0)
const MESES=8 // ene-ago cerrados
const cam=lineas.filter(l=>l.tipo==='media'||l.tipo==='entera')
const edi=lineas.filter(l=>l.tipo==='edicion')
const otr=lineas.filter(l=>l.tipo!=='media'&&l.tipo!=='entera'&&l.tipo!=='edicion')

console.log('\n'+'█'.repeat(78))
console.log(`  LUCHO POR HORA · supuesto: media jornada = ${H_MEDIA}h · jornada entera = ${H_ENTERA}h`)
console.log('█'.repeat(78))

console.log('\n  ── EN QUÉ SE LE VA LA PLATA (2026, 8 meses cerrados)')
for(const [t,lbl] of [['media','Medias jornadas'],['entera','Jornadas enteras'],['edicion','Ediciones'],['sinunidad','Sin unidad clara'],['otro','Viáticos/otros']]){
  const g=lineas.filter(l=>l.tipo===t); if(!g.length) continue
  const c=S(g,'costo')
  console.log(`     ${lbl.padEnd(18)} ${String(g.length).padStart(3)} líneas  ${M(c).padStart(13)}  ${(100*c/S(lineas,'costo')).toFixed(0).padStart(3)}%   ${M(c/g.length)}/u`)
}
if(lineas.some(l=>l.tipo==='sinunidad')) console.log('     ⚠ sin unidad: '+[...new Set(lineas.filter(l=>l.tipo==='sinunidad').map(l=>l.serv))].join(', '))

const horasTot=S(cam,'horas'), costoCam=S(cam,'costo')
const tarifaHoy=costoCam/horasTot
console.log('\n  ── LA TARIFA POR HORA QUE YA LE PAGÁS (sin saberlo)')
console.log(`     Cámara: ${cam.length} unidades = ${horasTot} horas por ${M(costoCam)}`)
console.log(`     \x1b[1m${M(tarifaHoy)}/hora\x1b[0m   ·   ${(horasTot/MESES).toFixed(1)} horas/mes`)
const md=cam.filter(l=>l.tipo==='media'), en=cam.filter(l=>l.tipo==='entera')
if(md.length) console.log(`     media jornada  ${M(S(md,'costo')/md.length)} → ${M(S(md,'costo')/S(md,'horas'))}/h`)
if(en.length) console.log(`     jornada entera ${M(S(en,'costo')/en.length)} → ${M(S(en,'costo')/S(en,'horas'))}/h`)
if(md.length&&en.length) console.log(`     \x1b[33mLa media jornada te sale ${((S(md,'costo')/S(md,'horas'))/(S(en,'costo')/S(en,'horas'))).toFixed(2)}x por hora que la entera.\x1b[0m`)

const TARIFA=arg('hora', Math.round(tarifaHoy/1000)*1000)
const FIJO=2200000
console.log('\n  ── MES A MES: LOS 3 MODELOS'+`  (por hora a ${M(TARIFA)}/h)`)
console.log('     MES   horas cám.        HOY          POR HORA           FIJO $2,2M')
let tHoy=0,tHora=0,tFijo=0
for(let m=1;m<=8;m++){
  const g=lineas.filter(l=>l.m===m), gc=g.filter(l=>l.tipo==='media'||l.tipo==='entera')
  const h=S(gc,'horas'), hoy=S(g,'costo')
  const porHora=h*TARIFA + S(g.filter(l=>l.tipo!=='media'&&l.tipo!=='entera'),'costo') // edición sigue por entregable
  tHoy+=hoy; tHora+=porHora; tFijo+=FIJO
  const d=porHora-hoy
  console.log(`     ${MES[m]}  ${String(h).padStart(6)}h   ${M(hoy).padStart(12)}   ${M(porHora).padStart(12)} ${(d>=0?'+':'')+M(d).padStart(11)}   ${M(FIJO).padStart(12)} ${(FIJO-hoy>=0?'+':'')+M(FIJO-hoy)}`)
}
console.log(`     ────────────────────────────────────────────────────────────────`)
console.log(`     TOT          ${M(tHoy).padStart(12)}   ${M(tHora).padStart(12)}   ${M(tFijo).padStart(12)}`)
console.log(`     /mes         ${M(tHoy/MESES).padStart(12)}   ${M(tHora/MESES).padStart(12)}   ${M(tFijo/MESES).padStart(12)}`)

console.log('\n  ── SI LOS RODAJES DURAN MENOS DE LO QUE PAGÁS')
console.log('     (una "media jornada" que en la calle es de 2 o 3 horas)')
for(const real of [2,2.5,3,4]){
  const h = md.length*real + en.length*H_ENTERA
  const c = h*tarifaHoy + S(edi,'costo') + S(otr,'costo')
  console.log(`     media real ${real}h → ${String(Math.round(h)).padStart(4)}h → ${M(c/MESES).padStart(12)}/mes   vs hoy ${M(tHoy/MESES)}   ${c<tHoy?'\x1b[32mahorra '+M((tHoy-c)/MESES)+'/mes\x1b[0m':'igual'}`)
}

console.log('\n  ── PUNTO DE INDIFERENCIA CONTRA EL FIJO')
console.log(`     A ${M(tarifaHoy)}/h, el fijo de ${M(FIJO)} se paga con \x1b[1m${(FIJO/tarifaHoy).toFixed(1)} horas/mes\x1b[0m`)
console.log(`     Hoy le comprás ${(horasTot/MESES).toFixed(1)} h/mes → ${FIJO/tarifaHoy > horasTot/MESES ? '\x1b[31mel fijo solo cierra si le sacás '+((FIJO/tarifaHoy)-(horasTot/MESES)).toFixed(1)+' h/mes MÁS que hoy\x1b[0m' : '\x1b[32mel fijo ya cierra\x1b[0m'}`)

console.log('\n  ── BOLSA DE HORAS (fijo mensual que compra horas, no exclusividad)')
for(const [hs,tar] of [[40,34000],[50,32000],[60,30000],[70,28000]]){
  const costo=hs*tar
  console.log(`     ${hs} h/mes a ${M(tar)}/h = ${M(costo)}/mes   ·   ${(100*(tar/tarifaHoy-1)).toFixed(0)}% vs tarifa hoy   ·   ${hs>horasTot/MESES?'+'+(hs-horasTot/MESES).toFixed(1)+'h de capacidad':''}`)
}
console.log('')
