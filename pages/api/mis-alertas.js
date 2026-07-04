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
  // Mapeo login personal → casilla de laburo (para que Juan vea sus mails de @somosmagma aun logueado con su Gmail personal)
  const MAILBOX_FOR = { 'arauzjuanmartin@gmail.com': 'juan@somosmagma.com' }
  const mailbox = MAILBOX_FOR[email] || email
  // Solo buzones del dominio (los que el DWD puede impersonar)
  if (!/@somosmagma\.com$/.test(mailbox)) return res.json({ ok: true, mailbox, unread: null })

  try {
    const gmail = gmailFor(mailbox)
    const inbox = await gmail.users.labels.get({ userId: 'me', id: 'INBOX' })
    const unread = inbox.data.messagesUnread || 0

    // Heurística de "pedido de presupuesto": no leídos recientes, sacando notificaciones/promos.
    // (Se mantienen los internos @somosmagma porque muchos presus circulan entre el equipo.)
    const NOISE = '-from:mercadolibre -from:mercadopago -from:instagram.com -from:facebookmail -from:linkedin -from:noreply -from:no-reply -from:notificaciones -from:google.com -from:netflix -from:youtube -from:spotify -from:mailchimp'
    const q = `in:inbox is:unread newer_than:30d ${NOISE} (presupuesto OR cotización OR cotizacion OR cobertura OR "pedido de" OR filmación OR filmacion OR filmar OR shooting OR presu)`
    const pl = await gmail.users.messages.list({ userId: 'me', q, maxResults: 8 })
    const pedidos = []
    for (const m of (pl.data.messages || [])) {
      const g = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] })
      const H = n => (g.data.payload.headers.find(h => h.name === n) || {}).value || ''
      pedidos.push({ id: m.id, from: H('From'), subject: H('Subject'), date: H('Date'), snippet: g.data.snippet || '' })
    }
    res.json({ ok: true, mailbox, unread, pedidos, pedidosCount: pl.data.resultSizeEstimate || pedidos.length })
  } catch (e) {
    res.json({ ok: false, mailbox, unread: null, error: e.message })
  }
}
