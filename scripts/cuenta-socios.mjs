/**
 * CUENTA CORRIENTE DE SOCIOS — Juan y Sofi contra Magma, desde mayo 2026.
 *
 * Criterios (definidos por Juan 2026-07-31):
 *  · Sueldo acordado: $3.000.000/mes por socio (el $3,2M era del recibo de Juan, no del acuerdo)
 *  · SUELDOS: se devengan desde MAYO (el de abril se paga en mayo). Marzo y anteriores ya cobrados.
 *  · EXTRAS (trabajo en proyectos): se devengan desde MARZO (se pagan desde abril). Nunca se cobraron.
 *  · Los préstamos Galicia SGR NO entran: aunque estén a nombre de Sofi, los paga Magma
 *  · Cuotas de préstamo: se toman del cronograma de la solapa PRESTAMOS
 *  · Gastos personales con tarjeta de Magma = plata que el socio recibió
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
const SUELDO=3000000, DESDE_MES=5, MESES=[5,6,7,8]   // el sueldo de agosto corresponde al trabajo de julio, ya devengado
const EXTRAS_DESDE=3, EXTRAS_HASTA=7   // trabajo de marzo a julio (agosto recién arranca)

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['SOCIOS_MOVIMIENTOS','MOVIMIENTOS_TARJETA','PRESTAMOS','PROYECTOS'],valueRenderOption:'FORMATTED_VALUE'})
const [SM,MT,PRE,PRO]=R.data.valueRanges.map(v=>v.values||[])

// ── lo que Magma pagó por Sofi (del resumen que armó ella; las cuotas se reemplazan por el cronograma)
const cuota=(pres,mes)=>{ let v=0
  PRE.slice(1).forEach(r=>{ if(!r||txt(r[0])!==pres)return
    const f=fecha(r[3]); if(!f||f.getFullYear()!==2026||f.getMonth()+1!==mes)return
    v=num(r[4]) })
  return v }
const SANT_COMPARTIDO='Santander #810-03510008128/6'   // 50% Magma / 50% Sofi → solo la mitad es pago a Sofi
const SANT_PERSONAL  ='Santander #810-03510008035/1'   // 100% Sofi → la cuota entera es pago a Sofi
const pagosSofi=[]
MESES.forEach(m=>{
  const c1=cuota(SANT_COMPARTIDO,m), c2=cuota(SANT_PERSONAL,m)
  if(c1) pagosSofi.push({mes:m, concepto:`Santander compartido (50%)`, monto:c1/2})
  if(c2) pagosSofi.push({mes:m, concepto:`Santander personal (100%)`, monto:c2})
})
// pagos directos declarados por Sofi (no están en ninguna solapa todavía)
pagosSofi.push({mes:5, concepto:'Pago tarjeta Visa Galicia', monto:600000})
pagosSofi.push({mes:5, concepto:'Pago tarjeta Visa Galicia', monto:217230})
pagosSofi.push({mes:5, concepto:'Pago psicóloga', monto:86000})
pagosSofi.push({mes:6, concepto:'Pago tarjeta Visa Galicia', monto:474630})
pagosSofi.push({mes:6, concepto:'Haberes', monto:2800000})
const pusoSofi=[{mes:7, concepto:'Préstamo en efectivo a Magma', monto:600000}]

// ── de SOCIOS_MOVIMIENTOS (solo ARS para el saldo; USD y deuda entre socios van aparte)
const recJuan=[], pusoJuan=[], usd=[], entreSocios=[]
SM.slice(1).forEach(r=>{ if(!r||!txt(r[0]))return
  const socio=txt(r[1]), dir=txt(r[2]), moneda=txt(r[9]||'ARS').toUpperCase()
  const f=fecha(r[0]); if(!f||f.getFullYear()!==2026)return
  const item={mes:f.getMonth()+1, socio, concepto:txt(r[3]), monto:num(r[4]), moneda, dir}
  // deuda entre socios: no toca la cuenta con Magma
  if(/→/.test(dir)&&!/magma/i.test(dir)){ entreSocios.push(item); return }
  if(moneda!=='ARS'){ usd.push(item); return }
  if(f.getMonth()+1<DESDE_MES) return
  if(!/juan/i.test(socio)) return
  if(/Magma→Socio/i.test(dir)) recJuan.push(item); else pusoJuan.push(item) })

// ── gastos personales con tarjeta de Magma (col 4 = titular)
const tarj={Juan:[],Sofi:[]}
MT.slice(1).forEach(r=>{ if(!r||!txt(r[0]))return
  if(!/personal/i.test(txt(r[8])))return
  const mes=num(r[1]); if(mes<DESDE_MES)return
  const tit=/sof/i.test(txt(r[4]))?'Sofi':(/juan/i.test(txt(r[4]))?'Juan':null)
  if(!tit)return
  tarj[tit].push({mes, monto:num(r[7]), tarjeta:txt(r[0])}) })
const sumaTarj=t=>{const o={}; tarj[t].forEach(x=>o[x.mes]=(o[x.mes]||0)+x.monto); return o}

// ── EXTRAS: lo que trabajaron en proyectos y no cobraron
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const extras={Juan:{},Sofi:{}}
PRO.slice(1).forEach(r=>{
  const f=fecha(r[3]); if(!f||f.getFullYear()!==2026)return
  const mes=f.getMonth()+1; if(mes<EXTRAS_DESDE||mes>EXTRAS_HASTA)return
  PED.forEach(c=>{const p=txt(r[c]); if(!p)return; const v=num(r[c+1]); const pers=txt(r[c+2])
    if(v<=1||!pers)return
    const q=/juan martin arauz/i.test(pers)?'Juan':(/sofia maria grenier/i.test(pers)?'Sofi':null)
    if(!q)return
    extras[q][mes]=(extras[q][mes]||0)+v })})

function cuenta(nombre, recibidos, puestos, gastosTarj, extrasMes){
  const sueldoDev=SUELDO*MESES.length
  const extraDev=Object.values(extrasMes).reduce((s,v)=>s+v,0)
  const devengado=sueldoDev+extraDev
  const rec=recibidos.reduce((s,x)=>s+x.monto,0)
  const gt=Object.values(gastosTarj).reduce((s,v)=>s+v,0)
  const pus=puestos.reduce((s,x)=>s+x.monto,0)
  const neto=devengado-rec-gt+pus
  console.log(`\n${'━'.repeat(72)}\n  ${nombre.toUpperCase()}\n${'━'.repeat(72)}`)
  console.log(`  Sueldo devengado may–ago (${MESES.length} × ${M(SUELDO)})        ${M(sueldoDev).padStart(15)}`)
  console.log(`  + Extras por trabajo en proyectos (mar–jul)          ${M(extraDev).padStart(15)}`)
  Object.entries(extrasMes).sort().forEach(([m,v])=>console.log(`       mes ${m}  ${M(v).padStart(13)}`))
  console.log(`  = TOTAL DEVENGADO                                    ${M(devengado).padStart(15)}`)
  console.log(`\n  ── lo que recibió de Magma ──`)
  const porMes={}
  recibidos.forEach(x=>{const k=`${x.mes}|${x.concepto}`; porMes[k]=(porMes[k]||0)+x.monto})
  Object.entries(porMes).sort().forEach(([k,v])=>{const [m,c]=k.split('|')
    console.log(`     mes ${m}  ${c.slice(0,38).padEnd(40)} ${M(v).padStart(14)}`)})
  console.log(`     ${'subtotal transferencias/pagos'.padEnd(46)} ${M(rec).padStart(14)}`)
  console.log(`\n  ── gastos personales con tarjeta de Magma ──`)
  Object.entries(gastosTarj).sort().forEach(([m,v])=>console.log(`     mes ${m}  ${''.padEnd(40)} ${M(v).padStart(14)}`))
  console.log(`     ${'subtotal tarjetas'.padEnd(46)} ${M(gt).padStart(14)}`)
  console.log(`\n  ── lo que puso de su bolsillo ──`)
  if(!puestos.length) console.log(`     (nada)`)
  puestos.forEach(x=>console.log(`     mes ${x.mes}  ${x.concepto.slice(0,38).padEnd(40)} ${M(x.monto).padStart(14)}`))
  console.log(`     ${'subtotal'.padEnd(46)} ${M(pus).padStart(14)}`)
  console.log(`\n  ${'─'.repeat(68)}`)
  console.log(`  SALDO = devengado − recibido − tarjetas + puesto`)
  console.log(`        = ${M(devengado)} − ${M(rec)} − ${M(gt)} + ${M(pus)}`)
  console.log(`        = ${M(neto)}   ${neto>=0?'← a FAVOR del socio (Magma le debe)':'← el socio le DEBE a Magma'}`)
  return {nombre, devengado, rec, gt, pus, neto}
}
console.log(`\n${'█'.repeat(72)}\n  CUENTA DE SOCIOS — mayo a agosto 2026 · sueldo ${M(SUELDO)}/mes\n${'█'.repeat(72)}`)
const a=cuenta('Sofi', pagosSofi, pusoSofi, sumaTarj('Sofi'), extras.Sofi)
const b=cuenta('Juan', recJuan, pusoJuan, sumaTarj('Juan'), extras.Juan)
console.log(`\n${'█'.repeat(72)}\n  COMPARACIÓN\n${'█'.repeat(72)}`)
console.log(`  ${'socio'.padEnd(8)}${'devengado'.padStart(14)}${'recibido'.padStart(14)}${'tarjetas'.padStart(14)}${'puso'.padStart(13)}${'SALDO'.padStart(15)}`)
;[a,b].forEach(x=>console.log(`  ${x.nombre.padEnd(8)}${M(x.devengado).padStart(14)}${M(x.rec).padStart(14)}${M(x.gt).padStart(14)}${M(x.pus).padStart(13)}${M(x.neto).padStart(15)}`))
console.log(`\n  Diferencia de retiro entre socios: ${M(Math.abs((a.rec+a.gt)-(b.rec+b.gt)))}`)

if(usd.length){
  console.log(`\n${'━'.repeat(72)}\n  EN DÓLARES (aparte, no se mezcla con el saldo en pesos)\n${'━'.repeat(72)}`)
  usd.forEach(x=>console.log(`  ${x.socio.padEnd(6)} ${x.dir.padEnd(13)} ${x.concepto.slice(0,40).padEnd(42)} USD ${x.monto}`))
}
// La deuda personal Juan↔Sofi NO se reporta acá: es entre ellos, no pasa por Magma (Juan, 02/08/2026).
// Las filas siguen en SOCIOS_MOVIMIENTOS y el filtro de arriba ya las excluye del saldo.
if(entreSocios.length) console.log(`\n  (${entreSocios.length} movimientos entre socios excluidos — van por otro lado)`)
console.log(`\n  Tarjetas cargadas hasta JULIO 2026 (BBVA Visa + Master Galicia, cierre 30/07).`)
