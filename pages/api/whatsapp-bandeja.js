import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { leerWA, pensarRespuesta } from '../../lib/whatsapp'

// Las conversaciones de WhatsApp para la pantalla /whatsapp: una por número, la más reciente arriba, con los
// mensajes en orden. "pendiente" = el último mensaje es del cliente (nadie le contestó todavía, ni el bot).
// "abierta" = el cliente escribió en las últimas 24 h (WhatsApp deja contestarle texto libre).
// POST {prueba:[{direccion, mensaje}]} = "Probar el bot": devuelve lo que contestaría, sin mandar ni guardar nada.
// Alta del número (solo Juan): GET ?alta=1 = cómo ve Meta el número con la llave de "App Magma" (de ahí sale el
// WHATSAPP_PHONE_ID); POST {alta:'activar', phoneId, pin} = lo registra en la API con el PIN de 6 dígitos que se puso
// al verificarlo y suscribe la app a la cuenta para que los mensajes lleguen al webhook. El PIN no se guarda.
export const config = { maxDuration: 60 }
const GRAPH = 'https://graph.facebook.com/v20.0'
const WABA = process.env.WHATSAPP_WABA_ID || '1554602449767509'
async function meta(path, opts = {}) {
  const r = await fetch(`${GRAPH}/${path}`, { ...opts, headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.error) throw new Error(j.error?.error_user_msg || j.error?.message || `Meta respondió ${r.status}`)
  return j
}
async function alta(req, res) {
  if (!process.env.WHATSAPP_TOKEN) return res.status(400).json({ error: 'Falta WHATSAPP_TOKEN en Vercel' })
  try {
    if (req.method === 'POST') {
      const phoneId = String(req.body?.phoneId || '').replace(/\D/g, ''), pin = String(req.body?.pin || '').replace(/\D/g, '')
      if (!phoneId || pin.length !== 6) return res.status(400).json({ error: 'Falta el número o el PIN de 6 dígitos' })
      await meta(`${phoneId}/register`, { method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', pin }) })
      await meta(`${WABA}/subscribed_apps`, { method: 'POST' })
    }
    const numeros = await meta(`${WABA}/phone_numbers?fields=id,display_phone_number,verified_name,status,code_verification_status,name_status,platform_type,quality_rating`)
    const apps = await meta(`${WABA}/subscribed_apps`)
    res.json({ waba: WABA, numeros: numeros.data || [], apps: (apps.data || []).map(a => a.whatsapp_business_api_data?.name || a.name || a.id), phoneIdCargado: process.env.WHATSAPP_PHONE_ID || '' })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
export default async function handler(req, res) {
  const auth = await requireAuth(req, res)
  if (!auth) return
  if (req.query.alta || req.body?.alta) {
    if (!['juan@somosmagma.com', 'arauzjuanmartin@gmail.com'].includes(auth.mail)) return res.status(403).json({ error: 'Solo Juan' })
    return alta(req, res)
  }
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
