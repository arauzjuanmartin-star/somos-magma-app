// Borra (anula) una factura de FACTURACION. Para errores: facturas mal cargadas,
// notas de crédito, duplicados. Si hay varias del mismo N°, prioriza la NO cobrada
// (y si se pasa monto, la que coincide). No borra cobradas salvo forzar.
import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const num = v => parseFloat(String(v||'0').replace(/[^\d.-]/g,''))||0

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  // `fila` = __row de FACTURACION. Con adelanto + saldo el desempate por monto puede
  // errarle (dos facturas del mismo importe): si la UI manda la fila, mandamos esa.
  const { nroPresupuesto, monto, forzar = false, fila } = req.body || {}
  if (!nroPresupuesto) return res.status(400).json({ error: 'Falta nroPresupuesto' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AG' })
    const rows = r.data.values || [], h = rows[0] || []
    const H = n => h.indexOf(n)
    const iNum = H('N° Presupuesto'), iFinal = H('Precio FINAL'), iNeto = H('Precio SIN IVA'), iProy = H('Proyecto')
    const iCob = h.findIndex(x => /^cobrado$/i.test(x))
    const esCob = row => ['true','sí','si'].includes(String(row[iCob]||'').toLowerCase().trim())

    const cand = []
    for (let i = 1; i < rows.length; i++) if (String(rows[i][iNum]||'').trim() === String(nroPresupuesto).trim()) cand.push(i)
    if (!cand.length) return res.status(404).json({ error: 'No encontré la factura' })

    const montoT = num(monto)
    let pick = null
    const nFila = parseInt(fila)
    if (nFila > 1 && String(rows[nFila-1]?.[iNum]||'').trim() === String(nroPresupuesto).trim()) pick = nFila - 1
    if (pick == null && montoT > 0) pick = cand.find(i => Math.abs(num(rows[i][iFinal]) - montoT) < 1 || Math.abs(num(rows[i][iNeto]) - montoT) < 1)
    if (pick == null) pick = cand.find(i => !esCob(rows[i]))
    if (pick == null) pick = cand[0]

    if (esCob(rows[pick]) && !forzar) {
      return res.status(409).json({ error: 'Esa factura está marcada como COBRADA. Si igual querés borrarla, confirmá de nuevo.', requiereForzar: true })
    }

    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties(sheetId,title))' })
    const sid = meta.data.sheets.find(s => /facturacion/i.test(s.properties.title)).properties.sheetId
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{ deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: pick, endIndex: pick + 1 } } }] } })

    try {
      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'factura-borrada', 'FACTURACION', String(nroPresupuesto), `"${rows[pick][iProy]||''}" final=${rows[pick][iFinal]||''}`]] } })
    } catch (e) {}

    res.json({ ok: true })
  } catch (e) {
    console.error('factura-borrar:', e)
    res.status(500).json({ error: e.message })
  }
}
