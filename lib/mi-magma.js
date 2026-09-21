// ============================== MI MAGMA ==============================
// Lo que ve UN freelancer de sí mismo: su agenda, lo que tiene para facturar, en qué
// anda lo que filmó y su ficha. Nace de la reunión de equipo del 18/9/2026: pidieron
// el detalle para facturar en orden, saber más de lo que van a grabar y ver sus
// trabajos cuando se entregan. La idea de Juan: sacar WhatsApp del medio.
//
// Este archivo es la ADUANA. Recibe el sheet entero (getAllData) y devuelve solo lo
// de una persona. Reglas que no se negocian:
//   · de plata, únicamente SUS montos — nunca el total del proyecto, el fee ni lo
//     que cobra el compañero que va con él
//   · de los demás, el nombre de pila y qué hacen, para saber con quién va
//   · los datos bancarios van tapados: alcanza para que confirme que son los suyos
//   · nada de texto libre escrito para otro público (Observaciones del presupuesto,
//     bitácora de edición): ahí hay precios al cliente y charla interna
// Si algo no está en lo que arma `misDatos`, el navegador del freelancer no lo recibe.
//
// Archivo puro (sin googleapis): lo usan /api/mi y los scripts de verificación.

import { lineasDeProyecto } from './jornadas.js'
import { canonStaff, canonKey, esMagma, STAFF_CANON_MAP } from './staff.js'
import { acuerdosVigentes } from './acuerdos.js'
import { limpiarPedido, estadoDe, estaCerrado, esPedidoEdicion, esPedidoFoto } from './edicion.js'

const txt = v => String(v ?? '').trim()
const norm = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
// El sheet guarda los montos en formato US ("$190,000.00"): mismo criterio que parseMonto de index.js.
const num = v => { if (typeof v === 'number') return v; const n = parseFloat(txt(v).replace(/[$,\s]/g, '')); return isNaN(n) ? 0 : n }
const fechaAR = s => { const m = txt(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (!m) return null
  let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]) }
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const dd = n => String(n).padStart(2, '0')
const primerNombre = n => txt(n).split(' ')[0]
// Cómo lo llaman: a Jorge Luis Chavez nadie le dice Jorge. El apodo sale del mismo mapa
// con el que la app ya reconoce "Lucho", "Tutu" o "Pocho" en el sheet.
const apodoDe = nombre => { const k = Object.keys(STAFF_CANON_MAP).find(a => STAFF_CANON_MAP[a] === nombre && !a.includes(' '))
  return k ? k[0].toUpperCase() + k.slice(1) : primerNombre(nombre) }

// La columna de RRHH que abre la puerta. Juan, 22/9/2026: "se lo mandaría a los fijos que
// tengo; después, si se va sumando gente, se los paso". Entonces tener el mail cargado NO
// alcanza: entra solo a quien Magma le dio el acceso (el tilde en su ficha, o "SÍ" en el
// sheet). Si la columna no existe todavía, no entra nadie.
export const COL_ACCESO = 'Acceso Mi Magma'
export const tieneAcceso = r => /^(s[ií]|x|true|1|✓)$/i.test(txt(r?.[COL_ACCESO]))

// Quién es, en RRHH, la persona que entró con este mail. Si el mail aparece en dos
// fichas no entra ninguna: mejor trabar la puerta que mostrarle a uno lo del otro.
export function personaPorMail(rrhh, mail) {
  const m = norm(mail)
  if (!m || !m.includes('@')) return null
  const filas = (rrhh || []).filter(r => norm(r.Mail) === m && txt(r['Nombre Apellido'] || r.Nombre))
  if (filas.length !== 1) return null
  if (!tieneAcceso(filas[0])) return null
  if (/inactiv|baja/i.test(txt(filas[0].Estado))) return null
  return filas[0]
}

// Las 7 clases de video, como se las explicaría Juan al que va a filmar.
const CLASE_EXPLICADA = {
  'charla o corporativo': 'Cobertura formal de una charla: que se entienda quién habla y qué dice.',
  'cobertura para la agencia': 'Mostrar qué hicieron ELLOS en el evento: en qué pusieron la plata.',
  'activacion de marca': 'Gente interactuando con el producto y el stand, promotoras, regalos.',
  'entrevista o testimonio': 'Alguien a cámara + inserts. Cuidar el audio y tener planos de apoyo.',
  'solo imagenes': 'Video corto de redes, sin nadie hablando: planos lindos y variados.',
  'inserto en video de un tercero': 'Nuestro material va adentro del video de otro: respetar su formato.',
  'motion': 'Es animación: lo que se filma es material de apoyo.',
}

const tapar = (v, ver = 4) => { const s = txt(v).replace(/\s/g, ''); return s ? '•'.repeat(Math.max(3, Math.min(8, s.length - ver))) + s.slice(-ver) : '' }

export function misDatos(data, nombre, hoy = new Date()) {
  const quien = canonStaff(txt(nombre)), yo = canonKey(quien)
  if (!yo || esMagma(quien)) return null
  const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())

  const presu = new Map((data.presupuestos || []).map(p => [txt(p['Columna 1']), p]))
  const edPorNum = new Map()
  ;(data.edicion || []).forEach(f => { const k = txt(f['N° presupuesto']); if (!k || !txt(f.ID)) return; (edPorNum.get(k) || edPorNum.set(k, []).get(k)).push(f) })

  // ---- todas mis líneas: una por cada vez que me convocaron
  const mias = []
  for (const p of (data.proyectos || [])) {
    const lineas = lineasDeProyecto(p)
    const propias = lineas.filter(l => l.key === yo)
    if (!propias.length) continue
    const pr = presu.get(txt(p['N° presupuesto'])) || {}
    const pedidos = Object.keys(p).filter(c => /^Pedido \d+$/.test(c)).map(c => txt(p[c])).filter(Boolean)
    for (const l of propias) {
      const f = fechaAR(l.fecha)
      mias.push({
        num: l.nro, slot: l.slot, fecha: f ? `${dd(f.getDate())}/${dd(f.getMonth() + 1)}/${f.getFullYear()}` : '', _f: f,
        rol: limpiarPedido(l.pedido), _pedido: l.pedido, rodaje: l.rodaje, monto: l.precio,
        cliente: txt(p.Cliente) || txt(p.Agencia), agencia: txt(p.Agencia), proyecto: txt(p.Proyecto),
        pm: txt(p.PM) || txt(pr['PM Interno']),
        // OJO: las Observaciones del presupuesto NO viajan. Son del PM para adentro y para el
        // cliente: en #2313 dicen "Precio por jornada: $700.000" — lo que paga el cliente, a la
        // vista de quien cobra $220.000. Lo que haya que decirle al que filma va en un campo
        // escrito para él (Referencias / nota del PM), no reciclando este.
        horario: txt(pr.Horario), lugar: txt(pr['Ubicación']),
        clase: txt(pr['Ed. Clase']), claseExplicada: CLASE_EXPLICADA[norm(pr['Ed. Clase'])] || '',
        formato: txt(pr['Ed. Formato']), red: txt(pr['Ed. Red']), grafica: txt(pr['Ed. Gráfica']),
        // Con quién va: nombre de pila y qué hace. Sin montos.
        equipo: lineas.filter(o => o.key !== yo && (!o.fecha || !l.fecha || o.fecha === l.fecha)).map(o => ({ quien: apodoDe(o.nombre), rol: limpiarPedido(o.pedido) })),
        // Qué sale de lo que filma: le dice para qué está grabando.
        sale: pedidos.filter(x => esPedidoEdicion(x) || esPedidoFoto(x)).map(limpiarPedido),
        driveCrudo: txt(p['Drive Crudo']),
      })
    }
  }
  mias.sort((a, b) => (a._f?.getTime() || 0) - (b._f?.getTime() || 0) || a.slot - b.slot)

  // ---- agenda: de hoy en adelante
  const proximos = mias.filter(m => m._f && m._f >= hoy0).map(({ _f, _pedido, ...m }) => ({ ...m, esHoy: _f.getTime() === hoy0.getTime(),
    sePaga: `15/${dd(((_f.getMonth() + 1) % 12) + 1)}`, falta: [!m.horario && 'el horario', !m.lugar && 'el lugar'].filter(Boolean) }))

  // ---- para facturar: este mes y los tres anteriores, día por día.
  // "Pagado" se calcula IGUAL que en Pagos Staff (misma llave: persona + mes + N° + servicio,
  // contando filas pagadas), para que el freelancer vea el mismo número que administración.
  const esPagRow = r => ['PAGADO', 'SÍ', 'SI', 'TRUE'].includes(txt(r.Estado || r.Pagado).toUpperCase()) || num(r['Monto Pagado']) > 0
  const keyPago = (persona, mesLabel, nro, servicio) => canonKey(canonStaff(persona)) + '|' + norm(mesLabel) + '|' + txt(nro) + '|' + norm(servicio)
  const pagadas = {}, viaticos = {}
  ;(data.pagosStaff || []).forEach(r => {
    const persona = r.Freelancer || r.Persona || r.Nombre; if (canonKey(canonStaff(persona)) !== yo) return
    const k = keyPago(persona, r['Mes Referencia'] || r.Mes, r['N° Presupuesto'] || r['N° Proyecto'], r.Servicio)
    ;(viaticos[k] = viaticos[k] || []).push(num(r['Viáticos'] || r.Viaticos))
    if (esPagRow(r)) pagadas[k] = (pagadas[k] || 0) + 1
  })
  const meses = []
  for (let i = 0; i < 4; i++) {
    const d = new Date(hoy0.getFullYear(), hoy0.getMonth() - i, 1), m = d.getMonth(), y = d.getFullYear()
    const mesLabel = `${dd(m + 1)} - ${MESES[m].toLowerCase()}`
    const usadas = {}, usadasV = {}
    const lineas = mias.filter(x => x._f && x._f.getMonth() === m && x._f.getFullYear() === y).map(x => {
      // El servicio tal como está en PROYECTOS (con emoji): así se guarda en PAGOS_STAFF.
      const k = keyPago(quien, mesLabel, x.num, x._pedido)
      const u = usadas[k] || 0, pagado = u < (pagadas[k] || 0); if (pagado) usadas[k] = u + 1
      const uv = usadasV[k] || 0; usadasV[k] = uv + 1
      return { fecha: x.fecha, dia: x.fecha.slice(0, 5), rol: x.rol, cliente: x.cliente, proyecto: x.proyecto, num: x.num, monto: x.monto, viaticos: (viaticos[k] || [])[uv] || 0, pagado, yaFue: x._f < hoy0 }
    })
    if (!lineas.length && i > 0) continue
    const total = lineas.reduce((s, l) => s + l.monto + l.viaticos, 0), pagado = lineas.filter(l => l.pagado).reduce((s, l) => s + l.monto + l.viaticos, 0)
    const pago = new Date(y, m + 1, 15)
    meses.push({ clave: `${y}-${dd(m + 1)}`, nombre: MESES[m], enCurso: i === 0, lineas, total, pagado, pendiente: total - pagado,
      faltanHacer: lineas.filter(l => !l.yaFue).length, sePaga: `15/${dd(pago.getMonth() + 1)}/${pago.getFullYear()}` })
  }

  // ---- cómo quedó: lo que filmó en los últimos 90 días y en qué anda la edición, dicho para él
  const desde = new Date(hoy0.getTime() - 90 * 864e5), vistos = new Set(), entregas = []
  for (const m of [...mias].reverse()) {
    if (!m._f || m._f >= hoy0 || m._f < desde || !m.rodaje || vistos.has(m.num)) continue
    vistos.add(m.num)
    const piezas = (edPorNum.get(m.num) || []).map(f => ({ pieza: limpiarPedido(f.Entregable), estado: estadoDe(f.Estado), cerrada: estaCerrado(f.Estado) }))
    if (!piezas.length) continue
    const listas = piezas.filter(x => x.cerrada).length
    const etapa = listas === piezas.length ? 'entregado' : piezas.some(x => x.estado === 'Con el cliente') ? 'cliente'
      : piezas.every(x => x.estado === 'Sin material') ? 'espera' : 'edicion'
    const proy = (data.proyectos || []).find(p => txt(p['N° presupuesto']) === m.num) || {}
    entregas.push({ num: m.num, fecha: m.fecha, cliente: m.cliente, proyecto: m.proyecto, etapa, piezas: piezas.length, listas,
      texto: { entregado: 'Entregado', cliente: 'Lo está mirando el cliente', edicion: 'En edición', espera: 'Esperando el material' }[etapa],
      // El link solo cuando ya salió: antes de eso puede haber versiones que no son la final.
      link: etapa === 'entregado' ? txt(proy['Drive Finales']) : '' })
  }

  // ---- mi ficha
  const r = (data.rrhh || []).find(x => canonKey(canonStaff(x['Nombre Apellido'] || x.Nombre)) === yo) || {}
  const ac = acuerdosVigentes(data.acuerdos, hoy).find(a => a.keys.includes(yo))
  const ficha = { nombre: quien, rubro: txt(r.Rubro), zona: txt(r.Zona), mail: txt(r.Mail), celular: tapar(r.Celular, 4),
    banco: txt(r.Banco), alias: tapar(r.Alias, 3), cbu: tapar(r.CBU, 4), cuit: tapar(r['CUIT/CUIL'], 3),
    acuerdo: ac ? { alcance: ac.alcance, minimo: ac.minimo, precio: ac.precio, precioExtra: ac.precioExtra } : null,
    trabajos: mias.length }

  return { quien, primerNombre: apodoDe(quien), hoy: `${dd(hoy0.getDate())}/${dd(hoy0.getMonth() + 1)}/${hoy0.getFullYear()}`, proximos, meses, entregas, ficha }
}
