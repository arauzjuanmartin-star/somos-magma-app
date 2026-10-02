/**
 * ADMINISTRACIÓN, UN SOLO CÁLCULO (paso 7): la caja del mes y la lista de tareas de hoy, para todo lo que NO es
 * la pantalla: el mail de la diaria, el script scripts/caja-hoy.mjs y el agente `administracion`.
 *
 * No calcula nada propio: llama a lib/caja.mjs y lib/hoy.mjs, que son los mismos que usa la pantalla Caja,
 * con las mismas opciones. Si el mail y la app dan números distintos, es un bug: no hay dos fórmulas.
 */
import { calcularCaja } from './caja.mjs'
import { tareasDeHoy } from './hoy.mjs'
import { TARJETAS_ACTIVAS } from './socios.mjs'

const plata = n => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-AR')
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * @param data  lo que devuelve getAllData()
 * @param opts  { hoy: Date (hora de Argentina), canonStaff, maxSlots }  las mismas que le pasa la pantalla a calcularCaja
 * @returns objeto plano (sin fechas ni funciones): se puede mandar por JSON
 */
export function resumenAdmin(data, opts = {}) {
  const hoy = opts.hoy || new Date()
  const caja = calcularCaja(data, { hoy, maxSlots: opts.maxSlots, canonStaff: opts.canonStaff, tarjetasActivas: TARJETAS_ACTIVAS })
  const h = tareasDeHoy(data, caja)
  const t = caja.totales
  return {
    mes: caja.mes, anio: caja.anio, mesNombre: MESES[caja.mes - 1],
    caja: {
      hoyEnCuentas: t.cajaHoy, faltaQueSalga: t.sale, aMano: t.mano, porDebito: t.debito, socios: t.socios, yaSalio: t.yaSalio,
      entraSeguro: t.entraSeguro, entraSiTodosPagan: t.entra, terminaSeguro: t.terminaSeguro, terminaSiTodosPagan: t.termina,
      vencidoSinFecha: t.vencidoSinFecha, nVencidoSinFecha: t.nVencidoSinFecha, tarjetasFaltan: t.tarjetasFaltan,
      cuentas: caja.cuentas.filter(c => c.activa).map(c => ({ nombre: c.nombre, usd: c.usd, saldo: c.usd ? c.saldoUsd : c.saldo, sale7: c.sale7, alcanza: c.usd ? null : c.resto >= 0, falta: c.resto < 0 ? -c.resto : 0, actualizada: c.actualizada })),
      atrasadas: caja.atrasadas,
    },
    tareas: h.tareas.map(x => ({ id: x.id, tono: x.tono, titulo: x.titulo, sub: x.sub, monto: x.monto, montoAprox: !!x.montoAprox, lista: x.lista })),
    nEntra: h.nEntra, porDestrabar: h.porDestrabar,
  }
}

/** La parte de administración del mail de la diaria (el mismo formato de viñetas que el resto del mail). */
export function adminMarkdown(a, link = '') {
  if (!a) return ''
  if (a.error) return `## 🧾 Administración\n⚠️ No pude calcular la lista de administración: ${a.error}`
  const L = [`## 🧾 Administración — ${a.tareas.length ? `${a.tareas.length} ${a.tareas.length === 1 ? 'cosa' : 'cosas'} para hoy` : 'todo al día'}`]
  if (a.porDestrabar > 0) L.push(`${a.nEntra === 1 ? 'La primera destraba' : `Las ${a.nEntra} primeras destraban`} **${plata(a.porDestrabar)}**.`)
  a.tareas.forEach((x, i) => {
    const monto = x.monto > 0 ? ` · ${x.tono === 'entra' ? '+' : ''}${x.montoAprox ? '≈ ' : ''}${plata(x.monto)}` : ''
    L.push(`- **${i + 1}. ${x.titulo}**${monto}`)
    // Solo el detalle de lo que trae plata o no alcanza, y hasta tres renglones: el resto se ve en la app
    if (x.tono === 'entra' || x.tono === 'alerta') x.lista.slice(0, 3).forEach(l => L.push(`  - ${l.t}${l.d ? ` · ${l.d}` : ''}${l.m > 0 ? ` · ${plata(l.m)}` : ''}`))
  })
  const c = a.caja
  L.push('', `**Caja de ${a.mesNombre}:** hoy hay ${plata(c.hoyEnCuentas)} en las cuentas · falta que salga ${plata(c.faltaQueSalga)} · entra seguro ${plata(c.entraSeguro)} · termina el mes en ${plata(c.terminaSeguro)}.`)
  if (link) L.push(`Se resuelve en la app: ${link}`)
  return L.join('\n')
}
