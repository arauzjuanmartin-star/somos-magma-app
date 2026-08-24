import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { ubicarFilaFactura } from '../../lib/factura-fila'

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  // `fila` = __row de FACTURACION. Un proyecto puede tener adelanto + saldo: sin la fila
  // exacta se editaba siempre la primera factura.
  const { presupuestoNum, cambios, fila } = req.body
  if ((!presupuestoNum && !fila) || !cambios) return res.status(400).json({ error: 'Falta presupuestoNum/fila o cambios' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AG' })
    const headers = r.data.values[0]
    const rows = r.data.values
    const ubic = ubicarFilaFactura({ rows, fila, presupuestoNum })
    if (ubic.error) return res.status(ubic.ambigua ? 409 : 404).json({ error: ubic.error })
    const filaTarget = ubic.fila

    const updates = []
    Object.entries(cambios).forEach(([campo, valor]) => {
      const idx = headers.indexOf(campo)
      if (idx === -1) return
      updates.push({ range: `FACTURACION!${colLetra(idx)}${filaTarget}`, values: [[valor]] })
    })

    if (updates.length === 0) return res.json({ ok: true, msg: 'Nada para actualizar' })

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
    })

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'factura-editar', 'FACTURACION', String(presupuestoNum), `fila=${filaTarget} campos=${Object.keys(cambios).join(',')}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, fila: filaTarget, campos: updates.length })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
