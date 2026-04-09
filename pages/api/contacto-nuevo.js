import { getSheets } from '../../lib/sheets'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { nombre, mail, telefono, cuit, agencia, cargo } = req.body
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' })
  try {
    const { sheets, SHEET_ID } = await getSheets()
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Contactos/agencias!A:H',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[nombre, mail||'', agencia||'', '', cargo||'', telefono||'', '', cuit||'']] }
    })
    res.json({ ok: true })
  } catch(e) { res.status(500).json({ error: e.message }) }
}
