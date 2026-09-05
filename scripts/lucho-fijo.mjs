/**
 * LUCHO (Jorge Luis Chávez) como fijo — la cuenta completa.
 * Qué se le paga hoy mes a mes, qué vende Magma con su trabajo, y qué pasa a $2.200.000.
 * Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const MES=['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const ES_LUCHO=/jorge\s*luis\s*chav|^lucho$|chavez.*jorge/i

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS'],valueRenderOption:'FORMATTED_VALUE'})
const PRO=R.data.valueRanges[0].values||[]

// ── 1 · todas las líneas de Lucho, mes a mes ──────────────────────────────
const lineas=[]
for(const r of PRO.slice(1)){
  const f=fecha(r[3]); if(!f||f.getFullYear()!==2026) continue
  const totalProy=num(r[7]), fee=num(r[8])+num(r[9])+num(r[10])
  // costo total del staff del proyecto: sirve para prorratear el fee entre las líneas
  let costoProy=0
  for(const i of PED){ if(txt(r[i])) costoProy+=num(r[i+1]) }
  for(const i of PED){
    const serv=txt(r[i]); if(!serv) continue
    if(!ES_LUCHO.test(txt(r[i+2]))) continue
    const costo=num(r[i+1])
    // venta atribuida = costo de la línea + su parte del margen del proyecto
    const venta=costoProy>0 ? costo + fee*(costo/costoProy) : costo
    lineas.push({m:f.getMonth()+1, ag:txt(r[4])||txt(r[5]), serv, costo, venta, nro:txt(r[2])})
  }
}
const S=(a,k)=>a.reduce((s,x)=>s+x[k],0)
const meses=[...new Set(lineas.map(l=>l.m))].sort((a,b)=>a-b)
const MESES_CERRADOS=8   // ene-ago

console.log('\n'+'█'.repeat(76))
console.log('  LUCHO (Jorge Luis Chávez) · 2026 · fuente PROYECTOS')
console.log('█'.repeat(76))
console.log(`\n  ${lineas.length} líneas de trabajo · se le pagó ${M(S(lineas,'costo'))} · promedio ${M(S(lineas,'costo')/MESES_CERRADOS)}/mes\n`)

console.log('  MES   líneas        SE LE PAGÓ      VENTA que generó   ¿lo paga $2,2M?')
let bajo=0
for(const m of meses){
  const g=lineas.filter(l=>l.m===m), c=S(g,'costo'), v=S(g,'venta')
  const ok=c>=2200000
  if(m<=8 && !ok) bajo++
  const bar='█'.repeat(Math.round(c/250000))
  console.log(`  ${MES[m]}   ${String(g.length).padStart(3)}   ${M(c).padStart(14)}   ${M(v).padStart(15)}   ${m<=8?(ok?'\x1b[32mSÍ\x1b[0m':'\x1b[31mno — sobra '+M(2200000-c)+'\x1b[0m'):'(futuro)'}  ${bar}`)
}
console.log(`\n  En ${bajo} de los 8 meses cerrados se le pagó MENOS de $2.200.000.`)

// ── 2 · qué hace ──────────────────────────────────────────────────────────
const porServ={}
for(const l of lineas){ const k=l.serv; porServ[k]=porServ[k]||{n:0,c:0,v:0}; porServ[k].n++; porServ[k].c+=l.costo; porServ[k].v+=l.venta }
console.log('\n  ── QUÉ HACE ──')
Object.entries(porServ).sort((a,b)=>b[1].c-a[1].c).forEach(([k,o])=>
  console.log(`     ${k.padEnd(14)} ${String(o.n).padStart(3)} veces   costo ${M(o.c).padStart(13)}   venta ${M(o.v).padStart(13)}   ${Math.round(o.c/o.n).toLocaleString('es-AR').padStart(9)} c/u`))

// ── 3 · para quién ────────────────────────────────────────────────────────
const porAg={}
for(const l of lineas){ porAg[l.ag]=porAg[l.ag]||{n:0,c:0}; porAg[l.ag].n++; porAg[l.ag].c+=l.costo }
const ags=Object.entries(porAg).sort((a,b)=>b[1].c-a[1].c)
console.log('\n  ── PARA QUIÉN TRABAJA ──')
ags.slice(0,7).forEach(([k,o])=>console.log(`     ${k.slice(0,26).padEnd(27)} ${String(o.n).padStart(3)} líneas   ${M(o.c).padStart(13)}   ${(o.c/S(lineas,'costo')*100).toFixed(0)}%`))

// ── 4 · LA CUENTA A $2.200.000 ────────────────────────────────────────────
const FIJO=2200000
const pagoMes=S(lineas.filter(l=>l.m<=8),'costo')/MESES_CERRADOS
const ventaMes=S(lineas.filter(l=>l.m<=8),'venta')/MESES_CERRADOS
const costoJornada=(()=>{const j=lineas.filter(l=>!/edic|edit/i.test(l.serv));return j.length?S(j,'costo')/j.length:0})()
const ventaJornada=(()=>{const j=lineas.filter(l=>!/edic|edit/i.test(l.serv));return j.length?S(j,'venta')/j.length:0})()
console.log('\n'+'█'.repeat(76))
console.log(`  LA CUENTA A ${M(FIJO)}/MES`)
console.log('█'.repeat(76))
console.log(`\n     Lo que se le paga hoy como freelance   ${M(pagoMes).padStart(14)}/mes`)
console.log(`     Fijo propuesto                         ${M(FIJO).padStart(14)}/mes`)
console.log(`     GASTO NUEVO REAL                       ${(FIJO-pagoMes>0?'\x1b[31m':'\x1b[32m')+M(FIJO-pagoMes).padStart(14)+'\x1b[0m'}/mes  =  ${M((FIJO-pagoMes)*12)}/año`)
console.log(`\n     Venta que genera hoy                   ${M(ventaMes).padStart(14)}/mes`)
console.log(`     Margen sobre su trabajo, hoy           ${((1-pagoMes/ventaMes)*100).toFixed(0)}%`)
console.log(`     Margen con el fijo                     ${((1-FIJO/ventaMes)*100).toFixed(0)}%   (si mantiene el mismo volumen)`)
console.log(`\n     Costo promedio de una jornada suya     ${M(costoJornada).padStart(14)}`)
console.log(`     Venta promedio de esa jornada          ${M(ventaJornada).padStart(14)}`)
console.log(`     JORNADAS QUE LO PAGAN                  ${(FIJO/ventaJornada).toFixed(1).padStart(14)} por mes`)
console.log(`     Jornadas que hace hoy                  ${(lineas.filter(l=>l.m<=8&&!/edic|edit/i.test(l.serv)).length/MESES_CERRADOS).toFixed(1).padStart(14)} por mes`)
console.log('')
