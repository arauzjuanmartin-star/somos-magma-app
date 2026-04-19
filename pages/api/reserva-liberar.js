import { getSheets } from '../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

// Libera una reserva buscando por cuenta+concepto+fecha (identidad compuesta)
// Alternativa: buscar por indice de fila (mas robusto). Se acepta rowIndex opcional.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

  const { cuenta, concepto, fecha, rowIndex: rowIndexClient } = req.body || {}
  if (!cuenta && !rowIndexClient) return res.status(400).json({ error: 'Faltan datos' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'RESERVAS!A:I' })
    const rows = r.data.values || []
    const headers = rows[0] || []
    const iCuenta = headers.indexOf('Cuenta')
    const iConcepto = headers.indexOf('Concepto')
    const iFecha = headers.indexOf('Fecha')
    const iActiva = headers.indexOf('Activa')
    const iLib = headers.indexOf('Fecha liberación')
    if (iActiva < 0 || iLib < 0) return res.status(500).json({ error: 'Headers no coinciden en RESERVAS' })

    let rowIdx = -1
    if (rowIndexClient && rowIndexClient >= 1) rowIdx = Number(rowIndexClient)
    else {
      rowIdx = rows.findIndex((r, i) => i > 0 && r[iCuenta] === cuenta && r[iConcepto] === concepto && r[iFecha] === fecha)
      if (rowIdx > 0) rowIdx = rowIdx + 1 // 1-based
    }
    if (rowIdx < 1) return res.status(404).json({ error: 'Reserva no encontrada' })

    const now = new Date()
    const fechaStr = now.getDate()+'/'+(now.getMonth()+1)+'/'+now.getFullYear()
    const col = n => String.fromCharCode(65 + n)

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: [
        { range: `RESERVAS!${col(iActiva)}${rowIdx}`, values: [['NO']] },
        { range: `RESERVAS!${col(iLib)}${rowIdx}`, values: [[fechaStr]] },
      ]},
    })

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'reserva-liberar', 'RESERVAS', `fila ${rowIdx}`, '']] },
      })
    } catch (e) {}

    res.status(200).json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, error: err.message })
  }
}
