import { getSheets } from '../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

  const { nombre, saldo, notas } = req.body || {}
  if (!nombre) return res.status(400).json({ error: 'Falta nombre de cuenta' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CUENTAS!A:H' })
    const rows = r.data.values || []
    const headers = rows[0] || []
    const idxNombre = headers.indexOf('Nombre')
    const idxSaldo = headers.indexOf('Saldo actual')
    const idxFecha = headers.indexOf('Última actualización')
    const idxNotas = headers.indexOf('Notas')
    if (idxNombre < 0 || idxSaldo < 0) return res.status(500).json({ error: 'Headers no coinciden en CUENTAS' })

    const rowIdx = rows.findIndex((row, i) => i > 0 && String(row[idxNombre] || '').trim() === String(nombre).trim())
    if (rowIdx < 0) return res.status(404).json({ error: `Cuenta "${nombre}" no encontrada` })

    const sheetRow = rowIdx + 1 // 1-based
    const now = new Date()
    const fechaStr = now.getDate()+'/'+(now.getMonth()+1)+'/'+now.getFullYear()

    const col = n => String.fromCharCode(65 + n)
    const updates = [
      { range: `CUENTAS!${col(idxSaldo)}${sheetRow}`, values: [[Number(saldo) || 0]] },
      { range: `CUENTAS!${col(idxFecha)}${sheetRow}`, values: [[fechaStr]] },
    ]
    if (typeof notas === 'string' && idxNotas >= 0) {
      updates.push({ range: `CUENTAS!${col(idxNotas)}${sheetRow}`, values: [[notas]] })
    }
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
    })

    // LOG
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'saldo-cuenta', 'CUENTAS', nombre, `saldo=${saldo}`]] },
      })
    } catch (e) { /* LOG puede no existir aún */ }

    res.status(200).json({ ok: true, fecha: fechaStr })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, error: err.message })
  }
}
