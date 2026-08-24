// La página "Cómo trabajamos" del área de post — el lugar donde vive todo lo
// que un editor nuevo necesita saber sin preguntar. Vive en la solapa
// EDICION_INFO para que quede en el sheet como todo lo demás.
//
// GET  → { secciones: [{orden, titulo, contenido, actualizado, por}] }
// POST → { orden, titulo, contenido }  crea o pisa esa sección
//        { orden, borrar:true }        la elimina

import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const RANGO = 'EDICION_INFO!A:E'

export default async function handler(req, res) {
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  try {
    const { sheets, SHEET_ID } = await getSheets()

    if (req.method === 'GET') {
      const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: RANGO })
      const rows = r.data.values || []
      const secciones = rows.slice(1)
        .filter(x => String(x[1] || '').trim() || String(x[2] || '').trim())
        .map(x => ({ orden: parseInt(x[0]) || 0, titulo: x[1] || '', contenido: x[2] || '', actualizado: x[3] || '', por: x[4] || '' }))
        .sort((a, b) => a.orden - b.orden)
      return res.json({ ok: true, secciones })
    }

    if (req.method !== 'POST') return res.status(405).end()
    const { orden, titulo, contenido, borrar } = req.body || {}
    if (orden == null) return res.status(400).json({ error: 'Falta orden' })

    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: RANGO })
    const rows = r.data.values || []
    if (!rows.length) return res.status(400).json({ error: 'Falta la solapa EDICION_INFO — correr scripts/edicion-info-setup.mjs --escribir' })

    let sheetRow = -1
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0] || '').trim() === String(orden).trim()) { sheetRow = i + 1; break }
    }

    if (borrar) {
      if (sheetRow === -1) return res.json({ ok: true, sinCambios: true })
      // Vaciamos la fila en vez de borrarla: no rompe el orden de nada y es reversible
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID, range: `EDICION_INFO!A${sheetRow}:E${sheetRow}`,
        valueInputOption: 'RAW', requestBody: { values: [['', '', '', new Date().toISOString(), mail]] },
      })
      return res.json({ ok: true, borrada: true })
    }

    const fila = [String(orden), titulo || '', contenido || '', new Date().toISOString(), mail]
    if (sheetRow === -1) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: RANGO,
        valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [fila] },
      })
    } else {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID, range: `EDICION_INFO!A${sheetRow}:E${sheetRow}`,
        valueInputOption: 'RAW', requestBody: { values: [fila] },
      })
    }
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'edicion-info', 'EDICION_INFO', String(orden), titulo || '']] },
      })
    } catch (e) {}
    res.json({ ok: true })
  } catch (e) {
    console.error('edicion-info:', e)
    res.status(500).json({ error: e.message })
  }
}
