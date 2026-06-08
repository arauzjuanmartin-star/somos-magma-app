import { google } from 'googleapis'
import { getSheets, withSheetsRetry } from '../../lib/sheets'
import Busboy from 'busboy'

const FOLDER_ROOT = '0AHMUebE7UIa_Uk9PVA'  // Shared drive ADMINISTRACION
const MESES_N = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/spreadsheets'],
  })
}

async function getOrCreateFolder(drive, name, parentId) {
  // Escapar comillas simples en el nombre para query
  const safe = name.replace(/'/g, "\\'")
  const q = `name='${safe}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
  const res = await drive.files.list({
    q,
    fields: 'files(id,name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  if (res.data.files.length > 0) return res.data.files[0].id
  const f = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  })
  return f.data.id
}

// Parser multipart con busboy — promesa que resuelve con {fields, file}
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: 25 * 1024 * 1024 } })  // max 25MB
    const fields = {}
    let fileBuffer = null, fileName = '', fileMime = ''
    let truncated = false

    bb.on('field', (name, val) => { fields[name] = val })

    bb.on('file', (name, fileStream, info) => {
      fileName = info.filename || 'archivo'
      fileMime = info.mimeType || 'application/octet-stream'
      const chunks = []
      fileStream.on('data', c => chunks.push(c))
      fileStream.on('limit', () => { truncated = true })
      fileStream.on('end', () => { fileBuffer = Buffer.concat(chunks) })
    })

    bb.on('close', () => {
      if (truncated) return reject(new Error('Archivo demasiado grande (máx 25MB)'))
      resolve({ fields, fileBuffer, fileName, fileMime })
    })
    bb.on('error', reject)

    req.pipe(bb)
  })
}

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''

  let parsed
  try {
    parsed = await parseMultipart(req)
  } catch (e) {
    console.error('Error parseando multipart:', e)
    return res.status(400).json({ error: 'Error procesando el archivo: ' + e.message })
  }

  const { fields, fileBuffer, fileName, fileMime } = parsed
  if (!fileBuffer || fileBuffer.length === 0) {
    return res.status(400).json({ error: 'No llegó archivo o está vacío' })
  }

  const entidad = fields.entidad || 'SRL'
  const mes = fields.mes || ''
  const anio = fields.anio || ''
  const nroFactura = fields.nroFactura || ''
  const presupuestoNum = fields.presupuestoNum || ''

  try {
    const auth = getAuth()
    const drive = google.drive({ version: 'v3', auth })

    const entidadNombre = entidad === 'SRL' ? 'Somos Magma SRL'
      : entidad === 'Sofia' ? 'Sofia Grenier'
      : entidad === 'Lulu' ? 'Lucia Grenier'
      : 'Efectivo'
    const mesNombre = mes ? (parseInt(mes).toString().padStart(2,'0') + ' - ' + (MESES_N[parseInt(mes)-1]||mes)) : 'Sin mes'
    const carpetaMes = anio ? anio + '-' + mesNombre : mesNombre

    // Crear/encontrar carpeta de entidad y mes (con retry)
    const entidadFolderId = await withSheetsRetry(() => getOrCreateFolder(drive, entidadNombre, FOLDER_ROOT))
    const mesFolderId = await withSheetsRetry(() => getOrCreateFolder(drive, carpetaMes, entidadFolderId))

    // Subir archivo
    const { Readable } = await import('stream')
    const stream = Readable.from(fileBuffer)
    const fileRes = await withSheetsRetry(() => drive.files.create({
      requestBody: { name: fileName, parents: [mesFolderId] },
      media: { mimeType: fileMime, body: Readable.from(fileBuffer) },
      fields: 'id,webViewLink',
      supportsAllDrives: true,
    }))

    // Asociar el link a la fila de FACTURACION
    let factualizada = false
    if (presupuestoNum) {
      try {
        const { sheets, SHEET_ID } = await getSheets()
        const r = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AG' }))
        const headers = r.data.values?.[0] || []
        const idxNro = headers.indexOf('N° Presupuesto')
        const idxFactura = headers.indexOf('Factura')
        if (idxNro !== -1 && idxFactura !== -1) {
          for (let i = 1; i < r.data.values.length; i++) {
            if (String(r.data.values[i][idxNro]||'').trim() === String(presupuestoNum).trim()) {
              const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
              await withSheetsRetry(() => sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `FACTURACION!${colLetra(idxFactura)}${i+1}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[fileRes.data.webViewLink]] }
              }))
              factualizada = true
              break
            }
          }
        }

        // Log de la acción
        try {
          await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'LOG!A:F',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[new Date().toISOString(), mail, 'factura-upload', 'FACTURACION+DRIVE', String(presupuestoNum), `archivo=${fileName} carpeta=${entidadNombre}/${carpetaMes} link=${fileRes.data.webViewLink} actualizada=${factualizada}`]] },
          })
        } catch (e) {}
      } catch (e) { console.error('Error guardando link en sheet:', e) }
    }

    res.json({
      ok: true,
      fileId: fileRes.data.id,
      link: fileRes.data.webViewLink,
      fileName,
      carpeta: `${entidadNombre} / ${carpetaMes}`,
      factualizada,
    })
  } catch (e) {
    console.error('Error upload (drive):', e)
    const status = e.code || e.response?.status
    if (status === 429) return res.status(429).json({ error: 'Google está limitando los pedidos. Esperá 30 segundos y volvé a intentar.' })
    res.status(500).json({ error: e.message || 'Error subiendo archivo' })
  }
}
