import { google } from 'googleapis'
import { Readable } from 'stream'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'
import { getSheets, getAllData, withSheetsRetry } from '../../../lib/sheets'
import { personaPorMail, misDatos } from '../../../lib/mi-magma'
import { canonStaff, canonKey } from '../../../lib/staff'
import { mandarAviso } from '../../../lib/edicion-avisos'

// Mi Magma: el freelancer sube SU factura del mes. Hasta ahora la mandaba por mail a admin@ y alguien la guardaba a
// mano ("⬇ Guardar en Drive" en Pagos Staff). Va al MISMO lugar que esa: Drive ADMINISTRACION / Facturas Freelancers /
// "09 - septiembre", y el link queda en la columna Factura de todas sus filas de ese mes en PAGOS_STAFF. Administración
// la ve en Pagos Staff como cualquier otra, y le llega un mail avisando.
//
// La persona sale del MAIL DE LA SESIÓN cruzado con RRHH, y el mes tiene que ser uno en el que tenga trabajos.
// El archivo llega en base64 (PDF o foto ya achicada por el celular; Vercel no acepta pedidos de más de 4,5 MB).
export const config = { api: { bodyParser: { sizeLimit: '5mb' } } }

const FOLDER_ROOT = '0AHMUebE7UIa_Uk9PVA'  // Shared drive ADMINISTRACION
const TIPOS = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const txt = v => String(v ?? '').trim()
const norm = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const dd = n => String(n).padStart(2, '0')
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }

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
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Solo para subir una factura' })
  const session = await getServerSession(req, res, authOptions)
  const mail = session?.user?.email?.toLowerCase()?.trim()
  if (!mail) return res.status(401).json({ ok: false, error: 'No autorizado' })

  const { mes: clave, archivo = '', tipo = '' } = req.body || {}
  const m = txt(clave).match(/^(\d{4})-(\d{2})$/)
  if (!m) return res.status(400).json({ ok: false, error: 'Elegí de qué mes es la factura' })
  if (!archivo || !TIPOS[tipo]) return res.status(400).json({ ok: false, error: 'Subí la factura en PDF o como foto' })
  const buf = Buffer.from(String(archivo), 'base64')
  if (buf.length < 500 || buf.length > 4.2 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'El archivo no se pudo leer o pesa demasiado (máximo 4 MB).' })

  try {
    const data = await getAllData()
    const fila = personaPorMail(data.rrhh, mail)
    if (!fila) return res.status(403).json({ ok: false, error: 'Tu mail no tiene acceso a Mi Magma. Pedíselo a administración.' })
    const persona = canonStaff(txt(fila['Nombre Apellido'])), yo = canonKey(persona)

    // El mes tiene que ser uno de los suyos: los mismos cuatro que ve en "Facturar".
    const mio = misDatos(data, persona, new Date(Date.now() - 3 * 3600e3))
    const mesMio = (mio?.meses || []).find(x => x.clave === txt(clave) && x.lineas.length > 0)
    if (!mesMio) return res.status(400).json({ ok: false, error: 'No tenés trabajos cargados en ese mes.' })
    const mesLabel = `${m[2]} - ${MESES[+m[2] - 1]}`   // "09 - septiembre", como en Pagos Staff y en la carpeta de Drive

    const drive = driveClient()
    const carpeta = await withSheetsRetry(() => getOrCreateFolder(drive, 'Facturas Freelancers', FOLDER_ROOT))
    const carpetaMes = await withSheetsRetry(() => getOrCreateFolder(drive, mesLabel, carpeta))
    const hoy = new Date(Date.now() - 3 * 3600e3)
    const nombre = `${persona} - ${mesLabel} - factura (Mi Magma ${dd(hoy.getUTCDate())}-${dd(hoy.getUTCMonth() + 1)}).${TIPOS[tipo]}`.replace(/[\/\\|*?<>:"]/g, ' ')
    const up = await withSheetsRetry(() => drive.files.create({ requestBody: { name: nombre, parents: [carpetaMes] }, media: { mimeType: tipo, body: Readable.from(buf) }, fields: 'id,webViewLink', supportsAllDrives: true }))
    const link = up.data.webViewLink || ''
    if (!link) return res.status(502).json({ ok: false, error: 'No se pudo guardar la factura. Probá de nuevo.' })

    // El link, en la columna Factura de sus filas de ese mes (la factura es del mes entero). OJO: "Mes Referencia" no
    // tiene año ("09 - septiembre" es también septiembre de 2025), así que además del mes se exige que el N° sea uno
    // de los trabajos de ESE mes, igual que hace Pagos Staff cuando administración sube la factura.
    const { sheets, SHEET_ID } = await getSheets()
    const rows = (await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PAGOS_STAFF!A:Z' }))).data.values || []
    const H = (rows[0] || []).map(txt), iFre = H.indexOf('Freelancer'), iMes = H.indexOf('Mes Referencia'), iFac = H.indexOf('Factura'), iNro = H.indexOf('N° Presupuesto')
    if (iFre < 0 || iMes < 0 || iFac < 0 || iNro < 0) { console.error('mi/factura: a PAGOS_STAFF le falta Freelancer, Mes Referencia, N° Presupuesto o Factura'); return res.status(503).json({ ok: false, error: 'La factura se guardó pero no se pudo anotar. Avisale a administración.', link }) }
    const nros = new Set(mesMio.lineas.map(l => txt(l.num)).filter(Boolean))
    const updates = []
    for (let i = 1; i < rows.length; i++) if (canonKey(canonStaff(rows[i][iFre])) === yo && norm(rows[i][iMes]) === norm(mesLabel) && nros.has(txt(rows[i][iNro]))) updates.push({ range: `PAGOS_STAFF!${colLetra(iFac)}${i + 1}`, values: [[link]] })
    if (updates.length) await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'RAW', data: updates } }))
    try { await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'mi-factura', 'PAGOS_STAFF+DRIVE', persona, `${mesLabel} filas=${updates.length} ${link}`]] } }) } catch (e) { /* el log no frena */ }

    // A administración, para que no tenga que ir a mirar si ya la subieron.
    const $ = n => '$' + Math.round(n || 0).toLocaleString('es-AR')
    await mandarAviso({ para: 'admin@somosmagma.com', asunto: `Factura de ${persona} · ${mesMio.nombre}`,
      cuerpo: [`${persona} subió su factura de ${mesMio.nombre.toLowerCase()} desde Mi Magma.`, '', 'LA FACTURA', link, '',
        `LO QUE TIENE CARGADO ESE MES`, `${mesMio.lineas.length} ${mesMio.lineas.length === 1 ? 'trabajo' : 'trabajos'} · ${$(mesMio.total)}${mesMio.pagado > 0 ? ` · ya pagado ${$(mesMio.pagado)}` : ''}`,
        ...mesMio.lineas.map(l => `  ${l.dia} · ${l.cliente} · ${l.rol} · ${$(l.monto)}${l.viaticos ? ` + viáticos ${$(l.viaticos)}` : ''}`),
        '', updates.length ? `Quedó linkeada en ${updates.length} ${updates.length === 1 ? 'fila' : 'filas'} de Pagos Staff.` : 'OJO: no tiene filas en Pagos Staff de ese mes todavía. La factura quedó en Drive, en Facturas Freelancers.',
        '', '—', 'Somos Magma'].join('\n') })

    res.json({ ok: true, link, filas: updates.length })
  } catch (e) {
    console.error('mi/factura:', e)
    res.status(500).json({ ok: false, error: 'No se pudo subir la factura. Probá de nuevo en un minuto.' })
  }
}
