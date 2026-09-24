/**
 * CUENTA CORRIENTE DE SOCIOS — Juan y Sofi contra Magma. ESTE ES EL NÚMERO DE LA APP.
 *
 * El cálculo NO está acá: está en lib/socios.mjs y es el mismo que usa pages/api/socios-cuenta.js
 * (la tarjeta "Cuenta de socios" de Egresos). Este script solo lo imprime.
 * Si alguna vez la consola y la app dan distinto, el bug es de datos (otra lectura del sheet), no de criterio.
 *
 * Solo lectura. Uso: node scripts/cuenta-socios.mjs [--json]
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { RANGOS_SOCIOS, calcularCuentaSocios, fraseSaldo, nombreMes } from '../lib/socios.mjs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID=env.SHEET_ID||'1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const JSONOUT=process.argv.includes('--json')

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:RANGOS_SOCIOS,valueRenderOption:'FORMATTED_VALUE'})
const { nombreMes: _n, ...c } = calcularCuentaSocios(R.data.valueRanges.map(v=>v.values||[]))
if(JSONOUT){ console.log(JSON.stringify(c,null,2)); process.exit(0) }

const hoy=new Date()
console.log(`\n${'█'.repeat(72)}\n  CUENTA DE SOCIOS · lo mismo que muestra la app · ${hoy.toLocaleDateString('es-AR')}\n${'█'.repeat(72)}`)
console.log(`  Sueldo ${M(c.sueldoMensual)}/mes de ${nombreMes(c.desdeSueldo)} a ${nombreMes(c.hastaSueldo)} (${c.socios[0].meses} meses)`)
console.log(`  + extras por trabajo en proyectos de ${nombreMes(c.desdeExtras)} a ${nombreMes(c.hastaExtras)}`)
console.log(`  − lo que recibió − gastos personales con tarjeta de Magma + lo que puso de su bolsillo`)

for (const s of c.socios) {
  console.log(`\n${'━'.repeat(72)}\n  ${s.nombre.toUpperCase()} → ${fraseSaldo(s)}\n${'━'.repeat(72)}`)
  console.log(`  Sueldo devengado (${s.meses} × ${M(c.sueldoMensual)})                  ${M(s.sueldo).padStart(15)}`)
  console.log(`  + Extras                                             ${M(s.extra).padStart(15)}`)
  Object.entries(s.extrasPorMes).sort((a,b)=>a[0]-b[0]).forEach(([m,v])=>console.log(`       ${nombreMes(+m).padEnd(12)} ${M(v).padStart(13)}`))
  console.log(`  = TOTAL DEVENGADO                                    ${M(s.devengado).padStart(15)}`)
  console.log(`\n  ── lo que recibió de Magma ──`)
  const porMes={}
  s.detalleRecibido.forEach(x=>{const k=`${x.mes}|${x.concepto}`; porMes[k]=(porMes[k]||0)+x.monto})
  Object.entries(porMes).sort((a,b)=>+a[0].split('|')[0]-+b[0].split('|')[0]).forEach(([k,v])=>{const [m,co]=k.split('|')
    console.log(`     ${nombreMes(+m).padEnd(11)} ${co.slice(0,38).padEnd(40)} ${M(v).padStart(14)}`)})
  console.log(`     ${'subtotal'.padEnd(52)} ${M(s.recibido).padStart(14)}`)
  console.log(`\n  ── gastos personales con tarjeta de Magma ──`)
  Object.entries(s.tarjPorMes).sort((a,b)=>a[0]-b[0]).forEach(([m,v])=>console.log(`     ${nombreMes(+m).padEnd(52)} ${M(v).padStart(14)}`))
  console.log(`     ${'subtotal tarjetas'.padEnd(52)} ${M(s.tarjetas).padStart(14)}`)
  console.log(`\n  ── lo que puso de su bolsillo ──`)
  if(!s.detallePuso.length) console.log(`     (nada)`)
  s.detallePuso.forEach(x=>console.log(`     ${nombreMes(x.mes).padEnd(11)} ${x.concepto.slice(0,38).padEnd(40)} ${M(x.monto).padStart(14)}`))
  console.log(`     ${'subtotal'.padEnd(52)} ${M(s.puso).padStart(14)}`)
  console.log(`\n  SALDO = ${M(s.devengado)} − ${M(s.recibido)} − ${M(s.tarjetas)} + ${M(s.puso)} = ${M(s.saldo)}`)
}

console.log(`\n${'█'.repeat(72)}\n  RESUMEN\n${'█'.repeat(72)}`)
console.log(`  ${'socio'.padEnd(8)}${'devengado'.padStart(14)}${'recibido'.padStart(14)}${'tarjetas'.padStart(14)}${'puso'.padStart(13)}${'SALDO'.padStart(15)}`)
c.socios.forEach(s=>console.log(`  ${s.nombre.padEnd(8)}${M(s.devengado).padStart(14)}${M(s.recibido).padStart(14)}${M(s.tarjetas).padStart(14)}${M(s.puso).padStart(13)}${M(s.saldo).padStart(15)}`))
c.socios.forEach(s=>console.log(`  → ${fraseSaldo(s)}`))

if(c.usd.length){
  console.log(`\n  EN DÓLARES (aparte, no se mezcla con el saldo en pesos)`)
  c.usd.forEach(x=>console.log(`  ${x.socio.padEnd(6)} ${x.dir.padEnd(13)} ${x.concepto.slice(0,40).padEnd(42)} USD ${x.monto}`))
}
if(c.entreSocios.length) console.log(`\n  (${c.entreSocios.length} movimientos entre socios excluidos — van por otro lado)`)

const t=c.tarjetasCargadas
console.log(`\n  ⚠ TARJETAS: resúmenes cargados hasta ${t.hasta.toUpperCase()}.`)
t.lista.forEach(x=>console.log(`     ${x.tarjeta.padEnd(18)} hasta ${x.texto}`))
const faltan=[]; for(let m=t.hastaMes+1; m<=hoy.getMonth()+1; m++) faltan.push(nombreMes(m))
if(faltan.length) console.log(`     Faltan ${faltan.join(', ')}: cada mes sin resumen infla el saldo a favor del socio (sus gastos personales de ese mes no están restados).`)
console.log()
