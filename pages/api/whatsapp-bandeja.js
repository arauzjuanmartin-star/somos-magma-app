import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { leerWA, pensarRespuesta } from '../../lib/whatsapp'

// Las conversaciones de WhatsApp para la pantalla /whatsapp: una por número, la más reciente arriba, con los
// mensajes en orden. "pendiente" = el último mensaje es del cliente (nadie le contestó todavía, ni el bot).
// "abierta" = el cliente escribió en las últimas 24 h (WhatsApp deja contestarle texto libre).
// POST {prueba:[{direccion, mensaje}]} = "Probar el bot": devuelve lo que contestaría, sin mandar ni guardar nada.
export const config = { maxDuration: 60 }
export default async function handler(req, res) {
  const auth = await requireAuth(req, res)
  if (!auth) return
  if (req.method === 'POST') {
    const prueba = (req.body?.prueba || []).slice(-30).map(m => ({ direccion: m.direccion === 'Saliente' ? 'Saliente' : 'Entrante', mensaje: String(m.mensaje || ''), tipo: 'text' }))
    if (!prueba.length) return res.status(400).json({ error: 'Falta el mensaje de prueba' })
    try { return res.json({ r: await pensarRespuesta(prueba) }) } catch (e) { return res.status(500).json({ error: e.message }) }
  }
  try {
    const { sheets, SHEET_ID } = await getSheets()
    const todo = await leerWA(sheets, SHEET_ID)
    const porTel = new Map()
    for (const m of todo) {
      if (!porTel.has(m.telefono)) porTel.set(m.telefono, [])
      porTel.get(m.telefono).push(m)
    }
    const ahora = Date.now()
    const conversaciones = [...porTel.entries()].map(([telefono, msgs]) => {
      const ultimo = msgs[msgs.length - 1]
      const ultimaEntrante = [...msgs].reverse().find(m => m.direccion === 'Entrante')
      return {
        telefono,
        nombre: msgs.find(m => m.nombre)?.nombre || '',
        ultimoTs: ultimo.ts,
        pendiente: ultimo.direccion === 'Entrante',
        abierta: !!ultimaEntrante && ahora - Date.parse(ultimaEntrante.ts) < 24 * 3600e3,
        estado: [...msgs].reverse().find(m => /^bot-/.test(m.estado))?.estado || '',
        mensajes: msgs.slice(-60).map(m => ({ ts: m.ts, fecha: m.fecha, hora: m.hora, direccion: m.direccion, mensaje: m.mensaje, quien: m.direccion === 'Saliente' ? (m.notas === 'bot' ? 'bot' : m.notas.split('@')[0]) : '' })),
      }
    }).sort((a, b) => b.ultimoTs.localeCompare(a.ultimoTs))
    res.json({ conversaciones, bot: String(process.env.WHATSAPP_BOT || '').toLowerCase() !== 'off', conectado: !!(process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_TOKEN) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
