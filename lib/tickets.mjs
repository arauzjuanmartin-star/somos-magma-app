/**
 * TICKETS: los gastos que adelanta el que va a un trabajo (nafta, peaje, estacionamiento, un taxi, comida) y hay que
 * devolverle. Hasta ahora llegaban por WhatsApp y nunca quedaban atados al trabajo.
 *
 * El circuito:
 *   1. La persona lo carga desde Mi Magma (/mi): el trabajo, qué fue, cuánto y la foto del ticket. Queda "Pendiente"
 *      en la solapa TICKETS.
 *   2. Administración lo ve en Hoy ("Revisar N tickets") y lo aprueba o lo rechaza.
 *   3. Al aprobarlo, el monto se SUMA a los viáticos de ese trabajo en Pagos Staff (columna "Viáticos"): se le paga el
 *      15 junto con sus trabajos, y como la fila tiene el N° del trabajo, cuenta como gasto de ese trabajo.
 *
 * Cálculo puro (sin googleapis): lo usan /api/mi, /api/mi/ticket, /api/ticket-revisar, Hoy y los scripts.
 */
import { canonStaff, canonKey } from './staff.js'

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

/** Los que esperan que administración los mire. */
export const ticketsPendientes = tickets => (tickets || []).filter(r => txt(r['ID']) && estadoTicket(r) === 'pendiente')

/** Un ID corto y único para cada ticket: con él se lo busca en la solapa aunque alguien ordene las filas. */
export const nuevoIdTicket = (ahora = Date.now()) => `T-${ahora.toString(36).toUpperCase()}${Math.floor(Math.random() * 36).toString(36).toUpperCase()}`
