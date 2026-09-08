// Crea, actualiza o borra un evento del Calendar Somos Magma según el estado del presupuesto.
// Se llama desde presupuesto-estado.js cuando el estado cambia.
//
// Convenciones:
// - Color 5 (amarillo banana) = EN ESPERA (presu cargado pero no confirmado)
// - Color 10 (verde básico)   = APROBADO
// - Sin evento                = DESAPROBADO / REPRESUPUESTADO (lo borramos si existe)

import { google } from 'googleapis'
import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { compartirCarpeta } from '../../lib/drive'

const CALENDAR_ID = '5gc9hdvh4vi28bf8uemr2vfnn4@group.calendar.google.com'

function getCalendarAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/calendar'],
    // Domain-Wide Delegation: el robot actúa en nombre de este usuario para poder INVITAR al staff (RSVP).
    clientOptions: { subject: process.env.CALENDAR_AS || 'sofi@somosmagma.com' },
  })
}

// Parse "15/3/2026" o "15/3/26" → "2026-03-15"
function parseFecha(s) {
  const parts = String(s||'').split('/')
  if (parts.length !== 3) return null
  const [d, m, y] = parts
  const yyyy = y.length === 4 ? y : '20' + y
  return `${yyyy}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
}

// Genera las fechas (ISO) de un evento según tipo dia/rango/multi/tentativa
function fechasEvento(fechaPrincipal, tipoFechas, fechasAdicionales) {
  const f0 = parseFecha(fechaPrincipal)
  if (!f0) return { type: 'dia', dia: f0, fechas: [] }
  const tipo = String(tipoFechas||'').toLowerCase().trim()
  const ad = String(fechasAdicionales||'').trim()
  if (tipo === 'rango' && ad) {
    const f1 = parseFecha(ad)
    // Solo es rango válido si el fin es >= inicio. Si no (fin antes del inicio, o sin fin),
    // lo tratamos como un día suelto — así un rango viejo desactualizado no rompe el evento.
    if (f1 && f1 >= f0) return { type: 'rango', desde: f0, hasta: f1, fechas: [f0, f1] }
    return { type: 'dia', dia: f0, fechas: [f0] }
  }
  if ((tipo === 'multi' || tipo === 'tentativa') && ad) {
    // Los días sin confirmar vienen marcados con "?" en la misma columna (ver lib/fechas.js)
    const partes = ad.split('|').filter(Boolean).map(x => x.trim())
    const tent = partes.filter(x => x.startsWith('?')).map(x => parseFecha(x.slice(1))).filter(Boolean)
    const firmes = partes.filter(x => !x.startsWith('?')).map(parseFecha).filter(Boolean)
    if (tipo === 'tentativa') {
      const todas = [...new Set([f0, ...firmes, ...tent])].sort()
      return { type: 'tentativa', fechas: todas, tentativos: todas }
    }
    return { type: 'multi', fechas: [...new Set([f0, ...firmes])].sort(), tentativos: [...new Set(tent)].sort() }
  }
  if (tipo === 'tentativa') return { type: 'tentativa', fechas: [f0], tentativos: [f0] }
  return { type: 'dia', dia: f0, fechas: [f0], tentativos: [] }
}

// Un slot = un evento de Google. Un día suelto es un slot; un rango corrido es UN
// solo evento all-day que abarca el bloque; varias fechas salteadas son un evento
// por día (antes iba uno solo con el resto escrito en la descripción, y el equipo
// no las veía en su agenda); y una tentativa es un único bloque gris de punta a punta.
const MAX_SLOTS_CAL = 60
// Los días sin confirmar de un mismo trabajo se juntan en UN bloque, aunque el
// trabajo ya tenga días firmes: Popstars filmó el 3 y el 4, y lo que queda del mes
// es un solo bloque gris hasta que se definan.
const bloqueTentativo = t => t && t.length ? [{ desde: t[0], hasta: t[t.length-1], allDay: true, tentativo: true }] : []
function slotsDeCalendario(fechas) {
  const tent = bloqueTentativo(fechas.tentativos)
  if (fechas.type === 'tentativa') return tent
  if (fechas.type === 'rango') return [{ desde: fechas.desde, hasta: fechas.hasta, allDay: true }]
  if (fechas.type === 'multi') return [...fechas.fechas.slice(0, MAX_SLOTS_CAL).map(d => ({ desde: d, hasta: d })), ...tent]
  return [{ desde: fechas.dia, hasta: fechas.dia }]
}

// Marca con un tag único en la descripción para encontrar el evento después por presupuesto
const tagPresu = (num) => `[SOMOS_MAGMA_PRESU:${num}]`

// TODOS los eventos del presupuesto, no el primero: un trabajo de varias fechas
// tiene un evento por día. Buscar de a uno dejaba fantasmas al borrar (pasó con el
// #2147 Popstars: 5 eventos huérfanos en el Calendar).
async function buscarEventosPorPresu(cal, num) {
  // Ventana amplia: un presu de noviembre cargado en marzo tiene que entrar
  const ahora = new Date()
  const desde = new Date(ahora); desde.setMonth(desde.getMonth()-12)
  const hasta = new Date(ahora); hasta.setMonth(hasta.getMonth()+24)
  const tag = tagPresu(num)
  const r = await cal.events.list({
    calendarId: CALENDAR_ID,
    timeMin: desde.toISOString(),
    timeMax: hasta.toISOString(),
    q: tag,
    maxResults: 250,
    singleEvents: true,
  })
  return (r.data.items || []).filter(e => String(e.description||'').includes(tag))
}
// El día en el que cae un evento — la llave con la que se cruza con las fechas del sheet
const diaDeEvento = e => e.start?.date || String(e.start?.dateTime||'').slice(0,10)
// El último día que ocupa. En un all-day el `end.date` de Google es exclusivo, así
// que el día real es el anterior. Hace falta para saber si el evento ya terminó: un
// bloque del 1 al 30 EMPIEZA en el pasado pero sigue vigente, y mirar sólo el
// arranque lo dejaba clavado tapando todo el mes.
const finDeEvento = e => {
  if (e.end?.date) return new Date(new Date(`${e.end.date}T12:00:00Z`).getTime() - 864e5).toISOString().slice(0,10)
  return String(e.end?.dateTime || e.start?.dateTime || '').slice(0,10) || diaDeEvento(e)
}

// Sincronizar un trabajo de varias fechas son varias llamadas a Google + tres
// lecturas del sheet: los 10s que da Vercel por defecto no alcanzan.
export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { num, accion } = req.body
  if (!num || !accion) return res.status(400).json({ error: 'Falta num o accion' })

  try {
    // BORRAR va PRIMERO y no toca el sheet. El front llama con accion='borrar' justo
    // DESPUÉS de eliminar la fila del presupuesto (presupuesto-eliminar): si acá leíamos
    // el presu antes, el 404 de "Presupuesto no encontrado" cortaba el flujo y el evento
    // quedaba huérfano en el Calendar para siempre. Bug encontrado 2026-08-31 con el
    // #2147 Cabify/Telefe/Popstars (5 eventos fantasma en total).
    if (accion === 'borrar') {
      const calDel = google.calendar({ version: 'v3', auth: getCalendarAuth() })
      const evs = await buscarEventosPorPresu(calDel, num)
      if (!evs.length) return res.json({ ok: true, accion: 'no-existia' })
      // sendUpdates:'all' → si había staff invitado le llega la cancelación
      for (const ev of evs) {
        try { await calDel.events.delete({ calendarId: CALENDAR_ID, eventId: ev.id, sendUpdates: 'all' }) } catch (e) {}
      }
      const ev = evs[0]
      try {
        const { sheets: sh, SHEET_ID: SID } = await getSheets()
        await sh.spreadsheets.values.append({
          spreadsheetId: SID,
          range: 'LOG!A:F',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[new Date().toISOString(), mail, 'calendar-evento', 'CALENDAR', String(num), `borrado x${evs.length} ${ev.summary || ''}`]] },
        })
      } catch (e) {}
      return res.json({ ok: true, accion: 'borrado', eventId: ev.id, borrados: evs.length })
    }

    // Leer datos del presupuesto del sheet (Fecha Evento, Cliente, Agencia, Proyecto, Tipo Fechas, Fechas Adicionales)
    const { sheets, SHEET_ID } = await getSheets()
    const rPres = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A1:DI2000' })
    const headers = rPres.data.values?.[0] || []
    const fila = (rPres.data.values || []).slice(1).find(r => String(r[0]||'').trim() === String(num).trim())
    if (!fila) return res.status(404).json({ error: 'Presupuesto no encontrado' })

    const get = (h) => fila[headers.indexOf(h)] || ''
    const fechaEv = get('Fecha Evento')
    const cliente = get('Cliente')
    const agencia = get('Agencia')
    const proyecto = get('Proyecto')
    const tipoFechas = get('Tipo Fechas')
    const fechasAd = get('Fechas Adicionales')
    const pm = get('PM Interno')
    const horario = get('Horario')
    const ubicacion = get('Ubicación')
    const contactoLugar = get('Contacto Lugar')
    const contacto = get('Contacto')
    let staffAttendees = [], staffSinMail = [], compartidoCrudo = null

    const calAuth = getCalendarAuth()
    const cal = google.calendar({ version: 'v3', auth: calAuth })

    // Buscar los eventos que ya existen para este presupuesto
    const existentes = await buscarEventosPorPresu(cal, num)

    // Necesitamos fecha para crear/actualizar
    if (!fechaEv) return res.status(400).json({ error: 'Presupuesto sin Fecha Evento — no puedo agendar' })

    // Color según estado de la acción
    // 5 = amarillo (en espera) · 10 = verde (aprobado)
    const colorId = accion === 'aprobar' ? '10' : '5'

    // Parsear horario tipo "8:00 a 18:00 hs" → {h1: "08:00", h2: "18:00"}
    const parseHorario = (s) => {
      const m = String(s||'').match(/(\d{1,2})[:.]?(\d{0,2})\s*(?:a|hasta|-)\s*(\d{1,2})[:.]?(\d{0,2})/i)
      if (!m) return null
      const pad = n => String(n).padStart(2,'0')
      return {
        h1: pad(parseInt(m[1])) + ':' + (m[2]?pad(parseInt(m[2])):'00'),
        h2: pad(parseInt(m[3])) + ':' + (m[4]?pad(parseInt(m[4])):'00'),
      }
    }
    const horas = parseHorario(horario)

    // Generar título y descripción del evento
    const partesNombre = [cliente, agencia && agencia !== cliente ? agencia : null].filter(Boolean).join(' · ')
    const titulo = `#${num} · ${partesNombre || 'Magma'} · ${proyecto || 'Cobertura'}`
    const descripcionPartes = [
      `Cliente: ${cliente || '—'}`,
      `Agencia: ${agencia || '—'}`,
      `Proyecto: ${proyecto || '—'}`,
      `PM: ${pm || '—'}`,
    ]
    // Datos operativos del día (lo que pide el equipo) — SIN el presupuesto ($) porque se invita a freelancers
    // Sin horario los chicos no saben ni si es a la mañana. Decirlo es mejor que
    // dejar el campo afuera y que cada uno suponga.
    descripcionPartes.push(horario ? `⏰ Horario: ${horario}` : '⏰ Horario: A CONFIRMAR — te avisamos apenas lo tengamos')
    if (ubicacion) descripcionPartes.push(`📍 Ubicación: ${ubicacion}`)
    else descripcionPartes.push('📍 Ubicación: A CONFIRMAR')
    if (contacto) descripcionPartes.push(`📞 Contacto: ${contacto}`)
    if (contactoLugar) descripcionPartes.push(`👤 Contacto en el lugar: ${contactoLugar}`)

    // Staff asignado (desde PROYECTOS) — para que en el Calendar se vea quién va
    if (accion === 'aprobar') {
      try {
        const rProy = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:ER' })
        const pHeaders = rProy.data.values?.[0] || []
        const pCol = pHeaders.indexOf('N° presupuesto')
        const pFila = (rProy.data.values || []).slice(1).find(r => String(r[pCol]||'').trim() === String(num).trim())
        if (pFila) {
          const staffList = []
          pHeaders.forEach((h, i) => {
            const ht = String(h||'').trim()
            if ((ht === 'Staff' || /^Staff \d+$/.test(ht)) && pFila[i]) {
              const nombre = String(pFila[i]).trim()
              if (nombre && nombre !== 'Somos Magma') staffList.push(nombre)
            }
          })
          const uniqStaff = [...new Set(staffList)]
          if (uniqStaff.length) descripcionPartes.push(`🎥 Staff: ${uniqStaff.join(', ')}`)
          // Buscar el mail de cada uno en RRHH para invitarlos al evento
          try {
            const rRRHH = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'RRHH!A:D' })
            const rh = rRRHH.data.values || []
            const iNom = (rh[0]||[]).indexOf('Nombre Apellido'), iMail = (rh[0]||[]).indexOf('Mail')
            const mailDe = {}
            rh.slice(1).forEach(r => { const n = String(r[iNom]||'').trim().toLowerCase(); const m = String(r[iMail]||'').trim(); if (n && /@/.test(m)) mailDe[n] = m })
            uniqStaff.forEach(n => { const m = mailDe[n.toLowerCase()]; if (m) staffAttendees.push({ email: m, displayName: n }); else staffSinMail.push(n) })
          } catch (e) { /* si falla RRHH, seguimos sin invitar */ }
        }
      } catch (e) { /* no bloquea */ }
    }
    // Dónde sube el material el que filma. Sin esto la citación le dice cuándo y
    // dónde ir, pero no qué hacer con lo que graba — y termina por WhatsApp.
    if (accion === 'aprobar') {
      try {
        const rP2 = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:ET' })
        const rows2 = rP2.data.values || [], h2 = rows2[0] || []
        const f2 = rows2.slice(1).find(r => String(r[h2.indexOf('N° presupuesto')] || '').trim() === String(num).trim())
        const crudo = f2 ? String(f2[h2.indexOf('Drive Crudo')] || '').trim() : ''
        const entrega = f2 ? String(f2[h2.indexOf('Drive Entrega')] || '').trim() : ''
        // Si lo invitamos a filmar, tiene que poder subir. La citación le da el link y
        // le dice "entrás con tu propio mail": sin esto era mentira — la carpeta se creaba
        // al aprobar pero sólo se compartía a mano desde Edición, y el freelancer se
        // encontraba con "no tenés permiso" el día del rodaje.
        const idCarpeta = (crudo.match(/\/folders\/([A-Za-z0-9_-]+)/) || [])[1]
        if (idCarpeta && staffAttendees.length) {
          try { compartidoCrudo = await compartirCarpeta(idCarpeta, staffAttendees.map(a => a.email)) } catch (e) {}
        }
        if (crudo || entrega) {
          descripcionPartes.push('', '— DÓNDE SUBIR EL MATERIAL —')
          if (crudo) descripcionPartes.push(`📤 Video crudo: ${crudo}`)
          if (entrega) descripcionPartes.push(`📸 Fotos ya editadas: ${entrega}`)
          descripcionPartes.push(
            'Entrás con tu propio mail, el mismo al que te llegó esta invitación.',
            'No hace falta la contraseña de nadie y no te ocupa espacio en tu Drive.',
          )
        }
      } catch (e) { /* si falla, la citación sale igual */ }
    }

    descripcionPartes.push(
      '',
      `Estado: ${accion === 'aprobar' ? 'APROBADO ✓' : 'EN ESPERA'}`,
      '',
      tagPresu(num),
    )
    const descripcion = descripcionPartes.join('\n')

    const fechas = fechasEvento(fechaEv, tipoFechas, fechasAd)
    const slots = slotsDeCalendario(fechas)
    const TZ = 'America/Argentina/Buenos_Aires'

    // Un bloque tentativo avisa que los días están reservados, pero no le pone a
    // nadie un día en la agenda: gris, sin invitados y sin marcar ocupado.
    const dmy = iso => String(iso||'').split('-').reverse().join('/')

    const armarBody = (slot) => {
      const body = {
        summary: slot.tentativo ? `⟨A CONFIRMAR⟩ ${titulo}` : titulo,
        description: slot.tentativo
          ? `⚠️ FECHAS A CONFIRMAR — todavía no están definidas.\nDías reservados: ${(fechas.tentativos||[]).map(dmy).join(', ')}\n\n` + descripcion
          : descripcion,
        colorId: slot.tentativo ? '8' : colorId,          // 8 = grafito
        status: 'confirmed',
        transparency: slot.tentativo ? 'transparent' : 'opaque',
        // Siempre explícito: si un evento deja de ser tentativo hay que despintarlo,
        // porque el update mergea sobre lo que ya estaba.
        attendees: slot.tentativo ? [] : staffAttendees,
      }
      if (ubicacion) body.location = ubicacion
      if (horas && !slot.allDay) {
        body.start = { dateTime: `${slot.desde}T${horas.h1}:00`, timeZone: TZ }
        body.end   = { dateTime: `${slot.hasta || slot.desde}T${horas.h2}:00`, timeZone: TZ }
      } else {
        // all-day: en Google el fin es exclusivo, va el día siguiente al último.
        // El mediodía UTC evita que el huso corra el día para atrás.
        body.start = { date: slot.desde }
        const fin = new Date(`${slot.hasta || slot.desde}T12:00:00Z`)
        fin.setUTCDate(fin.getUTCDate() + 1)
        body.end = { date: fin.toISOString().slice(0,10) }
      }
      return body
    }

    // Sincronizar contra lo que ya hay: actualizar los días que siguen, crear los
    // que faltan y borrar los que se sacaron. El sheet manda.
    const porDia = new Map()
    existentes.forEach(e => { const k = diaDeEvento(e); if (k && !porDia.has(k)) porDia.set(k, e) })
    const usados = new Set()
    slots.forEach(s => { const prev = porDia.get(s.desde); if (prev) usados.add(prev.id) })
    let result = null, invitados = false, creados = 0, actualizados = 0

    const guardarSlot = async (slot) => {
      const prev = porDia.get(slot.desde)
      const base = armarBody(slot)
      const guardar = (conInvitados) => {
        const body = prev ? { ...prev, ...base } : { ...base }
        if (!conInvitados) body.attendees = []
        const params = { calendarId: CALENDAR_ID, requestBody: body }
        if (conInvitados && base.attendees.length) params.sendUpdates = 'all'  // manda las invitaciones
        if (prev) { params.eventId = prev.id; return cal.events.update(params) }
        return cal.events.insert(params)
      }
      try {
        return { r: await guardar(true), prev, conInvitados: base.attendees.length > 0 }
      } catch (e) {
        // Google bloquea invitados si no está habilitado Domain-Wide Delegation → guardamos el evento igual, sin invitar
        return { r: await guardar(false), prev, conInvitados: false }
      }
    }
    // Los días no dependen entre sí, así que van de a 5 en paralelo: en fila, un
    // trabajo de 12 jornadas eran 12 viajes a Google y el request se comía los 10
    // segundos que da Vercel a mitad de camino, dejando días sin agendar.
    for (let i = 0; i < slots.length; i += 5) {
      const tanda = await Promise.all(slots.slice(i, i + 5).map(guardarSlot))
      tanda.forEach(({ r, prev, conInvitados }) => {
        result = r
        if (conInvitados) invitados = true
        if (prev) actualizados++; else creados++
      })
    }

    // Los días que ya no están en el sheet se van del Calendar (con cancelación al staff).
    // Lo que YA TERMINÓ no se toca: si un presu quedó mal cargado, borrarle la cobertura
    // que realmente se hizo sería perder el registro de lo que pasó. Se mira el fin y no
    // el arranque, porque un bloque del 1 al 30 empieza en el pasado y sigue vigente.
    const hoyISO = new Date().toISOString().slice(0,10)
    const sobrantes = existentes.filter(e => !usados.has(e.id))
    const viejosIntactos = sobrantes.filter(e => finDeEvento(e) < hoyISO).length
    const aBorrar = sobrantes.filter(e => finDeEvento(e) >= hoyISO)
    let borrados = 0
    for (let i = 0; i < aBorrar.length; i += 5) {
      const tanda = await Promise.all(aBorrar.slice(i, i + 5).map(async e => {
        try { await cal.events.delete({ calendarId: CALENDAR_ID, eventId: e.id, sendUpdates: 'all' }); return 1 } catch (err) { return 0 }
      }))
      borrados += tanda.reduce((a, b) => a + b, 0)
    }
    const accionFinal = actualizados ? 'actualizado' : 'creado'

    // Log
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'calendar-evento', 'CALENDAR', String(num), `${accionFinal} ${accion} eventos=${slots.length} tentativos=${slots.filter(x=>x.tentativo).length} nuevos=${creados} borrados=${borrados}${viejosIntactos?' intactos='+viejosIntactos:''} link=${result.data.htmlLink}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, accion: accionFinal, eventId: result.data.id, link: result.data.htmlLink, invitados, staffSinMail, crudoCompartidoCon: compartidoCrudo?.ok || [], eventos: slots.length, creados, actualizados, borrados, aConfirmar: slots.filter(x=>x.tentativo).length })
  } catch (e) {
    console.error('Error calendar-evento:', e.message, e.response?.data)
    // Si es problema de permisos, devolver mensaje claro
    if (e.code === 403 || /access|permission|notFound/i.test(e.message)) {
      return res.status(403).json({
        error: 'El Calendar Somos Magma no tiene permisos para esta app. Compartir el calendar con magma-sheets-364@somos-magma.iam.gserviceaccount.com con permiso "Realizar cambios en eventos".',
        detalle: e.message,
      })
    }
    res.status(500).json({ error: e.message })
  }
}
