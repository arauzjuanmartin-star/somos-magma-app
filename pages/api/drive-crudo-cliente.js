// Deja el crudo a mano del cliente: acceso directo dentro de su carpeta de
// entrega + permiso de lectura sobre la carpeta de crudo.
// body: { num, mails: ['contacto@cliente.com', ...] }

import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { darCrudoAlCliente } from '../../lib/drive'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { num, mails = [] } = req.body || {}
  if (!num) return res.status(400).json({ error: 'Falta num' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await darCrudoAlCliente({ sheets, SHEET_ID, num, mails })
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'drive-crudo-cliente', 'DRIVE', String(num), `atajo=${r.atajo.creado ? 'creado' : 'ya estaba'} · lectura a: ${(r.permisos?.ok || []).join(', ') || '(nadie)'}`]] },
      })
    } catch (e) {}
    res.json({ ok: true, ...r })
  } catch (e) {
    console.error('drive-crudo-cliente:', e)
    res.status(500).json({ error: e.message })
  }
}
