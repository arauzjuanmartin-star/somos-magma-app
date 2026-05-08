import Anthropic from '@anthropic-ai/sdk'
import { getSheets } from '../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

const SYSTEM_PROMPT = `Sos un asistente experto en contabilidad para una productora audiovisual argentina (SOMOS MAGMA).
Extraés movimientos de resúmenes de tarjeta de crédito argentinas (Mastercard, Visa, Amex) y los devolvés en JSON estructurado.

Para cada movimiento extraé:
- fecha (DD/MM/YYYY)
- descripcion (limpia, sin códigos largos ni cuotas)
- comercio (el nombre del comercio/proveedor inferido)
- moneda (ARS o USD)
- monto (número, positivo para gasto, negativo si es devolución/pago)
- categoria (UNA de estas exactas):
   * Comida y bebida
   * Transporte (taxi, cabify, combustible, peaje, parking)
   * Viajes (hoteles, aerolineas, alojamiento)
   * Suscripciones (Adobe, Spotify, Netflix, software)
   * Producción audiovisual (alquiler equipos, locaciones, props, casting)
   * Profesional/Servicios (contador, abogado, marketing)
   * Equipos/Tecnología (compras de hardware, accesorios)
   * Personal (gastos personales no de la empresa)
   * Pagos/Transferencias (pagos a la tarjeta, refrescos)
   * Otros

NO inventes movimientos. Si una línea es ilegible, salteala.
Si hay refrescos/pagos a la tarjeta (créditos), inclúyelos con monto negativo y categoria "Pagos/Transferencias".
Si hay items en USD, marcá moneda USD con el monto en USD (no convertir).

Devolvé SOLAMENTE un JSON válido (sin texto extra, sin backticks):
{
  "tarjeta": "Master|Santander Visa|Amex|Visa|Otra",
  "titular": "string",
  "periodo": "MM/YYYY",
  "vencimiento": "DD/MM/YYYY",
  "total_ars": número,
  "total_usd": número,
  "movimientos": [
    {"fecha": "DD/MM/YYYY", "descripcion": "...", "comercio": "...", "moneda": "ARS|USD", "monto": number, "categoria": "..."}
  ]
}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en Vercel. Crear key en console.anthropic.com y agregarla a env vars.' })
  }

  const { pdfBase64, fileName } = req.body
  if (!pdfBase64) return res.status(400).json({ error: 'Falta pdfBase64' })

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
          { type: 'text', text: `Extraé todos los movimientos de este resumen de tarjeta. Archivo: ${fileName||'resumen.pdf'}. Devolvé SOLAMENTE el JSON.` },
        ],
      }],
    })

    const txt = resp.content?.[0]?.text || ''
    let parsed
    try {
      const cleaned = txt.replace(/^```json\s*/,'').replace(/```\s*$/,'').trim()
      parsed = JSON.parse(cleaned)
    } catch (e) {
      console.error('Parse error:', e.message, '\nTexto:', txt.slice(0,500))
      return res.status(500).json({ error: 'Claude devolvió texto que no es JSON', raw: txt.slice(0,500) })
    }

    res.json({ ok: true, data: parsed })
  } catch (e) {
    console.error('Claude API error:', e.message)
    res.status(500).json({ error: e.message })
  }
}
