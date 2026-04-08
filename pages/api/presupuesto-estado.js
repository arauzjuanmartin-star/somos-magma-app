import { getSheets } from '../../lib/sheets'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { num, estado, motivo } = req.body
  try {
    const sheets = await getSheets()
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'PRESUPUESTOS!A:D',
    })
    const rows = r.data.values || []
    let rowIndex = -1
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(num)) { rowIndex = i + 1; break }
    }
    if (rowIndex === -1) return res.status(404).json({ error: 'No encontrado' })
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: `PRESUPUESTOS!D${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[estado]] }
    })
    if (motivo) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SHEET_ID,
        range: `PRESUPUESTOS!AU${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[motivo]] }
      })
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
