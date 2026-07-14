// Agarra la factura adjunta de la respuesta de un freelancer (por IMAP, por UID del mail),
// la sube a Drive (Facturas Freelancers / mes) y la linkea en PAGOS_STAFF. Cierra el círculo:
// freelancer contesta con la factura → un click → guardada y linkeada, sin bajar/subir a mano.
import { google } from 'googleapis'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { Readable } from 'stream'
import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const FOLDER_ROOT = '0AHMUebE7UIa_Uk9PVA'  // Shared drive ADMINISTRACION
const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

function getDriveAuth() {
  return new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
    scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'],
  })
}
async function getOrCreateFolder(drive, name, parentId) {
  const safe = String(name).replace(/'/g, "\\'")
  const q = `name='${safe}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
  const r = await drive.files.list({ q, fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true })
  if (r.data.files.length) return r.data.files[0].id
  const f = await drive.files.create({ requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id', supportsAllDrives: true })
  return f.data.id
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { uid, persona, mes, nros = [] } = req.body || {}
  if (!uid) return res.status(400).json({ error: 'Falta el identificador del mail' })
  if (!persona) return res.status(400).json({ error: 'Falta la persona' })
  const USER = process.env.MAIL_USER, PASS = process.env.MAIL_APP_PASSWORD
  if (!USER || !PASS) return res.status(503).json({ error: 'Falta configurar MAIL_USER / MAIL_APP_PASSWORD.' })

  // 1) Bajar el adjunto (factura) del mail por IMAP
  let adj, client
  try {
    client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: USER, pass: PASS.replace(/\s+/g, '') }, logger: false })
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    try {
      const { content } = await client.download(String(uid), undefined, { uid: true })
      const parsed = await simpleParser(content)
      const atts = parsed.attachments || []
      const isDoc = a => /\.pdf$/i.test(a.filename || '') || /pdf/i.test(a.contentType || '')
      const isImg = a => /\.(jpe?g|png)$/i.test(a.filename || '') || /^image\//i.test(a.contentType || '')
      let cands = atts.filter(a => (isDoc(a) || isImg(a)) && (a.content?.length || 0) > 3000)  // descarta logos de firma
      if (!cands.length) cands = atts.filter(a => isDoc(a) || isImg(a))
      const porTam = (a, b) => (b.content?.length || 0) - (a.content?.length || 0)
      adj = cands.filter(isDoc).sort(porTam)[0] || cands.sort(porTam)[0]  // preferimos PDF; si no, la imagen más grande
    } finally { lock.release() }
    await client.logout()
  } catch (e) {
    try { await client?.logout() } catch (_) {}
    return res.status(500).json({ error: 'No pude leer el adjunto del mail: ' + e.message })
  }
  if (!adj || !adj.content?.length) return res.status(404).json({ error: 'Ese mail no tiene una factura adjunta (PDF o imagen).' })

  // 2) Subir a Drive + 3) linkear en PAGOS_STAFF (mismo destino que "Subir factura")
  try {
    const drive = google.drive({ version: 'v3', auth: getDriveAuth() })
    const carpeta = await withSheetsRetry(() => getOrCreateFolder(drive, 'Facturas Freelancers', FOLDER_ROOT))
    const carpetaMes = await withSheetsRetry(() => getOrCreateFolder(drive, mes || 'Sin mes', carpeta))
    const fname = adj.filename || 'factura.pdf'
    const nombreArch = `${persona} - ${mes} - ${fname}`.replace(/\//g, '-')
    const fileRes = await withSheetsRetry(() => drive.files.create({
      requestBody: { name: nombreArch, parents: [carpetaMes] },
      media: { mimeType: adj.contentType || 'application/pdf', body: Readable.from(adj.content) },
      fields: 'id,webViewLink', supportsAllDrives: true,
    }))
    const link = fileRes.data.webViewLink

    const { sheets, SHEET_ID } = await getSheets()
    const r = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PAGOS_STAFF!A:N' }))
    const rows = r.data.values || [], H = rows[0] || []
    const norm = v => String(v || '').trim().toLowerCase()
    const iFre = H.indexOf('Freelancer') !== -1 ? H.indexOf('Freelancer') : 1
    const iNro = H.indexOf('N° Presupuesto') !== -1 ? H.indexOf('N° Presupuesto') : 3
    const iFac = H.indexOf('Factura') !== -1 ? H.indexOf('Factura') : 13
    const setNros = new Set((nros || []).map(n => String(n).trim()).filter(Boolean))
    const updates = []
    for (let i = 1; i < rows.length; i++) {
      if (norm(rows[i][iFre]) === norm(persona) && (setNros.size === 0 || setNros.has(String(rows[i][iNro] || '').trim()))) {
        updates.push({ range: `PAGOS_STAFF!${colLetra(iFac)}${i + 1}`, values: [[link]] })
      }
    }
    if (updates.length) await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'RAW', data: updates } }))

    try { await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'pago-staff-guardar-adjunto', 'PAGOS_STAFF+DRIVE', persona, `${mes} ${fname} link=${link} filas=${updates.length}`]] } }) } catch (e) {}

    res.json({ ok: true, link, filename: fname, filas: updates.length })
  } catch (e) {
    console.error('pago-staff-guardar-adjunto:', e)
    const status = e.code || e.response?.status
    if (status === 429) return res.status(429).json({ error: 'Google limitando. Esperá 30s y reintentá.' })
    res.status(500).json({ error: e.message || 'Error subiendo la factura' })
  }
}
