/**
 * LUCHO · banco de jornadas con piso garantizado — la cuenta para la charla.
 * Criterio de jornada: media o entera = 1 jornada (criterio Juan). Edición NO es jornada.
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
const esEdicion=s=>/edit|edicion|edición/i.test(s)
const esViatico=s=>/viatic|viático/i.test(s)

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS'],valueRenderOption:'FORMATTED_VALUE'})
const PRO=R.data.valueRanges[0].values||[]
const L=[]
for(const r of PRO.slice(1)){
  const f=fecha(r[3]); if(!f||f.getFullYear()!==2026) continue
  for(const i of PED){
    const serv=txt(r[i]); if(!serv) continue
    if(!ES_LUCHO.test(txt(r[i+2]))) continue
    L.push({m:f.getMonth()+1, serv, costo:num(r[i+1]), cli:txt(r[4])||txt(r[5]),
            tipo: esEdicion(serv)?'edicion': esViatico(serv)?'viatico':'jornada'})
  }
}
const S=(a,k)=>a.reduce((s,x)=>s+x[k],0)
const MESES=8
const jor=L.filter(l=>l.tipo==='jornada'), edi=L.filter(l=>l.tipo==='edicion')
const TARIFA_J = S(jor,'costo')/jor.length

console.log('\n'+'█'.repeat(80))
console.log('  LUCHO · BANCO DE JORNADAS · 2026 ene-ago (8 meses cerrados) · fuente PROYECTOS')
console.log('█'.repeat(80))
console.log(`\n  ${jor.length} jornadas de cámara (media o entera = 1) por ${M(S(jor,'costo'))}`)
console.log(`  \x1b[1m${(jor.length/MESES).toFixed(1)} jornadas/mes · ${M(TARIFA_J)} promedio por jornada\x1b[0m`)
console.log(`  + ${edi.length} ediciones por ${M(S(edi,'costo'))} (${M(S(edi,'costo')/MESES)}/mes) — van aparte, por entregable`)

console.log('\n  ── LA ESTACIONALIDAD ES EL PROBLEMA')
console.log('     MES   jornadas   edic.        total pagado')
const porMes=[]
for(let m=1;m<=8;m++){
  const g=L.filter(l=>l.m===m), j=g.filter(l=>l.tipo==='jornada').length
  porMes.push({m, j, costo:S(g,'costo'), costoJ:S(g.filter(l=>l.tipo==='jornada'),'costo')})
  console.log(`     ${MES[m]}      ${String(j).padStart(3)}      ${String(g.filter(l=>l.tipo==='edicion').length).padStart(3)}    ${M(S(g,'costo')).padStart(13)}   ${'█'.repeat(j)}`)
}
const js=porMes.map(p=>p.j).sort((a,b)=>a-b)
console.log(`\n     piso ${js[0]} (feb) · mediana ${js[3]}-${js[4]} · pico ${js[js.length-1]} (may) · promedio ${(jor.length/MESES).toFixed(1)}`)
console.log(`     \x1b[33mDe 8 meses, ${porMes.filter(p=>p.j<8).length} tuvieron menos de 8 jornadas.\x1b[0m`)

console.log('\n'+'─'.repeat(80))
console.log('  ESCENARIOS DE BANCO: piso garantizado (se paga aunque no se use) + extras')
console.log('─'.repeat(80))
console.log('  Regla del modelo: dentro del piso la jornada sale más barata (es el descuento por')
console.log('  la garantía). Arriba del piso se paga a tarifa. Sin acumulación entre meses.\n')
console.log('     PISO  $/jorn banco  $/jorn extra    costo/mes    vs hoy       jornadas tiradas')
const HOY_J = S(jor,'costo')/MESES
for(const [piso,pBanco,pExtra] of [[6,150000,190000],[8,145000,190000],[8,135000,180000],[10,140000,190000],[10,130000,180000],[12,125000,175000]]){
  let tot=0, tiradas=0
  for(const p of porMes){
    const usadas=p.j
    tot += piso*pBanco + Math.max(0,usadas-piso)*pExtra
    tiradas += Math.max(0,piso-usadas)
  }
  const mes=tot/MESES, d=mes-HOY_J
  const col = d<0 ? '\x1b[32m' : '\x1b[31m'
  console.log(`     ${String(piso).padStart(3)}   ${M(pBanco).padStart(11)}  ${M(pExtra).padStart(12)}   ${M(mes).padStart(11)}   ${col}${(d>=0?'+':'')+M(d)}\x1b[0m`.padEnd(100)+`  ${tiradas} en 8 meses`)
}
console.log(`\n     Referencia: hoy le pagás \x1b[1m${M(HOY_J)}/mes\x1b[0m de jornadas (+ ${M(S(edi,'costo')/MESES)} de edición)`)

console.log('\n  ── CUÁNTO VALE LA "DISPONIBILIDAD RESERVADA" QUE ÉL PIDE')
console.log('     Es lo que pagás por jornadas que NO usás. Con piso 10 en un feb de 3 jornadas:')
console.log(`     7 jornadas tiradas × ${M(140000)} = \x1b[31m${M(7*140000)} de aire en un mes\x1b[0m`)
console.log('     Por eso el piso se fija en el MES FLOJO, no en el promedio.')

console.log('\n  ── QUÉ PASA SI SE CAE AUSTRAL')
const aus=jor.filter(l=>/austral/i.test(l.cli))
console.log(`     Austral son ${aus.length} de ${jor.length} jornadas suyas = ${(100*aus.length/jor.length).toFixed(0)}%  (${(aus.length/MESES).toFixed(1)}/mes)`)
console.log(`     Sin Austral le quedan ${((jor.length-aus.length)/MESES).toFixed(1)} jornadas/mes → un piso de 8+ se paga casi entero al aire.`)
console.log('')

// ── ESCENARIO RECOMENDADO, MES A MES, con y sin acumulación ───────────────
const PISO=8, P_BANCO=145000, P_EXTRA=190000
console.log('\n'+'═'.repeat(80))
console.log(`  ESCENARIO RECOMENDADO · piso ${PISO} jornadas a ${M(P_BANCO)} · extra a ${M(P_EXTRA)}`)
console.log('═'.repeat(80))
console.log('     MES  usó   HOY cobró(jorn)      SIN acumular        CON acumular (vence 90d)')
let tSin=0,tCon=0,tHoy=0, banco=0, colaVenc=[]
for(const p of porMes){
  const sin = PISO*P_BANCO + Math.max(0,p.j-PISO)*P_EXTRA
  // con acumulación: consume primero el piso del mes, después el banco viejo
  let usa=p.j, extras=0
  if(usa<=PISO){ banco+=PISO-usa; colaVenc.push({v:PISO-usa,m:p.m}) }
  else { let falta=usa-PISO
         while(falta>0 && colaVenc.length){ const c=colaVenc[0]; const t=Math.min(c.v,falta); c.v-=t; falta-=t; banco-=t; if(c.v===0)colaVenc.shift() }
         extras=falta }
  colaVenc=colaVenc.filter(c=>{ if(p.m-c.m>3){ banco-=c.v; return false } return true })
  const con = PISO*P_BANCO + extras*P_EXTRA
  tSin+=sin; tCon+=con; tHoy+=p.costoJ
  console.log(`     ${MES[p.m]}  ${String(p.j).padStart(3)}   ${M(p.costoJ).padStart(14)}   ${M(sin).padStart(14)}   ${M(con).padStart(14)}   banco ${banco}`)
}
console.log(`     ─────────────────────────────────────────────────────────────────────`)
console.log(`     /mes      ${M(tHoy/MESES).padStart(14)}   ${M(tSin/MESES).padStart(14)}   ${M(tCon/MESES).padStart(14)}`)
console.log(`     vs hoy                            ${((tSin-tHoy)/MESES>=0?'+':'')+M((tSin-tHoy)/MESES)}        ${M((tCon-tHoy)/MESES)}`)
console.log(`\n  ── LO QUE VE LUCHO (sin acumular, que es lo que le conviene a él)`)
console.log(`     Su mes más flojo pasa de ${M(Math.min(...porMes.map(p=>p.costoJ)))} a ${M(PISO*P_BANCO)} garantizados.`)
console.log(`     En el año cobra ${M(tSin/MESES)}/mes de jornadas vs ${M(tHoy/MESES)} hoy = ${((tSin/tHoy-1)*100).toFixed(1)}%`)
console.log(`     + edición aparte ${M(S(edi,'costo')/MESES)}/mes → total ${M(tSin/MESES+S(edi,'costo')/MESES)}/mes`)
console.log('')
