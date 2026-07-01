import Anthropic from '@anthropic-ai/sdk'
import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

const SYSTEM_PROMPT = `Sos un asistente experto en contabilidad para una productora audiovisual argentina (SOMOS MAGMA).
Extraés movimientos de resúmenes de tarjeta de crédito argentinas (Mastercard, Visa, Amex) y los devolvés en JSON.

REGLAS CRÍTICAS para el campo "comercio":
- Para COMPRAS: el "comercio" es el NOMBRE REAL del proveedor (Google Workspace, Uber, Mercado Libre, McDonald's, Spotify, etc.)
- Limpiá codigos: "MERCADO PAGO*UBER" → "Uber", "GOOGLE*WORKSPACE SO A75217USD" → "Google Workspace", "AMZN*1234ABC" → "Amazon"
- NUNCA uses el nombre del banco emisor (Santander, BBVA, Galicia, Visa, Mastercard, Amex) como comercio
- Para CARGOS DEL BANCO (intereses, IVA, IIBB, percepciones): el "comercio" es el CONCEPTO ESPECÍFICO en lenguaje natural argentino. Ejemplos:
   * "INTERESES FINANCIACION" → comercio: "Intereses financiación"
   * "DB IVA $ 21%" → comercio: "IVA sobre intereses 21%"
   * "IIBB PERCEP-CABA 2%" → comercio: "Percepción IIBB CABA 2%"
   * "IVA RG 4240 21%" → comercio: "Percepción IVA RG 4240"
   * "DB.RG 5617 30%" → comercio: "Percepción Ganancias RG 5617 30%"
   * "CR.RG 5617 30%" → comercio: "Crédito Ganancias RG 5617 30%" (devolución, monto negativo)
   * "SU PAGO EN USD" → comercio: "Pago en USD"
   * "SEGURO COMPRA PROTEGIDA" → comercio: "Seguro compra protegida"

Para el campo "descripcion": detalles secundarios o vacío si comercio ya es claro.

Para cada movimiento extraé:
- fecha (DD/MM/YYYY)
- descripcion (concepto limpio: "Suscripción mensual", "Combustible YPF", "Intereses financiación", etc.)
- comercio (NOMBRE REAL del comercio o "Banco emisor" si es cargo del banco)
- moneda (ARS o USD)
- monto (número, positivo para gasto/cargo, negativo si es devolución/pago)
- categoria (UNA de estas exactas):
   * Comida y bebida (restaurantes, supermercado, delivery)
   * Transporte (taxi, cabify, uber, combustible, peaje, parking, SUBE)
   * Viajes (hoteles, aerolineas, airbnb, alojamiento)
   * Suscripciones (Google Workspace, Adobe, Spotify, Netflix, ChatGPT, software)
   * Producción audiovisual (alquiler equipos, locaciones, props, casting, vestuario)
   * Profesional/Servicios (contador, abogado, marketing, consultorías)
   * Equipos/Tecnología (Apple, MercadoLibre tech, hardware, accesorios)
   * Personal (gastos personales no laborales: vestimenta, salud, ocio)
   * Pagos/Transferencias (pagos del usuario AL banco, refrescos, créditos por pagos)
   * Cargos bancarios (intereses financiación, IVA sobre intereses, IIBB percepción, IVA RG 4240, DB.RG 5617 ganancias, comisiones del banco, seguros del resumen)
   * Otros

ATENCIÓN ESPECIAL en Amex (Santander Río) los cargos terminan con códigos como "CR.RG 5617" o "DB.RG 5617" — son percepciones de Ganancias del 30%, categoría "Cargos bancarios".

NO inventes movimientos. Saltea líneas de texto legal/avisos/condiciones.

Devolvé SOLAMENTE un JSON válido (sin texto extra, sin backticks):
{
  "tarjeta": "Master|Santander Visa|Amex|Visa|Otra",
  "titular": "string",
  "periodo": "MM/YYYY",
  "vencimiento": "DD/MM/YYYY",
  "total_a_pagar_ars": número,
  "total_a_pagar_usd": número,
  "total_consumos_ars": número,
  "total_ars": número,
  "total_usd": número,
  "movimientos": [
    {"fecha": "DD/MM/YYYY", "descripcion": "...", "comercio": "...", "moneda": "ARS|USD", "monto": number, "categoria": "..."}
  ]
}

CRÍTICO sobre los totales (NO los calcules sumando movimientos, LEÉ el número impreso):
- "total_a_pagar_ars" = el "SALDO ACTUAL" / "TOTAL A PAGAR" / "PAGO TOTAL" en pesos que el banco DEBITA. Copialo EXACTO del resumen.
- "total_a_pagar_usd" = el "SALDO ACTUAL" en USD (0 si no hay).
- "total_consumos_ars" = la suma de "consumos del mes" impresa (en BBVA es TOTAL CONSUMOS de cada titular sumados; en otras el subtotal de consumos del período). Si no figura clara, poné 0.
- NO incluyas en los totales: saldo anterior, pagos del período, ni cuotas futuras a vencer.
- Extraé TODOS los movimientos del período (no cortes la lista aunque sean muchos).`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en Vercel. Crear key en console.anthropic.com y agregarla a env vars.' })
  }

  const { pdfBase64, fileName } = req.body
  if (!pdfBase64) return res.status(400).json({ error: 'Falta pdfBase64' })

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 16000,
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
