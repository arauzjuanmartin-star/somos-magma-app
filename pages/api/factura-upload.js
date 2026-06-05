import { google } from 'googleapis'
import { getSheets } from '../../lib/sheets'

const FOLDER_ROOT = '0AHMUebE7UIa_Uk9PVA'  // Shared drive ADMINISTRACION
const MESES_N = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

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
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
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

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const auth = getAuth()
    const drive = google.drive({ version: 'v3', auth })

    // Leer multipart manualmente
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = Buffer.concat(chunks)

    const contentType = req.headers['content-type'] || ''
    const boundaryMatch = contentType.match(/boundary=(.+)/)
    if (!boundaryMatch) return res.status(400).json({ error: 'No boundary' })
    const boundary = '--' + boundaryMatch[1]

    const parts = body.toString('binary').split(boundary).slice(1,-1)
    let entidad = 'SRL', mes = '', anio = '', nroFactura = '', presupuestoNum = '', fileBuffer = null, fileName = 'factura.pdf', fileMime = 'application/pdf'

    for (const part of parts) {
      const [headerRaw, ...bodyParts] = part.split('\r\n\r\n')
      const bodyStr = bodyParts.join('\r\n\r\n').replace(/\r\n$/, '')
      const nameMatch = headerRaw.match(/name="([^"]+)"/)
      if (!nameMatch) continue
      const fieldName = nameMatch[1]

      if (fieldName === 'entidad') entidad = bodyStr.trim()
      else if (fieldName === 'mes') mes = bodyStr.trim()
      else if (fieldName === 'anio') anio = bodyStr.trim()
      else if (fieldName === 'nroFactura') nroFactura = bodyStr.trim()
      else if (fieldName === 'presupuestoNum') presupuestoNum = bodyStr.trim()
      else if (fieldName === 'file') {
        const fnMatch = headerRaw.match(/filename="([^"]+)"/)
        if (fnMatch) fileName = fnMatch[1]
        const mimeMatch = headerRaw.match(/Content-Type:\s*([^\r\n]+)/)
        if (mimeMatch) fileMime = mimeMatch[1].trim()
        fileBuffer = Buffer.from(bodyStr, 'binary')
      }
    }

    if (!fileBuffer) return res.status(400).json({ error: 'No file' })

    const entidadNombre = entidad === 'SRL' ? 'Somos Magma SRL' : entidad === 'Sofia' ? 'Sofia Grenier' : entidad === 'Lulu' ? 'Lucia Grenier' : 'Efectivo'
    const mesNombre = mes ? (parseInt(mes).toString().padStart(2,'0') + ' - ' + (MESES_N[parseInt(mes)-1]||mes)) : 'Sin mes'
    const carpetaMes = anio ? anio + '-' + mesNombre : mesNombre

    const entidadFolderId = await getOrCreateFolder(drive, entidadNombre, FOLDER_ROOT)
    const mesFolderId = await getOrCreateFolder(drive, carpetaMes, entidadFolderId)

    const { Readable } = await import('stream')
    const stream = Readable.from(fileBuffer)
    const fileRes = await drive.files.create({
      requestBody: { name: fileName, parents: [mesFolderId] },
      media: { mimeType: fileMime, body: stream },
      fields: 'id,webViewLink',
      supportsAllDrives: true,
    })

    // GUARDAR el link en FACTURACION (col Factura) si tenemos un presupuestoNum
    let factualizada = false
    if (presupuestoNum) {
      try {
        const { sheets, SHEET_ID } = await getSheets()
        const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AG' })
        const headers = r.data.values?.[0] || []
        const idxNro = headers.indexOf('N° Presupuesto')
        const idxFactura = headers.indexOf('Factura')
        if (idxNro !== -1 && idxFactura !== -1) {
          for (let i = 1; i < r.data.values.length; i++) {
            if (String(r.data.values[i][idxNro]||'').trim() === String(presupuestoNum).trim()) {
              const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
              await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `FACTURACION!${colLetra(idxFactura)}${i+1}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[fileRes.data.webViewLink]] }
              })
              factualizada = true
              break
            }
          }
        }
      } catch(e) { console.error('Error guardando link en sheet:', e) }
    }

    res.json({ ok: true, fileId: fileRes.data.id, link: fileRes.data.webViewLink, fileName, carpeta: `${entidadNombre} / ${carpetaMes}`, factualizada })
  } catch(e) {
    console.error('Error upload:', e)
    res.status(500).json({ error: e.message })
  }
}
