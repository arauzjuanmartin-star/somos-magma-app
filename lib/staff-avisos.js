// Aviso al freelancer cuando se lo asigna a un trabajo.
//
// Hasta ahora la app escribía el staff en PROYECTOS y en PAGOS_STAFF y no le
// avisaba a nadie: al que iba a filmar se le escribía por WhatsApp a mano, y lo
// que cobraba se lo enteraba después. El pedido de Juan (07/09/2026) fue que al
// aprobar el presupuesto y poner quién va, a esa persona le llegue el mail con
// todo, la plata incluida.
//
// Sale UNA sola vez por asignación: cuando se crea, y cuando le cambian el monto
// (que es lo otro que la persona necesita saber). Guardar la misma pantalla dos
// veces no le manda dos mails.

import { mandarAviso } from './edicion-avisos.js'

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']

export const plata = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')

const parseAR = s => {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return null
  let y = +m[3]; if (y < 100) y += 2000
  const d = new Date(y, +m[2] - 1, +m[1])
  return isNaN(d) ? null : d
}

// "miércoles 3 de septiembre" — el día de la semana importa: es lo primero que
// mira alguien para saber si puede.
export const fechaLarga = s => {
  const d = parseAR(s)
  return d ? `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}` : String(s || '')
}

// El 15 de cada mes se paga TODO el mes anterior. Un trabajo de septiembre se
// cobra el 15 de octubre: decirlo evita la mitad de los mensajes de "¿cuándo cobro?".
export const cuandoSePaga = fechaEvento => {
  const d = parseAR(fechaEvento) || new Date()
  const m = (d.getMonth() + 1) % 12
  const y = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear()
  return `el 15 de ${MESES[m]}${y !== new Date().getFullYear() ? ' de ' + y : ''}`
}

/**
 * Devuelve {para, asunto, cuerpo} o null si no hay a quién mandarle.
 *
 * @param persona  {nombre, mail, servicio, monto}
 * @param trabajo  {num, cliente, agencia, proyecto, fechaEvento, fechasAdic, horario, ubicacion, contactoLugar, pm}
 * @param motivo   'nuevo' | 'cambio'
 */
export function armarAvisoStaff({ persona, trabajo, motivo = 'nuevo' }) {
  const para = String(persona?.mail || '').trim()
  if (!/@/.test(para)) return null

  const quien = String(persona.nombre || '').trim().split(/\s+/)[0]
  const cliente = String(trabajo.cliente || trabajo.agencia || '').trim()
  const titulo = [cliente, String(trabajo.proyecto || '').trim()].filter(Boolean).join(' · ')

  // Un trabajo de varias fechas se dice entero: "3, 4 y 5 de septiembre" y no
  // solo el primer día, que es como se arman los malentendidos.
  const dias = [trabajo.fechaEvento, ...String(trabajo.fechasAdic || '').split('|')]
    .map(x => String(x || '').trim()).filter(Boolean)
  const cuando = dias.length > 1
    ? dias.map(fechaLarga).join(' · ') + `  (${dias.length} fechas)`
    : fechaLarga(trabajo.fechaEvento)

  // El staff muchas veces se carga DESPUÉS del rodaje, para saber qué pagar. Ahí un
  // "te sumamos a este trabajo" queda ridículo: lo que sirve es la confirmación de
  // lo que hizo y lo que va a cobrar.
  const d = parseAR(trabajo.fechaEvento)
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const yaPaso = d && d < hoy

  const L = []
  L.push(motivo === 'cambio'
    ? `Hola ${quien}, te cambiamos lo acordado para este trabajo.`
    : yaPaso
      ? `Hola ${quien}, te confirmamos lo que quedó registrado de este trabajo.`
      : `Hola ${quien}, te sumamos a este trabajo.`)
  L.push('', 'QUÉ', `${String(persona.servicio || 'Cobertura').replace(/^[^\p{L}\p{N}]+/u, '').trim()} — ${titulo}`)
  L.push('', 'CUÁNDO', cuando + (String(trabajo.horario || '').trim() ? ` · ${trabajo.horario}` : yaPaso ? '' : ' · horario a confirmar'))
  // Para un trabajo que ya pasó, dónde era y quién recibía no le sirven a nadie.
  if (!yaPaso) {
    const donde = String(trabajo.ubicacion || '').trim()
    L.push('', 'DÓNDE', donde || 'La dirección te la pasamos apenas la tengamos.')
    if (String(trabajo.contactoLugar || '').trim()) L.push(`En el lugar te recibe: ${trabajo.contactoLugar}`)
  }
  L.push('', 'CUÁNTO', `${plata(persona.monto)} — se paga ${cuandoSePaga(trabajo.fechaEvento)}.`)
  L.push('', yaPaso
    ? `Si el monto no coincide con lo que habíamos hablado, respondé este mail antes del 15.`
    : `Si algo no cierra (la fecha, el horario, el monto), respondé este mail antes de que lo demos por cerrado.`)
  L.push('', '—', `#${trabajo.num}${trabajo.pm ? ` · PM: ${trabajo.pm}` : ''}`, 'Somos Magma')

  return {
    para,
    asunto: `${motivo === 'cambio' ? 'Cambio' : yaPaso ? 'Confirmación' : 'Te sumamos'}: #${trabajo.num} ${titulo} — ${fechaLarga(trabajo.fechaEvento)}`,
    cuerpo: L.join('\n'),
  }
}

export { mandarAviso }
