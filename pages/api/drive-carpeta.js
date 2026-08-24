// Crea (o encuentra) la carpeta de un proyecto en las unidades compartidas y
// guarda el link en PROYECTOS. Idempotente: llamarlo dos veces no duplica nada.
//
// body: { num, destinos:['crudo','entregas'], compartir:bool, dryRun:bool }

import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { asegurarCarpetasProyecto } from '../../lib/drive'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { num, destinos = ['crudo'], compartir = false, dryRun = false } = req.body || {}
  if (!num) return res.status(400).json({ error: 'Falta num' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await asegurarCarpetasProyecto({ sheets, SHEET_ID, num, destinos, compartir, dryRun })
    if (!dryRun) {
      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[new Date().toISOString(), mail, 'drive-carpeta', 'DRIVE', String(num), r.pasos.join(' | ') + (r.compartido ? ` · compartido con ${r.compartido.ok.length}` : '')]] },
        })
      } catch (e) {}
    }
    res.json({ ok: true, ...r })
  } catch (e) {
    console.error('drive-carpeta:', e)
    res.status(500).json({ error: e.message })
  }
}
