// ============================ REPARTO DE JORNADAS ============================
// Cuántas veces se convocó a cada uno en el mes. Nació del contador que ya tenían
// Lucho y Juani por su acuerdo ("6/10 del mes"): el número servía tanto que hacía
// falta para TODOS, no solo para los dos que tienen mínimo pactado.
//
// LA UNIDAD ES LA LÍNEA DE PAGO, no el día de calendario.
// Se probó contar por la columna "Días" del proyecto y no sirve: en #2256
// (Contenidos Digitales Septiembre) Días=30 porque es un abono mensual, y en #2209
// (People Week) Días=2 es la duración del evento aunque Felipe y Lucho fueron un
// día cada uno. La línea de pago es lo único que siempre significa "lo convocaron
// una vez y se le paga por eso" — y es lo mismo que ya cuenta el acuerdo, así que
// el número del formulario y el del gráfico coinciden.
//
// "Fechas Staff" (qué día va cada uno en un trabajo multi-fecha) se usa para saber
// CUÁNDO fue, no cuántas veces.

import { MAX_SLOTS } from './slots.js'
import { esJornada, acuerdoAplica } from './acuerdos.js'
import { canonStaff, canonKey, esMagma } from './staff.js'

const txt = v => String(v ?? '').trim()
const num = v => { if (typeof v === 'number') return v; const n = parseFloat(txt(v).replace(/[$,\s]/g,'')); return isNaN(n) ? 0 : n }
const fechaAR = s => { const m = txt(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (!m) return null
  let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2]-1, +m[1]) }

// Las líneas de staff de un proyecto: una por servicio con persona y precio.
// `rodaje` distingue la convocatoria (ir a filmar) del trabajo de escritorio
// (editar, motion) — para repartir parejo importa a quién hacés levantar temprano.
export function lineasDeProyecto(p) {
  const asig = {}
  txt(p['Fechas Staff']).split('|').forEach(x => { const [k, ...v] = x.split(':'); if (k && v.length) asig[txt(k)] = txt(v.join(':')) })
  const fe = txt(p['Fecha Evento'])
  const out = []
  for (let j = 1; j <= MAX_SLOTS; j++) {
    const pedido = txt(p['Pedido ' + j] || (j === 1 ? p['Pedido'] : ''))
    const quien  = txt(p['Staff ' + j]  || (j === 1 ? p['Staff']  : ''))
    const precio = num(p['Precio ' + j] || (j === 1 ? p['Precio'] : ''))
    // Sin precio todavía cuenta: lo convocaron igual, el monto se carga después.
    if (!quien || esMagma(quien) || !pedido) continue
    const nombre = canonStaff(quien)
    out.push({
      slot: j, nombre, key: canonKey(nombre), pedido, precio,
      fecha: asig[String(j)] || fe,
      rodaje: esJornada(pedido),
      nro: txt(p['N° presupuesto']),
      proyecto: txt(p['Proyecto']) || txt(p['Cliente']) || '—',
      agencia: txt(p['Agencia']),
    })
  }
  return out
}

// Quién llevó cuántas en un mes, de mayor a menor. `soloRodaje` deja afuera edición.
export function repartoDelMes(proyectos, mes, anio, { soloRodaje = true } = {}) {
  const acc = {}
  for (const p of (proyectos || [])) {
    const fe = fechaAR(p['Fecha Evento'])
    if (!fe || fe.getMonth() + 1 !== mes || fe.getFullYear() !== anio) continue
    for (const l of lineasDeProyecto(p)) {
      if (soloRodaje && !l.rodaje) continue
      const a = acc[l.key] || (acc[l.key] = { nombre: l.nombre, key: l.key, jornadas: 0, monto: 0, dias: new Set(), items: [] })
      a.jornadas++; a.monto += l.precio; if (l.fecha) a.dias.add(l.fecha); a.items.push(l)
    }
  }
  return Object.values(acc)
    .map(a => ({ ...a, dias: a.dias.size }))
    .sort((x, y) => y.jornadas - x.jornadas || y.monto - x.monto)
}

// La última vez que se lo convocó (incluye fechas futuras: si ya está agendado
// para la semana que viene, no "hace rato que no lo llamás").
export function ultimaConvocatoria(proyectos, { soloRodaje = true } = {}) {
  const out = {}
  for (const p of (proyectos || [])) {
    const fe = fechaAR(p['Fecha Evento']); if (!fe) continue
    for (const l of lineasDeProyecto(p)) {
      if (soloRodaje && !l.rodaje) continue
      if (!out[l.key] || fe > out[l.key].fecha) out[l.key] = { nombre: l.nombre, fecha: fe }
    }
  }
  return out
}

// Cuántas lleva UNA persona en el mes de una fecha dada. Es lo que muestra el
// formulario de staff al lado del nombre. `excluirNum` saca el proyecto que se
// está editando: sus líneas se cuentan aparte, desde el formulario abierto, para
// que el número se mueva mientras Juan escribe.
export function jornadasDePersona(proyectos, personaKeys, mes, anio, excluirNum, { soloRodaje = true } = {}) {
  const keys = new Set([].concat(personaKeys).filter(Boolean))
  const ex = txt(excluirNum)
  let n = 0
  for (const p of (proyectos || [])) {
    if (ex && txt(p['N° presupuesto']) === ex) continue
    const fe = fechaAR(p['Fecha Evento'])
    if (!fe || fe.getMonth() + 1 !== mes || fe.getFullYear() !== anio) continue
    for (const l of lineasDeProyecto(p)) {
      if (soloRodaje && !l.rodaje) continue
      if (keys.has(l.key)) n++
    }
  }
  return n
}

// Las jornadas de UN acuerdo en el mes de una fecha: solo los trabajos donde el acuerdo vale (ver acuerdoAplica), solo
// rodaje, y en orden. Devuelve la lista ordenada por día (y por N° dentro del mismo día), que es el orden en que se
// gastan las del mínimo: las primeras 10 de Lucho valen $190.000 y de la 11 en adelante $180.000.
// La fecha de cada línea es la suya (Fechas Staff) y no la del proyecto: en Popstars son 30 días y cada jornada es un día.
export function jornadasDelAcuerdo(proyectos, ac, fecha, { excluirNum } = {}) {
  if (!ac || !fecha) return []
  const keys = new Set(ac.keys || []), ex = txt(excluirNum), out = []
  for (const p of (proyectos || [])) {
    if (ex && txt(p['N° presupuesto']) === ex) continue
    if (!acuerdoAplica(ac, p)) continue
    for (const l of lineasDeProyecto(p)) {
      if (!l.rodaje || !keys.has(l.key)) continue
      const f = fechaAR(l.fecha)
      if (!f || f.getMonth() !== fecha.getMonth() || f.getFullYear() !== fecha.getFullYear()) continue
      if ((ac.desde && f < ac.desde) || (ac.hasta && f > ac.hasta)) continue
      out.push({ ...l, _f: f, cliente: txt(p['Cliente']) || txt(p['Agencia']) })
    }
  }
  return out.sort((a, b) => a._f - b._f || (parseInt(a.nro) || 0) - (parseInt(b.nro) || 0) || a.slot - b.slot)
}

// Cuántas de esas van ANTES de una línea dada (su día y su N°): es el "previas" que necesita avisoJornada.
export function previasDelAcuerdo(proyectos, ac, fecha, nro, opts) {
  const n = parseInt(nro) || 0
  return jornadasDelAcuerdo(proyectos, ac, fecha, opts).filter(l => l._f < fecha || (l._f.getTime() === fecha.getTime() && (parseInt(l.nro) || 0) < n)).length
}
