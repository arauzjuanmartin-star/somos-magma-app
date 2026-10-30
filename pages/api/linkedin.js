import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

// La rutina de LinkedIn del día (la arma scripts/linkedin-dia.mjs a las 8:45 en la solapa LINKEDIN).
//   GET  → la última fila: { fecha, ...datos, hechos: [claves] }
//   POST { fecha, hechos: [claves] } → guarda lo que Juan tildó en la columna "Hechos" (E) de esa fecha.
//        Las claves son "inv:<persona>", "com:<agencia>", "bienvenida", "compartir", "mejora:<id>".
//        Al otro día el script lee esta columna y no vuelve a proponer lo hecho.

export default async function handler(req, res) {
  const auth = await requireAuth(req, res)
  if (!auth) return
  try {
    const { sheets, SHEET_ID } = await getSheets()
    let filas = []
    try {
      const r = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'LINKEDIN!A:F' }))
      filas = r.data.values || []
    } catch (e) { return res.status(200).json({ vacio: true }) } // la solapa la crea el script en su primera corrida
    // Por nombre de header, no por posición
    const h = filas[0] || []
    const iF = h.indexOf('Fecha'), iH = h.indexOf('Hechos'), iD = h.indexOf('Datos (no tocar)')
    if (iF < 0 || iH < 0 || iD < 0) return res.status(500).json({ error: 'La solapa LINKEDIN cambió de columnas' })

    if (req.method === 'POST') {
      const { fecha, hechos } = req.body || {}
      const i = filas.findIndex((f, k) => k > 0 && f[iF] === fecha)
      if (i < 0) return res.status(404).json({ error: 'No encuentro ese día en LINKEDIN' })
      const col = String.fromCharCode(65 + iH)
      const valor = [...new Set((hechos || []).map(String))].join(', ')
      await withSheetsRetry(() => sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `LINKEDIN!${col}${i + 1}`, valueInputOption: 'RAW', requestBody: { values: [[valor]] } }))
      return res.status(200).json({ ok: true })
    }

    const ult = filas.slice(1).filter(f => f[iD]).pop()
    if (!ult) return res.status(200).json({ vacio: true })
    const datos = JSON.parse(ult[iD])
    return res.status(200).json({ ...datos, fecha: ult[iF], hechos: String(ult[iH] || '').split(',').map(s => s.trim()).filter(Boolean) })
  } catch (e) {
    console.error('linkedin:', e)
    return res.status(500).json({ error: e.message })
  }
}
