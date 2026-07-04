// Oversight de mails del EQUIPO — solo para dueños (Juan/Sofi/Flor).
// Devuelve, por cada compañero, sin leer + últimos pedidos relevantes de su casilla @somosmagma.
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

const OWNERS = ['juan@somosmagma.com', 'sofi@somosmagma.com', 'admin@somosmagma.com', 'arauzjuanmartin@gmail.com']
const MAILBOX_FOR = { 'arauzjuanmartin@gmail.com': 'juan@somosmagma.com' }
const TEAM = [
  { nombre: 'Sofi', mailbox: 'sofi@somosmagma.com' },
  { nombre: 'Lulu', mailbox: 'lulu@somosmagma.com' },
  { nombre: 'Tom', mailbox: 'tom@somosmagma.com' },
  { nombre: 'Flor', mailbox: 'admin@somosmagma.com' },
]
const NOISE = '-from:mercadolibre -from:mercadopago -from:instagram.com -from:facebookmail -from:linkedin -from:noreply -from:no-reply -from:notificaciones -from:google.com -from:netflix -from:youtube -from:spotify -from:mailchimp'
const Q = `in:inbox is:unread newer_than:30d ${NOISE} (presupuesto OR cotización OR cotizacion OR cobertura OR "pedido de" OR filmación OR filmacion OR filmar OR shooting OR presu)`

export default async function handler(req, res) {
  const auth = await requireAuth(req, res)
  if (!auth) return
  const email = String(auth.mail || auth.session?.user?.email || '').toLowerCase()
  if (!OWNERS.includes(email)) return res.json({ ok: true, equipo: [] }) // solo dueños

  const yoMailbox = MAILBOX_FOR[email] || email
  const miembros = TEAM.filter(m => m.mailbox !== yoMailbox)
  const equipo = []
  for (const m of miembros) {
    try {
      const gmail = gmailFor(m.mailbox)
      const inbox = await gmail.users.labels.get({ userId: 'me', id: 'INBOX' })
      const pl = await gmail.users.messages.list({ userId: 'me', q: Q, maxResults: 3 })
      const pedidos = []
      for (const msg of (pl.data.messages || [])) {
        const g = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata', metadataHeaders: ['From', 'Subject'] })
        const H = n => (g.data.payload.headers.find(h => h.name === n) || {}).value || ''
        pedidos.push({ id: msg.id, from: H('From'), subject: H('Subject') })
      }
      equipo.push({ nombre: m.nombre, mailbox: m.mailbox, unread: inbox.data.messagesUnread || 0, pedidos })
    } catch (e) {
      equipo.push({ nombre: m.nombre, mailbox: m.mailbox, error: true })
    }
  }
  res.json({ ok: true, equipo })
}
