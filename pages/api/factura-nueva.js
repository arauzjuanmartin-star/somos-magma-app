import { getSheets } from '../../lib/sheets'

const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  const {
    num, entidad, tipo, nroFactura, fechaEmision, fechaVenc, plazo,
    conIVA, neto, iva, total, presupuestoNum, proyecto, agencia, cliente,
    forzar, // permite saltar validación de duplicado (si el user lo confirma)
  } = req.body

  try {
    const { sheets, SHEET_ID } = await getSheets()

    // Validar N° de factura duplicado
    if (nroFactura && !forzar) {
      const check = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'FACTURACION!A:O',
      })
      const headers = check.data.values?.[0] || []
      const idxN = headers.indexOf('Nro de Factura')
      const idxPresu = headers.indexOf('N° Presupuesto')
      const idxCliente = headers.indexOf('Cliente')
      if (idxN !== -1) {
        const dup = check.data.values.slice(1).find(row =>
          String(row[idxN]||'').trim() === String(nroFactura).trim()
        )
        if (dup) {
          return res.status(409).json({
            error: 'N° de factura ya existe',
            duplicado: {
              nroFactura,
              presupuesto: dup[idxPresu],
              cliente: dup[idxCliente],
            },
            mensaje: `Ya hay una factura con N° "${nroFactura}" cargada (presupuesto #${dup[idxPresu]} — ${dup[idxCliente]}). Confirmá si querés crearla igual.`,
          })
        }
      }
    }

    const hoy = new Date()
    const mesStr = String(hoy.getMonth()+1).padStart(2,'0') + ' - ' + MESES[hoy.getMonth()]
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'FACTURACION!A:Y',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[
        mesStr, presupuestoNum, false, false, false, '', '',
        agencia||'', cliente||'', proyecto||'',
        neto, iva, total,
        'Factura '+tipo, nroFactura||'',
        fechaEmision||'', true, plazo||'', 0, fechaVenc||'',
        0, '', '', '', ''
      ]] }
    })

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'factura-nueva', 'FACTURACION', String(presupuestoNum), `nro=${nroFactura||'-'} ${entidad}-${tipo} $${total} cliente=${cliente||''}`]] },
      })
    } catch (e) {}

    res.json({ ok: true })
  } catch(e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
