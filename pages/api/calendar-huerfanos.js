// Devuelve eventos del Calendar Somos Magma de los próximos 90 días + cruza con PROYECTOS
// y devuelve los huérfanos (eventos sin proyecto en sistema).
import { google } from 'googleapis'
import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const CALENDAR_ID = '5gc9hdvh4vi28bf8uemr2vfnn4@group.calendar.google.com'

function getAuth(scopes) {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes,
  })
}

const norm = v => String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'')

export default async function handler(req, res) {
  const a = await requireAuth(req, res)
  if (!a) return
  const mail = a.mail

  try {
    // 1. Leer eventos próximos del Calendar
    const auth = getAuth(['https://www.googleapis.com/auth/calendar.readonly'])
    const cal = google.calendar({ version: 'v3', auth })
    const now = new Date()
    const future = new Date()
    future.setDate(future.getDate() + 90)
    const past = new Date()
    past.setDate(past.getDate() - 14) // también traer las últimas 2 semanas por si quedó algo sin cargar

    const eventosRes = await cal.events.list({
      calendarId: CALENDAR_ID,
      timeMin: past.toISOString(),
      timeMax: future.toISOString(),
      maxResults: 250,
      singleEvents: true,
      orderBy: 'startTime',
    })

    const eventos = (eventosRes.data.items || []).map(e => ({
      id: e.id,
      titulo: e.summary || '(sin título)',
      desc: e.description || '',
      inicio: e.start?.dateTime || e.start?.date || '',
      fin: e.end?.dateTime || e.end?.date || '',
      lugar: e.location || '',
      colorId: e.colorId || '',
      attendees: (e.attendees || []).map(a => a.email).filter(Boolean),
    }))

    // 2. Leer PROYECTOS y PRESUPUESTOS aprobados para cruzar
    const { sheets, SHEET_ID } = await getSheets()
    const [proyR, presuR] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:H' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:I' }),
    ])
    const proys = (proyR.data.values || []).slice(1).map(row => ({
      nro: String(row[2]||'').trim(),
      fecha: row[3]||'',
      agencia: row[4]||'',
      cliente: row[5]||'',
      proyecto: row[6]||'',
    })).filter(p => p.nro)

    const presusAprob = (presuR.data.values || []).slice(1).map(row => ({
      nro: String(row[0]||'').trim(),
      fecha: row[1]||'',
      estado: row[3]||'',
      agencia: row[4]||'',
      cliente: row[5]||'',
      proyecto: row[6]||'',
    })).filter(p => p.nro && /APROBADO/i.test(p.estado))

    // 3. Cruzar: para cada evento, ver si tiene match en proyectos o presupuestos aprobados
    const parseFecha = s => {
      if (!s) return null
      if (s.includes('T')) return new Date(s)
      const m = String(s).match(/(\d{4})-(\d{1,2})-(\d{1,2})/) || String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
      if (!m) return null
      if (s.includes('-')) return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]))
      const y = Number(m[3]) < 100 ? 2000+Number(m[3]) : Number(m[3])
      return new Date(y, Number(m[2])-1, Number(m[1]))
    }
    const mismoDia = (a, b) => {
      if (!a || !b) return false
      return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()
    }

    const resultado = eventos.map(e => {
      const fEv = parseFecha(e.inicio)
      const titNorm = norm(e.titulo)
      // Match: misma fecha + título contiene cliente/agencia/proyecto
      const matchProy = proys.find(p => {
        const fP = parseFecha(p.fecha)
        if (!mismoDia(fEv, fP)) return false
        const ag = norm(p.agencia), cli = norm(p.cliente), pr = norm(p.proyecto)
        return (ag && titNorm.includes(ag)) || (cli && titNorm.includes(cli)) || (pr && titNorm.includes(pr.slice(0,8)))
      })
      const matchPresu = !matchProy && presusAprob.find(p => {
        const fP = parseFecha(p.fecha)
        if (!mismoDia(fEv, fP)) return false
        const ag = norm(p.agencia), cli = norm(p.cliente)
        return (ag && titNorm.includes(ag)) || (cli && titNorm.includes(cli))
      })
      return { ...e, matchProy, matchPresu, esHuerfano: !matchProy && !matchPresu }
    })

    const huerfanos = resultado.filter(e => e.esHuerfano)
    const matcheados = resultado.filter(e => !e.esHuerfano)

    res.json({
      ok: true,
      totalEventos: eventos.length,
      conProyecto: resultado.filter(e => e.matchProy).length,
      conPresuAprobado: resultado.filter(e => e.matchPresu).length,
      huerfanos: huerfanos.slice(0, 50),
      matcheados: matcheados.slice(0, 50),
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
