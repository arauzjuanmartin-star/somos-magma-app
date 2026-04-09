import { getSheets } from '../../lib/sheets'

const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { num, entidad, tipo, nroFactura, fechaEmision, fechaVenc, plazo, conIVA, neto, iva, total, presupuestoNum, proyecto, agencia, cliente } = req.body
  try {
    const { sheets, SHEET_ID } = await getSheets()
    const hoy = new Date()
    const mesStr = String(hoy.getMonth()+1).padStart(2,'0') + ' - ' + MESES[hoy.getMonth()]
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'FACTURACION!A:Y',
      valueInputOption: 'RAW',
      requestBody: { values: [[mesStr, presupuestoNum, false, false, false, '', '', agencia||'', cliente||'', proyecto||'', neto, iva, total, 'Factura '+tipo, nroFactura||'', fechaEmision||'', true, plazo||'', 0, fechaVenc||'', 0, '', '', '', '']] }
    })
    res.json({ ok: true })
  } catch(e) { res.status(500).json({ error: e.message }) }
}
