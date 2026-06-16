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

const CALENDAR_ID = '5gc9hdvh4vi28bf8uemr2vfnn4@group.calendar.google.com'

function getCalendarAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/calendar'],
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

// Genera las fechas (ISO) de un evento según tipo dia/rango/multi
function fechasEvento(fechaPrincipal, tipoFechas, fechasAdicionales) {
  const f0 = parseFecha(fechaPrincipal)
  if (!f0) return []
  const tipo = String(tipoFechas||'').toLowerCase().trim()
  const ad = String(fechasAdicionales||'').trim()
  if (tipo === 'rango' && ad) {
    const f1 = parseFecha(ad)
    return f1 ? { type: 'rango', desde: f0, hasta: f1 } : { type: 'dia', dia: f0 }
  }
  if (tipo === 'multi' && ad) {
    return { type: 'multi', fechas: [f0, ...ad.split('|').filter(Boolean).map(parseFecha).filter(Boolean)] }
  }
  return { type: 'dia', dia: f0 }
}

// Marca con un tag único en la descripción para encontrar el evento después por presupuesto
const tagPresu = (num) => `[SOMOS_MAGMA_PRESU:${num}]`

async function buscarEventoPorPresu(cal, num) {
  // Buscamos en los próximos 18 meses + 6 meses atrás
  const ahora = new Date()
  const desde = new Date(ahora); desde.setMonth(desde.getMonth()-6)
  const hasta = new Date(ahora); hasta.setMonth(hasta.getMonth()+18)
  const tag = tagPresu(num)
  const r = await cal.events.list({
    calendarId: CALENDAR_ID,
    timeMin: desde.toISOString(),
    timeMax: hasta.toISOString(),
    q: tag,
    maxResults: 5,
    singleEvents: true,
  })
  return r.data.items?.find(e => String(e.description||'').includes(tag)) || null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { num, accion } = req.body
  if (!num || !accion) return res.status(400).json({ error: 'Falta num o accion' })

  try {
    // Leer datos del presupuesto del sheet (Fecha Evento, Cliente, Agencia, Proyecto, Tipo Fechas, Fechas Adicionales)
    const { sheets, SHEET_ID } = await getSheets()
    const rPres = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A1:AX2000' })
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

    const calAuth = getCalendarAuth()
    const cal = google.calendar({ version: 'v3', auth: calAuth })

    // Buscar evento existente por tag
    const existing = await buscarEventoPorPresu(cal, num)

    if (accion === 'borrar') {
      if (existing) {
        await cal.events.delete({ calendarId: CALENDAR_ID, eventId: existing.id })
        return res.json({ ok: true, accion: 'borrado', eventId: existing.id })
      }
      return res.json({ ok: true, accion: 'no-existia' })
    }

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
      `Presupuesto: #${num}`,
      `Cliente: ${cliente || '—'}`,
      `Agencia: ${agencia || '—'}`,
      `Proyecto: ${proyecto || '—'}`,
      `PM: ${pm || '—'}`,
    ]
    // Datos operativos del día (lo que pide el equipo)
    if (horario) descripcionPartes.push(`⏰ Horario: ${horario}`)
    if (ubicacion) descripcionPartes.push(`📍 Ubicación: ${ubicacion}`)
    if (contactoLugar) descripcionPartes.push(`👤 Contacto en el lugar: ${contactoLugar}`)

    // Staff asignado (desde PROYECTOS) — para que en el Calendar se vea quién va
    if (accion === 'aprobar') {
      try {
        const rProy = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:CF' })
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
          if (staffList.length) descripcionPartes.push(`🎥 Staff: ${[...new Set(staffList)].join(', ')}`)
        }
      } catch (e) { /* no bloquea */ }
    }
    descripcionPartes.push(
      `Estado: ${accion === 'aprobar' ? 'APROBADO ✓' : 'EN ESPERA'}`,
      '',
      `Ver presu: https://somos-magma-app.vercel.app/presupuesto?nro=${num}`,
      '',
      tagPresu(num),
    )
    const descripcion = descripcionPartes.join('\n')

    // Construir start/end según tipo de fecha + horario (si hay)
    const fechas = fechasEvento(fechaEv, tipoFechas, fechasAd)
    const TZ = 'America/Argentina/Buenos_Aires'
    let eventBody = {
      summary: titulo,
      description: descripcion,
      colorId,
    }
    if (ubicacion) eventBody.location = ubicacion

    // Helper: si hay horario, generar dateTime con TZ AR. Si no, dejar all-day.
    const setStartEnd = (diaISO, hastaISO) => {
      if (horas) {
        eventBody.start = { dateTime: `${diaISO}T${horas.h1}:00`, timeZone: TZ }
        eventBody.end = { dateTime: `${hastaISO || diaISO}T${horas.h2}:00`, timeZone: TZ }
      } else {
        eventBody.start = { date: diaISO }
        const fin = new Date(hastaISO || diaISO); fin.setDate(fin.getDate()+1)
        eventBody.end = { date: fin.toISOString().slice(0,10) }
      }
    }

    if (fechas.type === 'rango') {
      // Para rango, mejor all-day (varios días) que dateTime
      eventBody.start = { date: fechas.desde }
      const hastaPlus1 = new Date(fechas.hasta); hastaPlus1.setDate(hastaPlus1.getDate()+1)
      eventBody.end = { date: hastaPlus1.toISOString().slice(0,10) }
    } else if (fechas.type === 'multi') {
      setStartEnd(fechas.fechas[0])
      eventBody.description += `\n\nFechas adicionales: ${fechas.fechas.slice(1).join(', ')}`
    } else {
      setStartEnd(fechas.dia)
    }

    let result, accionFinal
    if (existing) {
      result = await cal.events.update({ calendarId: CALENDAR_ID, eventId: existing.id, requestBody: { ...existing, ...eventBody } })
      accionFinal = 'actualizado'
    } else {
      result = await cal.events.insert({ calendarId: CALENDAR_ID, requestBody: eventBody })
      accionFinal = 'creado'
    }

    // Log
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'calendar-evento', 'CALENDAR', String(num), `${accionFinal} ${accion} color=${colorId} link=${result.data.htmlLink}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, accion: accionFinal, eventId: result.data.id, link: result.data.htmlLink })
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
