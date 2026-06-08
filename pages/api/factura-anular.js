// Marca una factura como ANULADA (no la elimina, queda para auditoría)
// y elimina las entradas de COBROS asociadas si no estaban realmente cobradas.
import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { presupuestoNum, motivo } = req.body
  if (!presupuestoNum) return res.status(400).json({ error: 'Falta presupuestoNum' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AG' })
    const headers = r.data.values[0]
    const rows = r.data.values
    const idxPresu = headers.indexOf('N° Presupuesto')
    const idxNro = headers.indexOf('Nro de Factura')
    const idxNotas = headers.indexOf('COMENTARIOS')

    let filaTarget = -1, nroFactura = ''
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][idxPresu]||'').trim() === String(presupuestoNum).trim()) {
        filaTarget = i + 1
        nroFactura = rows[i][idxNro] || ''
        break
      }
    }
    if (filaTarget === -1) return res.status(404).json({ error: 'Factura no encontrada' })

    // Prependear "ANULADA - " al Nro de Factura para que sea visible y no contee en métricas
    const nroOriginal = String(nroFactura).trim()
    const yaAnulada = nroOriginal.toUpperCase().startsWith('ANULADA')
    if (yaAnulada) return res.status(409).json({ error: 'Esta factura ya está anulada' })

    const nuevoNro = `ANULADA - ${nroOriginal}`
    const updates = [{ range: `FACTURACION!${colLetra(idxNro)}${filaTarget}`, values: [[nuevoNro]] }]
    if (idxNotas !== -1) {
      const notaPrev = rows[filaTarget-1][idxNotas] || ''
      const motivoStr = motivo ? ` Motivo: ${motivo}` : ''
      updates.push({ range: `FACTURACION!${colLetra(idxNotas)}${filaTarget}`, values: [[`Anulada ${new Date().toLocaleDateString('es-AR')} por ${mail}.${motivoStr} ${notaPrev?'| '+notaPrev:''}`]] })
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
        requestBody: { values: [[new Date().toISOString(), mail, 'factura-anular', 'FACTURACION', String(presupuestoNum), `nroOriginal=${nroOriginal} motivo=${motivo||'-'}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, nroOriginal, nuevoNro })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
