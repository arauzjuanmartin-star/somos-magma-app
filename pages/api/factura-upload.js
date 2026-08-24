import { google } from 'googleapis'
import { getSheets, withSheetsRetry } from '../../lib/sheets'
import Busboy from 'busboy'
import { Readable } from 'stream'
import { requireAuth } from '../../lib/auth-helpers'
import { ubicarFilaFactura } from '../../lib/factura-fila'
import { nroDeNombreArchivo, compararConPdf } from '../../lib/factura-numero'
import { nroDesdeElPdf } from '../../lib/factura-leer-pdf'

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
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

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
  // Fila exacta de FACTURACION (__row). Con adelanto + saldo hay 2 facturas del mismo
  // proyecto: sin esto el PDF del saldo pisaba el link del adelanto.
  const filaFactura = fields.fila || ''

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

    // Subir archivo (stream nuevo en cada retry para evitar consumido)
    const fileRes = await withSheetsRetry(() => drive.files.create({
      requestBody: { name: fileName, parents: [mesFolderId] },
      media: { mimeType: fileMime, body: Readable.from(fileBuffer) },
      fields: 'id,webViewLink',
      supportsAllDrives: true,
    }))

    // Asociar el link a la fila de FACTURACION
    let factualizada = false
    let avisoLink = ''
    let nroDetectado = '', accionNro = '', nroAnterior = '', leidoPorAI = false
    if (presupuestoNum || filaFactura) {
      try {
        const { sheets, SHEET_ID } = await getSheets()
        const r = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AG' }))
        const rows = r.data.values || []
        const headers = rows[0] || []
        const idxFactura = headers.indexOf('Factura')
        const ubic = ubicarFilaFactura({ rows, fila: filaFactura, presupuestoNum })
        if (ubic.error) {
          avisoLink = ubic.error
        } else if (idxFactura === -1) {
          avisoLink = 'FACTURACION no tiene la columna "Factura"'
        } else {
          const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
          const upd = [{ range: `FACTURACION!${colLetra(idxFactura)}${ubic.fila}`, values: [[fileRes.data.webViewLink]] }]

          // El N° de factura sale del nombre del PDF de AFIP (CUIT_TIPO_PTOVTA_NRO.pdf).
          // Lo pone la máquina y no se tipea: de 33 facturas con PDF había 21 con el
          // número mal escrito y una cargada con el número de otra.
          const idxNroF = headers.indexOf('Nro de Factura')
          let delPdf = nroDeNombreArchivo(fileName)
          // Plan B para los PDFs que alguien renombró a mano ("Latam Ostara.pdf"):
          // lo lee Claude. Solo si hace falta — si el nombre sirve, no gastamos la llamada.
          if (!delPdf && idxNroF !== -1 && !String(ubic.row[idxNroF] || '').trim()) {
            const leido = await nroDesdeElPdf(fileBuffer, fileMime)
            if (leido.nro) { delPdf = leido.nro; leidoPorAI = true }
          }
          if (delPdf && idxNroF !== -1) {
            const cmp = compararConPdf(ubic.row[idxNroF], delPdf)
            if (cmp.accion === 'completar' || cmp.accion === 'corregir') {
              upd.push({ range: `FACTURACION!${colLetra(idxNroF)}${ubic.fila}`, values: [[delPdf]] })
              nroDetectado = delPdf
              accionNro = cmp.accion
              nroAnterior = cmp.antes || ''
            } else if (cmp.accion === 'conflicto') {
              // No pisamos: puede ser el PDF equivocado o el número equivocado, y
              // decidirlo mal en una factura es un problema con el contador.
              accionNro = 'conflicto'
              nroDetectado = delPdf
              nroAnterior = cmp.antes
            }
          }
          // OJO: subir el PDF NO es enviarlo. Administración carga la factura y a veces
          // espera el OK para mandarla. "Fecha enviada"/"Fc Enviada" las estampa solo
          // factura-enviar, cuando el mail sale de verdad.
          await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: { valueInputOption: 'USER_ENTERED', data: upd }
          }))
          factualizada = true
        }

        // Log de la acción
        try {
          await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'LOG!A:F',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[new Date().toISOString(), mail, 'factura-upload', 'FACTURACION+DRIVE', String(presupuestoNum), `archivo=${fileName} carpeta=${entidadNombre}/${carpetaMes} link=${fileRes.data.webViewLink} fila=${ubic.fila||'-'} actualizada=${factualizada}${nroDetectado?` nro=${accionNro}:${nroDetectado}${leidoPorAI?'(AI)':''}${nroAnterior?' (antes '+nroAnterior+')':''}`:''}${avisoLink?' aviso='+avisoLink:''}`]] },
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
      avisoLink,
      nroDetectado, accionNro, nroAnterior, leidoPorAI,
    })
  } catch (e) {
    console.error('Error upload (drive):', e)
    const status = e.code || e.response?.status
    if (status === 429) return res.status(429).json({ error: 'Google está limitando los pedidos. Esperá 30 segundos y volvé a intentar.' })
    res.status(500).json({ error: e.message || 'Error subiendo archivo' })
  }
}
