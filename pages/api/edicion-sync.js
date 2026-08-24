// Sincroniza la solapa EDICION con PROYECTOS. La lógica vive en lib/edicion-sync.js
// para que los scripts locales corran exactamente lo mismo que la app.

import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { sincronizarEdicion } from '../../lib/edicion-sync'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail
  const { desdeDias = 30, hastaDias = 180 } = req.body || {}

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sincronizarEdicion({ sheets, SHEET_ID, desdeDias, hastaDias })
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'edicion-sync', 'EDICION', '', `${r.nuevas} nuevas · ${r.actualizadas} actualizadas · ${r.vistos} líneas en ventana`]] },
      })
    } catch (e) {}
    res.json({ ok: true, nuevas: r.nuevas, actualizadas: r.actualizadas, vistos: r.vistos })
  } catch (e) {
    console.error('edicion-sync:', e)
    res.status(500).json({ error: e.message })
  }
}
