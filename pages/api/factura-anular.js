// Marca una factura como ANULADA (no la elimina, queda para auditoría)
// y elimina las entradas de COBROS asociadas si no estaban realmente cobradas.
import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { ubicarFilaFactura } from '../../lib/factura-fila'
import { Readable } from 'stream'
import { getDrive, carpetaDe, DRIVE_ADMINISTRACION, nombreLimpio, fechaArchivo } from '../../lib/seguros-drive'

// El PDF de la NC viaja en base64 (tope 3 MB: Vercel corta en 4,5 MB)
export const config = { api: { bodyParser: { sizeLimit: '4.4mb' } } }

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  // `fila` = __row de FACTURACION. Con adelanto + saldo hay 2 facturas del mismo proyecto
  // y anular por N° de presupuesto anulaba la del adelanto.
  const { presupuestoNum, motivo, fila, nroNC, pdf } = req.body
  if (!presupuestoNum && !fila) return res.status(400).json({ error: 'Falta presupuestoNum o fila' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AG' })
    const headers = r.data.values[0]
    const rows = r.data.values
    const idxNro = headers.indexOf('Nro de Factura')
    const idxNotas = headers.indexOf('COMENTARIOS')

    const ubic = ubicarFilaFactura({ rows, fila, presupuestoNum })
    if (ubic.error) return res.status(ubic.ambigua ? 409 : 404).json({ error: ubic.error })
    const filaTarget = ubic.fila
    const nroFactura = ubic.row[idxNro] || ''

    // Prependear "ANULADA - " al Nro de Factura para que sea visible y no contee en métricas
    const nroOriginal = String(nroFactura).trim()
    const yaAnulada = nroOriginal.toUpperCase().startsWith('ANULADA')
    if (yaAnulada) return res.status(409).json({ error: 'Esta factura ya está anulada' })

    // El PDF de la nota de crédito, a ADMINISTRACION / Notas de credito (best-effort: si falla, se anula igual y se avisa)
    let linkNC = '', avisoNC = ''
    if (pdf?.base64) {
      try {
        const drive = getDrive()
        const carpeta = await carpetaDe(drive, 'Notas de credito', DRIVE_ADMINISTRACION)
        const f = await drive.files.create({
          requestBody: { name: `#${String(presupuestoNum).trim()} · ${fechaArchivo()} · NC ${nombreLimpio(nroNC || '')} · ${nombreLimpio(pdf.nombre)}`, parents: [carpeta] },
          media: { mimeType: pdf.tipo || 'application/pdf', body: Readable.from(Buffer.from(pdf.base64, 'base64')) },
          fields: 'id,webViewLink', supportsAllDrives: true,
        })
        linkNC = f.data.webViewLink
      } catch (e) { console.error('factura-anular pdf', e); avisoNC = 'No se pudo subir el PDF de la NC: ' + e.message }
    }

    const nuevoNro = `ANULADA - ${nroOriginal}`
    const updates = [{ range: `FACTURACION!${colLetra(idxNro)}${filaTarget}`, values: [[nuevoNro]] }]
    if (idxNotas !== -1) {
      const notaPrev = rows[filaTarget-1][idxNotas] || ''
      const motivoStr = motivo ? ` Motivo: ${motivo}` : ''
      const ncStr = (nroNC || linkNC) ? ` NC ${String(nroNC || '').trim()}${linkNC ? ' ' + linkNC : ''}.` : ''
      updates.push({ range: `FACTURACION!${colLetra(idxNotas)}${filaTarget}`, values: [[`Anulada ${new Date().toLocaleDateString('es-AR')} por ${mail}.${ncStr}${motivoStr} ${notaPrev?'| '+notaPrev:''}`]] })
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
    })

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'factura-anular', 'FACTURACION', String(presupuestoNum), `fila=${filaTarget} nroOriginal=${nroOriginal} NC=${nroNC||'-'} ${linkNC} motivo=${motivo||'-'}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, nroOriginal, nuevoNro, fila: filaTarget, linkNC, avisoNC })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
