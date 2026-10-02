/**
 * CAJA Y HOY, por consola: la plata del mes y la lista de tareas de administración, leídas del sheet en el momento.
 *
 * Usa EXACTAMENTE el mismo cálculo que la pantalla Caja de la app (lib/caja.mjs + lib/hoy.mjs, vía lib/admin.mjs)
 * y la misma lectura del sheet (getAllData de lib/sheets.js). Si este script y la app dan números distintos, es un bug.
 * Solo lectura.
 *
 * Uso:  node scripts/caja-hoy.mjs           (para leer)
 *       node scripts/caja-hoy.mjs --json    (para encadenar: lo usa scripts/diaria.mjs y el agente administracion)
 */
import { readFileSync } from 'fs'

// lib/sheets.js toma las credenciales de process.env (como en Vercel): se cargan de .env.local antes de importarlo.
for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const i = l.indexOf('='); if (i < 0) continue; let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); if (!(l.slice(0, i).trim() in process.env)) process.env[l.slice(0, i).trim()] = v }
process.removeAllListeners('warning')   // el aviso de "module type" de Node no es parte de la salida

const { getAllData } = await import('../lib/sheets.js')
const { canonStaff } = await import('../lib/staff.js')
const { MAX_SLOTS } = await import('../lib/slots.js')
const { resumenAdmin } = await import('../lib/admin.mjs')
const { horaArgentina } = await import('../lib/diaria-mail.mjs')

const JSON_OUT = process.argv.includes('--json')
const hoy = horaArgentina()
const data = await getAllData()
const a = resumenAdmin(data, { hoy, canonStaff, maxSlots: MAX_SLOTS })
if (JSON_OUT) { console.log(JSON.stringify(a)); process.exit(0) }

const f = n => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-AR')
const c = a.caja
console.log(`\nCAJA DE ${a.mesNombre.toUpperCase()} ${a.anio} · leído del sheet el ${hoy.getDate()}/${hoy.getMonth() + 1}/${hoy.getFullYear()} ${String(hoy.getHours()).padStart(2, '0')}:${String(hoy.getMinutes()).padStart(2, '0')}\n`)
console.log(`  Hoy en las cuentas        ${f(c.hoyEnCuentas).padStart(15)}`)
console.log(`  Falta que salga           ${f(c.faltaQueSalga).padStart(15)}   (a mano ${f(c.aMano)} · débito ${f(c.porDebito)} · socios ${f(c.socios)} · ya salió ${f(c.yaSalio)})`)
console.log(`  Entra seguro              ${f(c.entraSeguro).padStart(15)}   (si todos pagan en fecha: ${f(c.entraSiTodosPagan)})`)
console.log(`  Así termina el mes        ${f(c.terminaSeguro).padStart(15)}   (si todos pagan en fecha: ${f(c.terminaSiTodosPagan)})`)
if (c.nVencidoSinFecha) console.log(`  Vencido sin fecha de pago ${f(c.vencidoSinFecha).padStart(15)}   (${c.nVencidoSinFecha} facturas, no contadas en lo que entra${c.atrasadas.length ? `: ${c.atrasadas.join(', ')}` : ''})`)
if (c.tarjetasFaltan) console.log(`  ⚠ Faltan ${c.tarjetasFaltan} resúmenes de tarjeta: lo que sale está incompleto.`)
console.log('\n  Cuentas:')
c.cuentas.forEach(x => console.log(`    ${x.nombre.padEnd(20)} ${(x.usd ? 'US$ ' + Math.round(x.saldo).toLocaleString('es-AR') : f(x.saldo)).padStart(15)}   ${x.usd ? '' : x.sale7 > 0 ? (x.alcanza ? `alcanza (salen ${f(x.sale7)} en 7 días)` : `FALTAN ${f(x.falta)} (salen ${f(x.sale7)} en 7 días)`) : 'sin pagos en 7 días'} · saldo del ${x.actualizada || '?'}`))

console.log(`\nHOY · ${a.tareas.length ? `${a.tareas.length} cosas para hacer` : 'todo al día'}${a.porDestrabar > 0 ? ` · las ${a.nEntra} primeras destraban ${f(a.porDestrabar)}` : ''}\n`)
a.tareas.forEach((x, i) => {
  console.log(`  ${String(i + 1).padStart(2)}. ${x.titulo}${x.monto > 0 ? `  ${x.montoAprox ? '≈ ' : ''}${f(x.monto)}` : ''}`)
  x.lista.forEach(l => console.log(`        ${l.t}${l.d ? ` · ${l.d}` : ''}${l.m > 0 ? ` · ${f(l.m)}` : ''}`))
})
console.log('')
