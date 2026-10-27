/**
 * TICKETS: los gastos que adelanta el que va a un trabajo (nafta, peaje, estacionamiento, un taxi, comida) y hay que
 * devolverle. Hasta ahora llegaban por WhatsApp y nunca quedaban atados al trabajo.
 *
 * El circuito:
 *   1. La persona lo carga desde Mi Magma (/mi): el trabajo, qué fue, cuánto y la foto del ticket. Queda "Pendiente"
 *      en la solapa TICKETS.
 *   2. Lo autoriza el PM del trabajo, desde el aviso de arriba de la app (desde el 27/10/2026; antes era administración).
 *      Si el trabajo no tiene PM activo, le queda a administración en Caja → Hoy.
 *   3. Al aprobarlo, el monto se SUMA a los viáticos de ese trabajo en Pagos Staff (columna "Viáticos"): se le paga el
 *      15 junto con sus trabajos, y como la fila tiene el N° del trabajo, cuenta como gasto de ese trabajo.
 *
 * Cálculo puro (sin googleapis): lo usan /api/mi, /api/mi/ticket, /api/ticket-revisar, Hoy y los scripts.
 */
import { canonStaff, canonKey } from './staff.js'
import { PMS_ACTIVOS, mailInternoDe, esSocio } from './roles.js'

export const HOJA_TICKETS = 'TICKETS'
// El orden en que se crea la solapa. La app lee y escribe por nombre de título, no por posición.
export const HEADERS_TICKETS = ['ID', 'Cargado el', 'Persona', 'N° trabajo', 'Trabajo', 'Servicio', 'Mes Referencia', 'Fecha del trabajo', 'Qué fue', 'Monto', 'Foto', 'Estado', 'Revisó', 'Revisado el', 'Motivo', 'Nota']
export const QUE_FUE = ['Nafta', 'Peaje', 'Estacionamiento', 'Taxi o remís', 'Comida', 'Otro']
export const ESTADOS_TICKET = { pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado', aparte: 'Pagado aparte' }
// Hasta cuántos días después del trabajo se puede cargar un ticket, y desde cuántos días antes (la nafta de la víspera).
export const DIAS_PARA_CARGAR = 45, DIAS_ANTES = 2
export const MONTO_MAXIMO = 3000000

const txt = v => String(v ?? '').trim()
const num = v => { if (typeof v === 'number') return v; const n = parseFloat(txt(v).replace(/[$,\s]/g, '')); return isNaN(n) ? 0 : n }
const norm = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const dd = n => String(n).padStart(2, '0')

/** "10 - octubre": como se escribe el mes en Pagos Staff (columna "Mes Referencia"). */
export const mesReferencia = fecha => `${dd(fecha.getMonth() + 1)} - ${MESES[fecha.getMonth()]}`
/** El día 15 del mes siguiente al trabajo: cuándo se paga. */
export const sePagaEl = fecha => { const d = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 15); return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}` }
export const estadoTicket = r => { const e = norm(r['Estado']); return e.startsWith('aprob') ? 'aprobado' : e.startsWith('rechaz') ? 'rechazado' : e.startsWith('pagado aparte') ? 'aparte' : 'pendiente' }
export const esDe = (r, persona) => canonKey(canonStaff(r['Persona'])) === canonKey(canonStaff(persona))

/** ¿A este trabajo todavía se le puede cargar un ticket? (desde 2 días antes hasta 45 días después) */
export const sePuedeCargar = (fechaTrabajo, hoy0) => !!fechaTrabajo && (hoy0 - fechaTrabajo) / 864e5 <= DIAS_PARA_CARGAR && (fechaTrabajo - hoy0) / 864e5 <= DIAS_ANTES

/** Los tickets de una persona, como se le muestran a ella: el más nuevo primero. */
export function ticketsDe(tickets, persona) {
  return (tickets || []).filter(r => txt(r['ID']) && esDe(r, persona)).map(r => {
    const estado = estadoTicket(r)
    return { id: txt(r['ID']), cargado: txt(r['Cargado el']), num: txt(r['N° trabajo']), trabajo: txt(r['Trabajo']), fecha: txt(r['Fecha del trabajo']), que: txt(r['Qué fue']), monto: num(r['Monto']), estado, motivo: estado === 'rechazado' ? txt(r['Motivo']) : '' }
  }).reverse()
}

/** Los que esperan que alguien los autorice. */
export const ticketsPendientes = tickets => (tickets || []).filter(r => txt(r['ID']) && estadoTicket(r) === 'pendiente')

// Quién autoriza: el PM del trabajo (Juan, 27/10/2026: "el pm lo tiene que autorizar"). Es el que sabe si ese taxi
// o esa nafta fueron para el trabajo. Si el trabajo no tiene un PM activo (vacío, o Tomi que ya no está), lo autoriza
// administración. Los socios pueden siempre.
const lower = s => txt(s).toLowerCase()
// Juan entra a veces con su Gmail: para la app es el mismo PM que juan@.
const ALIAS = { 'arauzjuanmartin@gmail.com': 'juan@somosmagma.com' }
const mailDe = m => ALIAS[lower(m)] || lower(m)
// Si el PM no lo mira en 3 días, aparece también en Caja → Hoy: un ticket no puede quedar esperando sin que nadie lo vea.
export const DIAS_ESPERA_PM = 3
export const diasCargado = (r, hoy = new Date()) => { const m = txt(r['Cargado el']).replace(/^'/, '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (!m) return 0; return Math.floor((hoy - new Date(+m[3], +m[2] - 1, +m[1])) / 864e5) }
/** El PM del trabajo del ticket, como figura en PROYECTOS ("Juan", "Sol"...). */
export const pmDelTicket = (r, proyectos) => txt((proyectos || []).find(p => txt(p['N° presupuesto']) === txt(r['N° trabajo']))?.['PM'])
export const pmActivo = pm => PMS_ACTIVOS.some(n => lower(n) === lower(pm))
// Administración: los que no tienen PM activo y los que el PM dejó pasar 3 días (ticket = la fila, para saber cuándo se cargó).
export const puedeAutorizar = (mail, pm, ticket = null) => esSocio(mail) || (pmActivo(pm) && mailInternoDe(pm) === mailDe(mail))
  || (lower(mail) === 'admin@somosmagma.com' && (!pmActivo(pm) || (!!ticket && diasCargado(ticket) >= DIAS_ESPERA_PM)))
/** Los pendientes que tiene que autorizar este PM (los de sus trabajos). */
export const ticketsDelPM = (tickets, proyectos, mail) => ticketsPendientes(tickets).filter(r => { const pm = pmDelTicket(r, proyectos); return pmActivo(pm) && mailInternoDe(pm) === mailDe(mail) })
/** Los que le quedan a administración: sin un PM activo que los autorice, o que el PM lleva 3 días sin mirar. */
export const ticketsSinPM = (tickets, proyectos, hoy = new Date()) => ticketsPendientes(tickets).filter(r => !pmActivo(pmDelTicket(r, proyectos)) || diasCargado(r, hoy) >= DIAS_ESPERA_PM)

/** Un ID corto y único para cada ticket: con él se lo busca en la solapa aunque alguien ordene las filas. */
export const nuevoIdTicket = (ahora = Date.now()) => `T-${ahora.toString(36).toUpperCase()}${Math.floor(Math.random() * 36).toString(36).toUpperCase()}`
