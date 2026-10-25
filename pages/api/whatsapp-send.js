import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { enviarTexto, filaWA, agregarFilas } from '../../lib/whatsapp'

// Envía un mensaje de WhatsApp por la Cloud API de Meta y lo registra en la solapa WHATSAPP.
// Solo para responder DENTRO de la ventana de 24h (texto libre). Para iniciar conversación
// fuera de 24h Meta exige plantillas pre-aprobadas (se agrega después con type:'template').
// En Notas queda el mail de quien lo mandó: eso le dice al bot que una persona tomó la charla y se calla 24 h.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { to, text } = req.body
  if (!to || !text || !String(text).trim()) return res.status(400).json({ error: 'Falta el destinatario o el texto' })
  const dest = String(to).replace(/[^\d]/g, '')

  let wamid
  try { wamid = await enviarTexto(dest, text) } catch (e) {
    const fuera24 = e.detalle?.code === 131047
    return res.status(400).json({ error: fuera24 ? 'Pasaron más de 24 h desde el último mensaje de esta persona: WhatsApp no deja escribirle texto libre (hace falta una plantilla aprobada).' : e.message, detalle: e.detalle || null })
  }

  try {
    const { sheets, SHEET_ID } = await getSheets()
    await agregarFilas(sheets, SHEET_ID, [filaWA({ direccion: 'Saliente', telefono: dest, mensaje: String(text), wamid, estado: 'enviado', notas: mail })])
  } catch (e) { console.error('WA send log:', e.message) }

  res.json({ ok: true, wamid })
}
