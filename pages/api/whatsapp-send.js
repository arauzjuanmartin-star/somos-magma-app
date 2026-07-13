import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

// Envía un mensaje de WhatsApp por la Cloud API de Meta y lo registra en la solapa WHATSAPP.
// Solo para responder DENTRO de la ventana de 24h (texto libre). Para iniciar conversación
// fuera de 24h Meta exige plantillas pre-aprobadas (se agrega después con type:'template').
const GRAPH = 'https://graph.facebook.com/v20.0'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { to, text } = req.body
  if (!to || !text || !String(text).trim()) return res.status(400).json({ error: 'Falta el destinatario o el texto' })
  const PHONE = process.env.WHATSAPP_PHONE_ID, TOKEN = process.env.WHATSAPP_TOKEN
  if (!PHONE || !TOKEN) return res.status(500).json({ error: 'Falta configurar WHATSAPP_PHONE_ID y WHATSAPP_TOKEN en las variables de entorno de Vercel' })
  const dest = String(to).replace(/[^\d]/g, '')

  try {
    const r = await fetch(`${GRAPH}/${PHONE}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: dest, type: 'text', text: { preview_url: true, body: String(text) } }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.error) return res.status(400).json({ error: j.error?.message || 'Error al enviar el mensaje', detalle: j.error || null })

    const wamid = j.messages?.[0]?.id || ''
    const ts = new Date()
    try {
      const { sheets, SHEET_ID } = await getSheets()
      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'WHATSAPP!A:L', valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: [[ts.toISOString(), ts.toLocaleDateString('es-AR'), ts.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }), 'Saliente', dest, '', String(text), 'text', wamid, 'enviado', '', mail]] } })
    } catch (e) { console.error('WA send log:', e.message) }

    res.json({ ok: true, wamid })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
