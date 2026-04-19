import { getSheets } from '../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

  const { cuenta, concepto, monto, tipo, origen, notas } = req.body || {}
  if (!cuenta || !concepto || !monto) return res.status(400).json({ error: 'Faltan cuenta, concepto o monto' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const now = new Date()
    const fechaStr = now.getDate()+'/'+(now.getMonth()+1)+'/'+now.getFullYear()

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'RESERVAS!A:I',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[cuenta, concepto, Number(monto)||0, fechaStr, tipo||'Otros', origen||'', 'SÍ', '', notas||'']] },
    })

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'reserva-nueva', 'RESERVAS', cuenta, `${concepto} ${monto} (${tipo||'Otros'})`]] },
      })
    } catch (e) {}

    res.status(200).json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, error: err.message })
  }
}
