/**
 * DISPONIBILIDAD: lo que cada freelancer contesta desde Mi Magma sobre SUS fechas. Hasta ahora eso pasaba por WhatsApp
 * ("¿podés el jueves?" · "dale" · "uh, me surgió algo") y no quedaba en ningún lado: el PM lo tenía en la cabeza.
 *
 * Tres cosas, una fila cada una en la solapa DISPONIBILIDAD:
 *   · "Confirmó"           la persona vio el trabajo en su agenda y dijo que va.
 *   · "No puede"           la persona avisa que a ESE trabajo no llega. La app NO la saca del staff: le avisa al PM por
 *                          mail y lo deja en rojo en el cargador de staff hasta que el PM ponga a otro.
 *   · "Día no disponible"  sin trabajo de por medio: "el 15 no cuenten conmigo". El cargador de staff lo avisa cuando
 *                          alguien quiere ponerla ese día.
 *
 * Una respuesta nueva sobre lo mismo ANULA la anterior (columna Estado), así la solapa se lee sola: lo "Vigente" es lo
 * que vale hoy. También se puede anotar a mano en el sheet lo que alguien avisó por teléfono: alcanza con Persona,
 * Fecha y Qué.
 *
 * La llave de una respuesta es persona + N° + servicio + día. Si el PM cambia el día del trabajo, la confirmación deja
 * de valer (confirmó otra fecha) y se le vuelve a pedir: es lo que tiene que pasar.
 *
 * Cálculo puro (sin googleapis): lo usan /api/mi, /api/mi/disponibilidad, el cargador de staff y los scripts.
 */
import { canonStaff, canonKey, esMagma } from './staff.js'
import { lineasDeProyecto } from './jornadas.js'

export const HOJA_DISPONIBILIDAD = 'DISPONIBILIDAD'
// El orden en que se crea la solapa. La app lee y escribe por nombre de título, no por posición.
export const HEADERS_DISPONIBILIDAD = ['ID', 'Cargado el', 'Persona', 'Fecha', 'Día', 'Qué', 'N° trabajo', 'Trabajo', 'Servicio', 'Motivo', 'Estado', 'PM', 'Avisado a']
export const QUE = { confirmo: 'Confirmó', nopuedo: 'No puede', dia: 'Día no disponible' }
export const ESTADO = { vigente: 'Vigente', anulado: 'Anulado' }
// Si falta menos que esto para el trabajo, un "no puedo" sale marcado URGENTE y a la persona se le pide que además llame.
export const HORAS_URGENTE = 48
// Hasta cuántos días para adelante se puede marcar "este día no puedo".
export const DIAS_ADELANTE = 120

const txt = v => String(v ?? '').trim()
const norm = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const dd = n => String(n).padStart(2, '0')
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
export const fechaAR = s => { const m = txt(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (!m) return null
  let y = +m[3]; if (y < 100) y += 2000; const d = new Date(y, +m[2] - 1, +m[1]); return isNaN(d) ? null : d }
export const dmy = f => `${dd(f.getDate())}/${dd(f.getMonth() + 1)}/${f.getFullYear()}`
export const diaDe = f => DIAS[f.getDay()]
// "8/10/2026" y "08/10/2026" son el mismo día.
const fechaKey = s => { const f = s instanceof Date ? s : fechaAR(s); return f ? `${f.getFullYear()}-${dd(f.getMonth() + 1)}-${dd(f.getDate())}` : '' }
// El servicio se escribe de varias formas según por dónde pasó ("🎥 Film ½", "Film 1/2"): se compara sin emoji ni signos.
const servicioKey = s => norm(s).replace(/½/g, '1/2').replace(/[^a-z0-9]/g, '')
const personaKey = n => canonKey(canonStaff(txt(n)))

export const queDe = r => { const q = norm(r?.['Qué']); return q.startsWith('confirm') ? 'confirmo' : q.startsWith('no puede') ? 'nopuedo' : q.startsWith('dia no') ? 'dia' : '' }
export const estaVigente = r => !/^anulad/i.test(txt(r?.['Estado']))
export const claveLinea = (persona, nro, servicio, fecha) => [personaKey(persona), txt(nro), servicioKey(servicio), fechaKey(fecha)].join('|')
export const claveDia = (persona, fecha) => personaKey(persona) + '|' + fechaKey(fecha)
/** La llave de una fila de la solapa, sea de un trabajo o de un día suelto. */
export const claveDeFila = r => queDe(r) === 'dia' ? 'dia|' + claveDia(r['Persona'], r['Fecha']) : claveLinea(r['Persona'], r['N° trabajo'], r['Servicio'], r['Fecha'])

/**
 * Todo lo vigente, listo para preguntar: la respuesta a una línea de un trabajo y los días sueltos de cada persona.
 * Si hay dos vigentes sobre lo mismo (alguien lo anotó a mano), vale la de más abajo, que es la última.
 */
export function leerDisponibilidad(filas) {
  const lineas = new Map(), dias = new Map()
  for (const r of (filas || [])) {
    const que = queDe(r); if (!que || !estaVigente(r) || !txt(r['Persona']) || !fechaKey(r['Fecha'])) continue
    const dato = { que, cuando: txt(r['Cargado el']), motivo: txt(r['Motivo']), fecha: dmy(fechaAR(r['Fecha'])) }
    if (que === 'dia') dias.set(claveDia(r['Persona'], r['Fecha']), dato)
    else lineas.set(claveLinea(r['Persona'], r['N° trabajo'], r['Servicio'], r['Fecha']), dato)
  }
  return {
    /** Qué contestó esa persona sobre esa línea: { que: 'confirmo' | 'nopuedo', cuando, motivo } o null. */
    respuesta: (persona, nro, servicio, fecha) => lineas.get(claveLinea(persona, nro, servicio, fecha)) || null,
    /** ¿Avisó que ese día no puede? { motivo, cuando } o null. */
    diaBloqueado: (persona, fecha) => dias.get(claveDia(persona, fecha)) || null,
    /** Los días sueltos de una persona, de hoy en adelante: ['15/10/2026', …] */
    diasDe: (persona, desde) => { const k = personaKey(persona) + '|', d0 = desde ? fechaKey(desde) : ''
      return [...dias.entries()].filter(([c]) => c.startsWith(k) && c.slice(k.length) >= d0).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v.fecha) },
  }
}

/**
 * Las líneas de un trabajo cuya persona avisó que NO puede y sigue cargada: es un puesto sin cubrir aunque el staff
 * figure completo. Solo de hoy en adelante.
 */
export function noPuedenDe(proyecto, dispo, hoy0) {
  if (!proyecto || !dispo) return []
  return lineasDeProyecto(proyecto).filter(l => { const f = fechaAR(l.fecha); if (!f || (hoy0 && f < hoy0)) return false
    return dispo.respuesta(l.nombre, l.nro, l.pedido, l.fecha)?.que === 'nopuedo' })
}

/** ¿Falta poco? Un "no puedo" a menos de 48 hs del trabajo es otra conversación. */
export const esUrgente = (fechaTrabajo, ahora) => !!fechaTrabajo && (fechaTrabajo.getTime() - ahora.getTime()) / 3600e3 < HORAS_URGENTE

/** ¿Se puede marcar ese día como "no puedo"? De hoy hasta 120 días para adelante. */
export const sePuedeBloquear = (fecha, hoy0) => !!fecha && fecha >= hoy0 && (fecha - hoy0) / 864e5 <= DIAS_ADELANTE

export const esPersonaValida = n => !!personaKey(n) && !esMagma(canonStaff(txt(n)))

/** Un ID corto y único: con él se encuentra la fila aunque alguien ordene la solapa. */
export const nuevoIdDisponibilidad = (ahora = Date.now()) => `D-${ahora.toString(36).toUpperCase()}${Math.floor(Math.random() * 36).toString(36).toUpperCase()}`
