// Alertas del buzón del usuario logueado (sin leer + pedidos de presupuesto).
// Lee el mail por impersonación (DWD) según el mail de la sesión.
import { google } from 'googleapis'
import { requireAuth } from '../../lib/auth-helpers'

function gmailFor(subject) {
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
    scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    clientOptions: { subject },
  })
  return google.gmail({ version: 'v1', auth })
}

export default async function handler(req, res) {
  const auth = await requireAuth(req, res)
  if (!auth) return
  const email = String(auth.mail || auth.session?.user?.email || '').toLowerCase()
  // Solo buzones del dominio (los que el DWD puede impersonar)
  if (!/@somosmagma\.com$/.test(email)) return res.json({ ok: true, mailbox: email, unread: null })

  try {
    const gmail = gmailFor(email)
    const inbox = await gmail.users.labels.get({ userId: 'me', id: 'INBOX' })
    const unread = inbox.data.messagesUnread || 0

    // Heurística de "pedido de presupuesto" entre los NO leídos
    const q = 'in:inbox is:unread (presupuesto OR cotización OR cotizacion OR cobertura OR "pedido de" OR filmación OR filmacion OR evento)'
    const pl = await gmail.users.messages.list({ userId: 'me', q, maxResults: 5 })
    const pedidos = []
    for (const m of (pl.data.messages || [])) {
      const g = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From', 'Subject'] })
      const H = n => (g.data.payload.headers.find(h => h.name === n) || {}).value || ''
      pedidos.push({ from: H('From'), subject: H('Subject') })
    }
    res.json({ ok: true, mailbox: email, unread, pedidos, pedidosCount: pl.data.resultSizeEstimate || pedidos.length })
  } catch (e) {
    res.json({ ok: false, mailbox: email, unread: null, error: e.message })
  }
}
