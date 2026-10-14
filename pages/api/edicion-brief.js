// Adjuntar el brief que mandó el cliente (PDF, doc, planilla, imagen) a un trabajo de Edición.
// Sofi, 14/10/2026: los clientes mandan el brief en un archivo y quedaba perdido en el mail
// o en el WhatsApp del PM; el editor no lo veía.
//
// El archivo va a la carpeta del trabajo en CRUDO (la que ya ve el editor; si no existe se
// crea igual que con "Crudo") y el link queda en la columna "Brief adjunto" de TODAS las
// piezas de ese N°: el brief es del trabajo, no de un video. Varios archivos = uno por línea.
//
// body: { id, nombre, tipo, base64 }
import { Readable } from 'stream'
import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { HEADERS_EDICION } from '../../lib/edicion'
import { asegurarCarpetasProyecto } from '../../lib/drive'
import { getDrive, nombreLimpio, fechaArchivo } from '../../lib/seguros-drive'

// Vercel corta el pedido en 4,5 MB: en base64 eso es ~3 MB de archivo.
export const config = { api: { bodyParser: { sizeLimit: '4.4mb' } } }
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const ULT_COL = colLetra(HEADERS_EDICION.length - 1)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const { id, nombre, tipo, base64 } = req.body || {}
  if (!id || !base64) return res.status(400).json({ error: 'Falta el trabajo o el archivo' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `EDICION!A:${ULT_COL}` }))
    const rows = r.data.values || []
    const H = (rows[0] || []).map(x => String(x).trim())
    const iID = H.indexOf('ID'), iNum = H.indexOf('N° presupuesto'), iBrief = H.indexOf('Brief adjunto')
    if (iBrief < 0) return res.status(400).json({ error: 'Falta la columna "Brief adjunto" en EDICION (correr scripts/edicion-setup.mjs --escribir)' })
    const fila = rows.find((x, i) => i > 0 && String(x[iID] || '').trim() === String(id).trim())
    if (!fila) return res.status(404).json({ error: `No existe el trabajo ${id}` })
    const num = String(fila[iNum] || '').trim()

    // La carpeta del trabajo en CRUDO. Las tareas cargadas a mano sin N° no tienen carpeta.
    if (!num) return res.status(400).json({ error: 'Esta tarea no tiene N° de presupuesto: no hay carpeta del trabajo donde guardarlo' })
    const c = await asegurarCarpetasProyecto({ sheets, SHEET_ID, num, destinos: ['crudo'] })
    const carpeta = c.crudo?.id
    if (!carpeta) return res.status(500).json({ error: 'No pude encontrar ni crear la carpeta del trabajo en Drive' })

    const drive = getDrive()
    const limpio = nombreLimpio(nombre || 'brief')
    const f = await drive.files.create({
      requestBody: { name: `BRIEF · ${fechaArchivo()} · ${limpio}`, parents: [carpeta] },
      media: { mimeType: tipo || 'application/octet-stream', body: Readable.from(Buffer.from(base64, 'base64')) },
      fields: 'id,webViewLink', supportsAllDrives: true,
    })
    const linea = `${limpio.replace(/\|/g, '-')} | ${f.data.webViewLink}`

    // A todas las piezas del trabajo, sumando abajo de lo que ya haya.
    const data = []
    rows.forEach((x, i) => {
      if (i === 0 || String(x[iNum] || '').trim() !== num) return
      const ya = String(x[iBrief] || '').trim()
      data.push({ range: `EDICION!${colLetra(iBrief)}${i + 1}`, values: [[ya ? `${ya}\n${linea}` : linea]] })
    })
    await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'RAW', data } }))
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), auth.mail, 'edicion-brief', 'EDICION', num, `${limpio} → ${data.length} piezas · ${f.data.webViewLink}`]] },
      })
    } catch (e) {}
    res.json({ ok: true, num, linea, piezas: data.length, link: f.data.webViewLink })
  } catch (e) {
    console.error('edicion-brief', e)
    res.status(500).json({ error: e.message })
  }
}
