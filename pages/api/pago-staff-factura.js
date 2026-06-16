import { google } from 'googleapis'
import { getSheets, withSheetsRetry } from '../../lib/sheets'
import Busboy from 'busboy'
import { Readable } from 'stream'
import { requireAuth } from '../../lib/auth-helpers'

const FOLDER_ROOT = '0AHMUebE7UIa_Uk9PVA'  // Shared drive ADMINISTRACION
const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

function getDriveAuth() {
  return new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
    scopes: ['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/spreadsheets'],
  })
}
async function getOrCreateFolder(drive, name, parentId) {
  const safe = String(name).replace(/'/g, "\\'")
  const q = `name='${safe}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
  const res = await drive.files.list({ q, fields: 'files(id,name)', supportsAllDrives: true, includeItemsFromAllDrives: true })
  if (res.data.files.length > 0) return res.data.files[0].id
  const f = await drive.files.create({ requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id', supportsAllDrives: true })
  return f.data.id
}
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: 25 * 1024 * 1024 } })
    const fields = {}; let fileBuffer = null, fileName = '', fileMime = '', truncated = false
    bb.on('field', (n, v) => { fields[n] = v })
    bb.on('file', (n, fs, info) => { fileName = info.filename || 'factura'; fileMime = info.mimeType || 'application/octet-stream'; const chunks=[]; fs.on('data', c=>chunks.push(c)); fs.on('limit', ()=>{truncated=true}); fs.on('end', ()=>{fileBuffer=Buffer.concat(chunks)}) })
    bb.on('close', () => { if (truncated) return reject(new Error('Archivo muy grande (máx 25MB)')); resolve({ fields, fileBuffer, fileName, fileMime }) })
    bb.on('error', reject)
    req.pipe(bb)
  })
}
export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  let parsed
  try { parsed = await parseMultipart(req) } catch (e) { return res.status(400).json({ error: 'Error con el archivo: ' + e.message }) }
  const { fields, fileBuffer, fileName, fileMime } = parsed
  if (!fileBuffer || !fileBuffer.length) return res.status(400).json({ error: 'No llegó el archivo' })
  const persona = fields.persona || ''
  const mes = fields.mes || ''
  const nros = (fields.nros || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!persona) return res.status(400).json({ error: 'Falta persona' })

  try {
    const drive = google.drive({ version: 'v3', auth: getDriveAuth() })
    const carpeta = await withSheetsRetry(() => getOrCreateFolder(drive, 'Facturas Freelancers', FOLDER_ROOT))
    const carpetaMes = await withSheetsRetry(() => getOrCreateFolder(drive, mes || 'Sin mes', carpeta))
    const nombreArch = `${persona} - ${mes} - ${fileName}`.replace(/\//g,'-')
    const fileRes = await withSheetsRetry(() => drive.files.create({
      requestBody: { name: nombreArch, parents: [carpetaMes] },
      media: { mimeType: fileMime, body: Readable.from(fileBuffer) },
      fields: 'id,webViewLink', supportsAllDrives: true,
    }))
    const link = fileRes.data.webViewLink

    // Escribir el link en la columna Factura (N) de las filas de la persona
    const { sheets, SHEET_ID } = await getSheets()
    const r = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PAGOS_STAFF!A:N' }))
    const rows = r.data.values || []; const H = rows[0] || []
    const norm = v => String(v||'').trim().toLowerCase()
    const iFre = H.indexOf('Freelancer') !== -1 ? H.indexOf('Freelancer') : 1
    const iNro = H.indexOf('N° Presupuesto') !== -1 ? H.indexOf('N° Presupuesto') : 3
    const iFac = H.indexOf('Factura') !== -1 ? H.indexOf('Factura') : 13
    const setNros = new Set(nros)
    const updates = []
    for (let i = 1; i < rows.length; i++) {
      if (norm(rows[i][iFre]) === norm(persona) && (setNros.size === 0 || setNros.has(String(rows[i][iNro]||'').trim()))) {
        updates.push({ range: `PAGOS_STAFF!${colLetra(iFac)}${i+1}`, values: [[link]] })
      }
    }
    if (updates.length) await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'RAW', data: updates } }))

    try { await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'pago-staff-factura', 'PAGOS_STAFF+DRIVE', persona, `${mes} ${fileName} link=${link} filas=${updates.length}`]] } }) } catch (e) {}

    res.json({ ok: true, link, filas: updates.length })
  } catch (e) {
    console.error('Error pago-staff-factura:', e)
    const status = e.code || e.response?.status
    if (status === 429) return res.status(429).json({ error: 'Google limitando. Esperá 30s.' })
    res.status(500).json({ error: e.message || 'Error subiendo factura' })
  }
}
