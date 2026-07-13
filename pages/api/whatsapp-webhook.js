import crypto from 'crypto'
import { getSheets } from '../../lib/sheets'

// Webhook de WhatsApp Cloud API (Meta).
//  - GET: handshake de verificación (Meta manda hub.verify_token → devolvemos hub.challenge).
//  - POST: mensajes entrantes → se guardan en la solapa WHATSAPP.
// Ruta PÚBLICA (ver middleware.js). Seguridad: verify_token en el GET + firma X-Hub-Signature-256 en el POST.
export const config = { api: { bodyParser: false } }

function readRaw(req) {
  return new Promise((resolve) => { let d = ''; req.on('data', c => (d += c)); req.on('end', () => resolve(d)) })
}

export default async function handler(req, res) {
  // 1) Verificación del webhook
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'], token = req.query['hub.verify_token'], challenge = req.query['hub.challenge']
    if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) return res.status(200).send(challenge)
    return res.status(403).end()
  }
  if (req.method !== 'POST') return res.status(405).end()

  const raw = await readRaw(req)

  // 2) Verificar firma si está configurado el app secret (recomendado)
  const secret = process.env.WHATSAPP_APP_SECRET
  if (secret) {
    const sig = req.headers['x-hub-signature-256'] || ''
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex')
    const ok = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    if (!ok) { console.warn('WA webhook: firma inválida'); return res.status(401).end() }
  }

  let body = {}
  try { body = JSON.parse(raw || '{}') } catch (e) {}

  // 3) Extraer mensajes entrantes → filas
  try {
    const filas = []
    for (const e of (body.entry || [])) {
      for (const ch of (e.changes || [])) {
        const v = ch.value || {}
        const contactos = v.contacts || []
        const nombreDe = id => contactos.find(c => c.wa_id === id)?.profile?.name || ''
        for (const m of (v.messages || [])) {
          const tipo = m.type || 'text'
          let texto = ''
          if (tipo === 'text') texto = m.text?.body || ''
          else if (m[tipo]?.caption) texto = `[${tipo}] ${m[tipo].caption}`
          else if (tipo === 'button') texto = m.button?.text || '[button]'
          else if (tipo === 'interactive') texto = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '[interactive]'
          else texto = `[${tipo}]`
          const ts = new Date(Number(m.timestamp || Math.floor(Date.now() / 1000)) * 1000)
          filas.push([ts.toISOString(), ts.toLocaleDateString('es-AR'), ts.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }), 'Entrante', m.from || '', nombreDe(m.from), texto, tipo, m.id || '', 'recibido', 'NO', ''])
        }
      }
    }
    if (filas.length) {
      const { sheets, SHEET_ID } = await getSheets()
      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'WHATSAPP!A:L', valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: filas } })
    }
  } catch (err) { console.error('WA webhook procesar:', err) }

  // 4) Responder 200 a Meta (siempre, para que no reintente)
  return res.status(200).json({ received: true })
}
