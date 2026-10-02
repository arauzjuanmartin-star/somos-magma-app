import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'
import { getSheets, getAllData, withSheetsRetry } from '../../../lib/sheets'
import { personaPorMail } from '../../../lib/mi-magma'
import { lineasDeProyecto } from '../../../lib/jornadas'
import { canonStaff, canonKey, STAFF_CANON_MAP } from '../../../lib/staff'
import { mailDe, mandarAviso } from '../../../lib/edicion-avisos'
import { mailInternoDe } from '../../../lib/roles'
import { fechaLarga } from '../../../lib/staff-avisos'
import { HOJA_DISPONIBILIDAD, HEADERS_DISPONIBILIDAD, QUE, ESTADO, claveLinea, claveDia, claveDeFila, queDe, estaVigente, fechaAR, dmy, diaDe, esUrgente, sePuedeBloquear, nuevoIdDisponibilidad } from '../../../lib/disponibilidad.mjs'

// Mi Magma: un freelancer contesta sobre SUS fechas (ver lib/disponibilidad.mjs).
//   confirmo    "voy" a un trabajo que tiene cargado
//   nopuedo     "no llego" a ese trabajo. No lo saca del staff: le avisa al PM por mail y queda en rojo hasta que el PM ponga a otro
//   dia         "el 15 no cuenten conmigo", sin trabajo de por medio
//   dia-libre   se arrepintió del anterior
//
// Misma regla que /api/mi/ticket: la persona sale del MAIL DE LA SESIÓN cruzado con RRHH, nunca de algo que mande el
// navegador. Y el trabajo tiene que ser SUYO: se vuelve a buscar en PROYECTOS, no se le cree al formulario.
// Cada respuesta nueva anula la anterior sobre lo mismo (columna Estado): la solapa muestra lo que vale hoy.

const APP = process.env.NEXTAUTH_URL || 'https://somos-magma-app.vercel.app'
const txt = v => String(v ?? '').trim()
const dd = n => String(n).padStart(2, '0')
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
// Un texto que empieza con = + - @ el sheet lo toma como fórmula y deja #ERROR!
const texto = v => { const s = txt(v); return s ? `'${s}` : '' }
const apodoDe = nombre => { const k = Object.keys(STAFF_CANON_MAP).find(a => STAFF_CANON_MAP[a] === nombre && !a.includes(' ')); return k ? k[0].toUpperCase() + k.slice(1) : txt(nombre).split(' ')[0] }
// El PM va con el nombre corto en PROYECTOS ("Lulu"); si no está, el aviso va a Juan. Y a Juan le llega siempre:
// un puesto que se vacía es lo que más le importa, y el PM de la fila puede ya no estar.
const mailsDelPM = (pm, rrhh) => [...new Set([mailInternoDe(pm) || mailDe(pm, rrhh) || 'juan@somosmagma.com', 'juan@somosmagma.com'])]

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Solo para contestar' })
  const session = await getServerSession(req, res, authOptions)
  const mail = session?.user?.email?.toLowerCase()?.trim()
  if (!mail) return res.status(401).json({ ok: false, error: 'No autorizado' })

  const { accion, num: nro, slot, fecha: fechaDia, motivo = '' } = req.body || {}
  if (!['confirmo', 'nopuedo', 'dia', 'dia-libre'].includes(accion)) return res.status(400).json({ ok: false, error: 'No entendí qué querés avisar' })
  const nota = String(motivo).replace(/\s+/g, ' ').trim().slice(0, 200)

  try {
    const data = await getAllData()
    const fila = personaPorMail(data.rrhh, mail)
    if (!fila) return res.status(403).json({ ok: false, error: 'Tu mail no tiene acceso a Mi Magma. Pedíselo a administración.' })
    const persona = canonStaff(txt(fila['Nombre Apellido'])), yo = canonKey(persona)
    const ahora = new Date(Date.now() - 3 * 3600e3)   // hora de Argentina
    const hoy0 = new Date(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate())
    const ahoraAR = new Date(hoy0.getTime() + (ahora.getUTCHours() * 60 + ahora.getUTCMinutes()) * 60e3)
    const cuando = `${dmy(hoy0)} ${dd(ahora.getUTCHours())}:${dd(ahora.getUTCMinutes())}`

    // Sobre qué habla: una línea suya de un trabajo, o un día suelto.
    let p = null, linea = null, fecha = null
    if (accion === 'confirmo' || accion === 'nopuedo') {
      if (!txt(nro) || !Number.isInteger(slot)) return res.status(400).json({ ok: false, error: 'No sé de qué trabajo hablás. Actualizá la página.' })
      p = (data.proyectos || []).find(x => txt(x['N° presupuesto']) === txt(nro))
      linea = p ? lineasDeProyecto(p).find(l => l.slot === slot && l.key === yo) : null
      if (!linea) return res.status(403).json({ ok: false, error: 'Ese trabajo no figura a tu nombre. Actualizá la página y probá de nuevo.' })
      fecha = fechaAR(linea.fecha)
      if (!fecha) return res.status(400).json({ ok: false, error: 'Ese trabajo no tiene fecha todavía.' })
      if (fecha < hoy0) return res.status(400).json({ ok: false, error: 'Ese trabajo ya pasó.' })
    } else {
      fecha = fechaAR(fechaDia)
      if (!fecha) return res.status(400).json({ ok: false, error: 'Elegí un día' })
      if (!sePuedeBloquear(fecha, hoy0)) return res.status(400).json({ ok: false, error: 'Solo se pueden marcar días de hoy en adelante, hasta cuatro meses.' })
      // Si ese día tiene un trabajo, lo que corresponde es contestar sobre el trabajo: el PM necesita saber de cuál.
      const ocupado = accion === 'dia' && (data.proyectos || []).some(x => lineasDeProyecto(x).some(l => l.key === yo && fechaAR(l.fecha)?.getTime() === fecha.getTime()))
      if (ocupado) return res.status(409).json({ ok: false, error: 'Ese día tenés un trabajo cargado. Abrilo desde la agenda y avisá ahí que no podés.' })
    }

    const { sheets, SHEET_ID } = await getSheets()
    let filas = []
    try { filas = (await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${HOJA_DISPONIBILIDAD}!A:${colLetra(HEADERS_DISPONIBILIDAD.length - 1)}` }))).data.values || [] } catch (e) { /* no existe */ }
    const H = (filas[0] || []).map(txt)
    const faltan = HEADERS_DISPONIBILIDAD.filter(h => !H.includes(h))
    if (faltan.length) { console.error(`mi/disponibilidad: a ${HOJA_DISPONIBILIDAD} le faltan columnas: ${faltan.join(', ')}`); return res.status(503).json({ ok: false, error: 'Todavía no se puede contestar desde acá. Avisale a tu PM por mensaje.' }) }
    const objeto = r => Object.fromEntries(H.map((h, i) => [h, r[i] ?? '']))

    // Lo vigente sobre lo mismo: si ya dijo esto, no se repite; si dijo otra cosa, lo anterior se anula.
    const clave = linea ? claveLinea(persona, nro, linea.pedido, fecha) : 'dia|' + claveDia(persona, fecha)
    const previas = filas.map((r, i) => ({ i, o: objeto(r) })).filter(x => x.i > 0 && queDe(x.o) && estaVigente(x.o) && canonKey(canonStaff(x.o['Persona'])) === yo && claveDeFila(x.o) === clave)
    const queNuevo = accion === 'confirmo' ? 'confirmo' : accion === 'nopuedo' ? 'nopuedo' : accion === 'dia' ? 'dia' : ''
    const ultima = previas[previas.length - 1]
    if (queNuevo && ultima && queDe(ultima.o) === queNuevo) return res.json({ ok: true, repetido: true, respuesta: { que: queNuevo, cuando: txt(ultima.o['Cargado el']), motivo: txt(ultima.o['Motivo']), fecha: dmy(fecha) } })
    if (!queNuevo && !previas.length) return res.json({ ok: true, repetido: true })

    const iEstado = H.indexOf('Estado')
    if (previas.length) await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: previas.map(x => ({ range: `${HOJA_DISPONIBILIDAD}!${colLetra(iEstado)}${x.i + 1}`, values: [[ESTADO.anulado]] })) } }))

    let avisados = []
    const titulo = p ? [txt(p['Cliente']) || txt(p['Agencia']), txt(p['Proyecto'])].filter(Boolean).join(' · ') : ''
    const pm = p ? txt(p['PM']) : ''
    if (queNuevo) {
      // Un "no puedo" le llega al PM ya: es un puesto que hay que cubrir. Y si antes había dicho que no y ahora sí, también.
      const seArrepintio = queNuevo === 'confirmo' && ultima && queDe(ultima.o) === 'nopuedo'
      if (queNuevo === 'nopuedo' || seArrepintio) {
        const urgente = esUrgente(fecha, ahoraAR), apodo = apodoDe(persona), faltan = Math.round((fecha - hoy0) / 864e5)
        const servicio = txt(linea.pedido).replace(/^[^\p{L}\p{N}]+/u, '').trim()
        const L = seArrepintio
          ? [`${persona} había avisado que no podía ir a este trabajo y acaba de confirmar que SÍ va.`, '', 'QUÉ', `${servicio} — ${titulo}`, '', 'CUÁNDO', fechaLarga(dmy(fecha)), '', 'Si ya pusiste a otra persona, abrí el trabajo y dejá una sola.']
          : [`${persona} avisó desde Mi Magma que NO PUEDE ir a este trabajo.`, '', 'QUÉ', `${servicio} — ${titulo}`, '', 'CUÁNDO', `${fechaLarga(dmy(fecha))}${faltan <= 0 ? ' · ES HOY' : faltan === 1 ? ' · es mañana' : ` · faltan ${faltan} días`}`,
            ...(nota ? ['', 'POR QUÉ', nota] : []), '', 'QUÉ HACER', `Sigue cargado en el staff: la app no lo saca sola. Abrí el trabajo, poné a otra persona en su lugar y guardá.`, `${APP}/?t=${encodeURIComponent(txt(nro))}`]
        L.push('', '—', `#${txt(nro)}${pm ? ` · PM: ${pm}` : ''}`, 'Somos Magma')
        const asunto = seArrepintio ? `Al final puede: ${apodo} · #${txt(nro)} ${titulo} — ${fechaLarga(dmy(fecha))}`
          : `${urgente ? 'URGENTE · ' : ''}No puede: ${apodo} · #${txt(nro)} ${titulo} — ${fechaLarga(dmy(fecha))}`
        const r = await mandarAviso({ para: mailsDelPM(pm, data.rrhh).join(', '), asunto, cuerpo: L.join('\n') })
        if (r.ok) avisados = r.para.split(',').map(txt)
      }
      const dato = {
        'ID': nuevoIdDisponibilidad(), 'Cargado el': texto(cuando), 'Persona': texto(persona), 'Fecha': dmy(fecha), 'Día': diaDe(fecha), 'Qué': QUE[queNuevo],
        'N° trabajo': texto(nro), 'Trabajo': texto(titulo), 'Servicio': linea ? texto(linea.pedido) : '', 'Motivo': texto(nota), 'Estado': ESTADO.vigente, 'PM': texto(pm), 'Avisado a': avisados.join(', '),
      }
      // Sin INSERT_ROWS a propósito (igual que TICKETS): debajo no hay nada que pisar y la fila toma el formato del cuerpo.
      await withSheetsRetry(() => sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: `${HOJA_DISPONIBILIDAD}!A:${colLetra(H.length - 1)}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [H.map(h => (h in dato ? dato[h] : ''))] } }))
    }
    try { await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'mi-disponibilidad', HOJA_DISPONIBILIDAD, txt(nro) || dmy(fecha), `${persona} ${accion} ${dmy(fecha)}${nota ? ' · ' + nota : ''}`]] } }) } catch (e) { /* el log no frena */ }

    res.json({ ok: true, respuesta: queNuevo ? { que: queNuevo, cuando, motivo: nota, fecha: dmy(fecha) } : null, avisados, pm })
  } catch (e) {
    console.error('mi/disponibilidad:', e)
    res.status(500).json({ ok: false, error: 'No se pudo guardar. Probá de nuevo en un minuto.' })
  }
}
