import { google } from 'googleapis'
import { Readable } from 'stream'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'
import { getSheets, getAllData, withSheetsRetry } from '../../../lib/sheets'
import { personaPorMail } from '../../../lib/mi-magma'
import { lineasDeProyecto } from '../../../lib/jornadas'
import { canonStaff, canonKey } from '../../../lib/staff'
import { HOJA_TICKETS, HEADERS_TICKETS, QUE_FUE, MONTO_MAXIMO, mesReferencia, sePuedeCargar, nuevoIdTicket, esDe } from '../../../lib/tickets.mjs'

// Mi Magma: un freelancer carga un gasto que adelantó en un trabajo (nafta, peaje, un taxi), con la foto del ticket.
// Queda "Pendiente" en la solapa TICKETS para que administración lo apruebe (ver lib/tickets.mjs).
//
// Misma regla que /api/mi: la persona sale del MAIL DE LA SESIÓN cruzado con RRHH, nunca de algo que mande el
// navegador. Y el trabajo tiene que ser SUYO: se vuelve a buscar en PROYECTOS, no se le cree al formulario.
// La foto llega ya achicada por el celular (Vercel no acepta pedidos de más de 4,5 MB).
export const config = { api: { bodyParser: { sizeLimit: '5mb' } } }

const FOLDER_ROOT = '0AHMUebE7UIa_Uk9PVA'  // Shared drive ADMINISTRACION
const TIPOS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }
const txt = v => String(v ?? '').trim()
const num = v => { if (typeof v === 'number') return v; const n = parseFloat(txt(v).replace(/[$,\s]/g, '')); return isNaN(n) ? 0 : n }
const fechaAR = s => { const m = txt(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (!m) return null; let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]) }
const dd = n => String(n).padStart(2, '0')
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
// Un texto que empieza con = + - @ el sheet lo toma como fórmula y deja #ERROR!
const texto = v => { const s = txt(v); return s ? `'${s}` : '' }

function driveClient() {
  return google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
    scopes: ['https://www.googleapis.com/auth/drive'],
  }) })
}
async function getOrCreateFolder(drive, name, parentId) {
  const safe = String(name).replace(/'/g, "\\'")
  const r = await drive.files.list({ q: `name='${safe}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`, fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true })
  if (r.data.files.length) return r.data.files[0].id
  const f = await drive.files.create({ requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id', supportsAllDrives: true })
  return f.data.id
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Solo para cargar un ticket' })
  const session = await getServerSession(req, res, authOptions)
  const mail = session?.user?.email?.toLowerCase()?.trim()
  if (!mail) return res.status(401).json({ ok: false, error: 'No autorizado' })

  const { num: nro, slot, que, monto, nota = '', foto = '', fotoTipo = '' } = req.body || {}
  const m = Math.round(num(monto))
  if (!txt(nro) || !Number.isInteger(slot)) return res.status(400).json({ ok: false, error: 'Elegí de qué trabajo fue el gasto' })
  if (!QUE_FUE.includes(txt(que))) return res.status(400).json({ ok: false, error: 'Elegí qué fue el gasto' })
  if (!(m > 0)) return res.status(400).json({ ok: false, error: 'Poné cuánto gastaste' })
  if (m > MONTO_MAXIMO) return res.status(400).json({ ok: false, error: 'Ese monto es demasiado alto para un ticket. Hablalo con administración.' })
  if (!foto || !TIPOS[fotoTipo]) return res.status(400).json({ ok: false, error: 'Falta la foto del ticket' })
  const archivo = Buffer.from(String(foto), 'base64')
  if (archivo.length < 500 || archivo.length > 4.2 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'La foto no se pudo leer o pesa demasiado. Sacala de nuevo.' })

  try {
    const data = await getAllData()
    // Quién es: por el mail de la sesión, y solo si tiene el acceso a Mi Magma dado. (El equipo mirando "como otro" no carga tickets ajenos.)
    const fila = personaPorMail(data.rrhh, mail)
    if (!fila) return res.status(403).json({ ok: false, error: 'Tu mail no tiene acceso a Mi Magma. Pedíselo a administración.' })
    const persona = canonStaff(txt(fila['Nombre Apellido'])), yo = canonKey(persona)

    // El trabajo, buscado de nuevo en PROYECTOS: tiene que ser una línea de esta persona y estar dentro del plazo.
    const p = (data.proyectos || []).find(x => txt(x['N° presupuesto']) === txt(nro))
    const linea = p ? lineasDeProyecto(p).find(l => l.slot === slot && l.key === yo) : null
    if (!linea) return res.status(403).json({ ok: false, error: 'Ese trabajo no figura a tu nombre. Actualizá la página y probá de nuevo.' })
    const fecha = fechaAR(linea.fecha)
    const hoy = new Date(Date.now() - 3 * 3600e3), hoy0 = new Date(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())   // hora de Argentina
    if (!sePuedeCargar(fecha, hoy0)) return res.status(400).json({ ok: false, error: 'Ese trabajo ya es muy viejo (o todavía falta mucho) para cargarle un ticket. Hablalo con administración.' })

    const { sheets, SHEET_ID } = await getSheets()
    let H = []
    try { H = ((await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${HOJA_TICKETS}!1:1` }))).data.values?.[0] || []).map(txt) } catch (e) { /* no existe */ }
    const faltan = HEADERS_TICKETS.filter(h => !H.includes(h))
    if (faltan.length) { console.error(`mi/ticket: a ${HOJA_TICKETS} le faltan columnas: ${faltan.join(', ')}`); return res.status(503).json({ ok: false, error: 'Todavía no se pueden cargar tickets desde acá. Avisale a administración.' }) }

    // El mismo ticket mandado dos veces (doble toque, o reintento con mala señal): no se repite.
    const cuando = `${dd(hoy0.getDate())}/${dd(hoy0.getMonth() + 1)}/${hoy0.getFullYear()}`
    const mismoDia = s => { const f = fechaAR(s); return !!f && f.getTime() === hoy0.getTime() }   // se escriba como se escriba la fecha
    const repetido = (data.tickets || []).find(r => esDe(r, persona) && txt(r['N° trabajo']) === txt(nro) && txt(r['Qué fue']) === txt(que) && Math.round(num(r['Monto'])) === m && mismoDia(r['Cargado el']))
    if (repetido) return res.status(409).json({ ok: false, error: 'Ese ticket ya lo mandaste hoy. Si es otro gasto igual, avisale a administración.' })

    // La foto, a Drive: ADMINISTRACION / Tickets de trabajos / 2026-10
    const id = nuevoIdTicket()
    const drive = driveClient()
    const carpeta = await withSheetsRetry(() => getOrCreateFolder(drive, 'Tickets de trabajos', FOLDER_ROOT))
    const carpetaMes = await withSheetsRetry(() => getOrCreateFolder(drive, `${hoy0.getFullYear()}-${dd(hoy0.getMonth() + 1)}`, carpeta))
    const nombre = `${hoy0.getFullYear()}-${dd(hoy0.getMonth() + 1)}-${dd(hoy0.getDate())} ${persona} #${txt(nro)} ${txt(que)} $${m} ${id}.${TIPOS[fotoTipo]}`.replace(/[\/\\|*?<>:"]/g, ' ')
    const up = await withSheetsRetry(() => drive.files.create({ requestBody: { name: nombre, parents: [carpetaMes] }, media: { mimeType: fotoTipo, body: Readable.from(archivo) }, fields: 'id,webViewLink', supportsAllDrives: true }))
    const link = up.data.webViewLink || ''
    if (!link) return res.status(502).json({ ok: false, error: 'No se pudo guardar la foto. Probá de nuevo.' })

    const trabajo = [txt(p['Cliente']) || txt(p['Agencia']), txt(p['Proyecto'])].filter(Boolean).join(' · ')
    const dato = {
      'ID': id, 'Cargado el': texto(`${cuando} ${dd(hoy.getUTCHours())}:${dd(hoy.getUTCMinutes())}`), 'Persona': texto(persona), 'N° trabajo': texto(nro), 'Trabajo': texto(trabajo),
      'Servicio': texto(linea.pedido), 'Mes Referencia': texto(mesReferencia(fecha)), 'Fecha del trabajo': `${dd(fecha.getDate())}/${dd(fecha.getMonth() + 1)}/${fecha.getFullYear()}`,
      'Qué fue': texto(que), 'Monto': m, 'Foto': link, 'Estado': 'Pendiente', 'Revisó': '', 'Revisado el': '', 'Motivo': '', 'Nota': texto(String(nota).slice(0, 300)),
    }
    // Sin INSERT_ROWS a propósito: debajo de esta tabla no hay nada que pisar, y así la fila nueva toma el formato
    // del cuerpo de la solapa (con INSERT_ROWS, la primera fila heredaría el del título).
    await withSheetsRetry(() => sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: `${HOJA_TICKETS}!A:${colLetra(H.length - 1)}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [H.map(h => (h in dato ? dato[h] : ''))] } }))
    try { await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'mi-ticket', HOJA_TICKETS, id, `${persona} #${txt(nro)} ${txt(que)} $${m}`]] } }) } catch (e) { /* el log no frena */ }

    res.json({ ok: true, ticket: { id, cargado: txt(dato['Cargado el']).replace(/^'/, ''), num: txt(nro), trabajo, fecha: dato['Fecha del trabajo'], que: txt(que), monto: m, estado: 'pendiente', motivo: '' } })
  } catch (e) {
    console.error('mi/ticket:', e)
    res.status(500).json({ ok: false, error: 'No se pudo guardar el ticket. Probá de nuevo en un minuto.' })
  }
}
