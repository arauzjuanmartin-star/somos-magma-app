import crypto from 'crypto'
import { getSheets } from '../../lib/sheets'
import { filaWA, agregarFilas, leerWA, responderSiCorresponde } from '../../lib/whatsapp'

// Webhook de WhatsApp Cloud API (Meta).
//  - GET: handshake de verificación (Meta manda hub.verify_token → devolvemos hub.challenge).
//  - POST: mensajes entrantes → se guardan en la solapa WHATSAPP y el bot contesta (lib/whatsapp.js).
// Ruta PÚBLICA (ver middleware.js). Seguridad: verify_token en el GET + firma X-Hub-Signature-256 en el POST.
// maxDuration: el bot tarda unos segundos en pensar la respuesta; el default de Vercel (10 s) quedaba justo.
export const config = { api: { bodyParser: false }, maxDuration: 60 }

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

  // 2) Verificar la firma de Meta. Sin el app secret cargado no se acepta nada: esta ruta es pública y escribe
  //    al Master, así que sin firma cualquiera con el link podría meter filas (y fórmulas) en la solapa WHATSAPP.
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret) return res.status(503).json({ error: 'Falta la variable WHATSAPP_APP_SECRET en Vercel: sin la firma de Meta no se recibe nada.' })
  const sig = String(req.headers['x-hub-signature-256'] || '')
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex')
  const ok = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  if (!ok) { console.warn('WA webhook: firma inválida'); return res.status(401).end() }

  let body = {}
  try { body = JSON.parse(raw || '{}') } catch (e) {}

  // 3) Extraer mensajes entrantes → filas. Los avisos de "entregado/leído" (v.statuses) no se guardan.
  try {
    const nuevos = []
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
          nuevos.push({ telefono: m.from || '', nombre: nombreDe(m.from), fila: filaWA({ ts, direccion: 'Entrante', telefono: m.from || '', nombre: nombreDe(m.from), mensaje: texto, tipo, wamid: m.id || '', estado: 'recibido' }), wamid: m.id || '' })
        }
      }
    }
    if (nuevos.length) {
      const { sheets, SHEET_ID } = await getSheets()
      // Meta reintenta si tardamos en contestar: el mismo mensaje puede llegar dos veces. Se guarda y se
      // contesta una sola vez (por WA Message ID).
      const vistos = new Set((await leerWA(sheets, SHEET_ID)).map(m => m.wamid).filter(Boolean))
      const frescos = nuevos.filter(n => !n.wamid || !vistos.has(n.wamid))
      await agregarFilas(sheets, SHEET_ID, frescos.map(n => n.fila))
      // Una respuesta por número aunque haya mandado tres mensajes seguidos: el bot lee la charla entera.
      const porNumero = new Map(frescos.map(n => [n.telefono, n.nombre]))
      for (const [telefono, nombre] of porNumero) await responderSiCorresponde({ sheets, SHEET_ID, telefono, nombre })
    }
  } catch (err) { console.error('WA webhook procesar:', err) }

  // 4) Responder 200 a Meta (siempre, para que no reintente)
  return res.status(200).json({ received: true })
}
