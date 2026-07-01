import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '../../lib/auth-helpers'

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

const SYSTEM_PROMPT = `Sos el asistente contable de SOMOS MAGMA (productora audiovisual argentina). Te paso un resumen de tarjeta de crédito y tenés que devolver los CONSUMOS DEL MES clasificados en EMPRESA vs PERSONAL, separados por titular. NO tenés que listar cada movimiento: tenés que SUMAR y devolver los subtotales.

=== REGLA DE CLASIFICACIÓN ===
Todo consumo es PERSONAL del titular que lo hizo, SALVO estos rubros que son de la EMPRESA:
- Combustible/nafta: YPF, Shell, Axion, Puma, AppYPF, ACA, cualquier "COMB"/"COMBUST"
- Movilidad de trabajo: Cabify, Didi, Uber, Subte (EMOVA), peajes/autopistas (ej. SantoniAutopista), estacionamiento/valet parking
- Software de producción: Adobe, Canva, OpenAI, Anthropic, Claude, Artlist, Notion, Google (Workspace y One), Higgsfield, Motionarray, Sirv, WeTransfer
- Dia Tienda 317 (SOLO la 317; las otras Dia Tienda 480/522/581/1100 = personal)
- Dandy Saavedra, GangaHome, La Roble (LAROBLE), Mecubrocom
- Seguros (La Segunda, seguros del resumen), ABL
- Viajes/hoteles: hoteles, Hilton, Posada de los Poetas, hospedajes
- Mercado Libre (todo MERPAGO*MERCADOLIBRE)
- Cargos bancarios del propio resumen (intereses, IVA, IIBB, percepciones, comisiones, DB.RG 5617) = EMPRESA

Son PERSONALES (no confundir): Rappi, comida, bares/cafés/restaurantes, supermercados (Carrefour, Coto/Cotodigital, Jumbo, Express Talcahuano, Dia Tienda que NO sea 317), ropa (Zara, 47Street, Las Pepas, Topper, Equus), PasajesCDP, Claro, Netflix, YouTube Premium, la cuota "JUAN MARTIN ARAUZ" (retiro de Juan), Florian, ReinaCasa, Luboloque, Toyotatreos, y las transferencias MERPAGO a nombres de personas.

NO cuentes en los consumos: el saldo anterior, los pagos del período ("SU PAGO EN ..."), ni las cuotas futuras a vencer.

=== TITULARES ===
El resumen separa los consumos por titular ("Consumos Juan Martin Arauz", "Consumos Sofia Maria Grenier", etc.). Clasificá y sumá por CADA titular por separado. Verificá que, para cada titular, empresa_ars + personal_ars = el TOTAL CONSUMOS impreso de ese titular (en pesos).

=== SALIDA (SOLO este JSON, sin backticks ni texto extra) ===
{
  "total_a_pagar_ars": número,   // el SALDO ACTUAL / TOTAL A PAGAR en pesos que debita el banco — copialo EXACTO del resumen, NO lo calcules
  "total_a_pagar_usd": número,   // saldo actual en USD (0 si no hay)
  "vencimiento": "DD/MM/YYYY",
  "titulares": [
    {
      "nombre": "Juan|Sofi|<nombre>",
      "total_consumos_ars": número,   // el TOTAL CONSUMOS impreso de ese titular
      "empresa_ars": número,
      "personal_ars": número,
      "empresa_usd": número,
      "rubros_empresa": {"Combustible": n, "Movilidad": n, "Software": n, "Insumos Dia 317": n, "Viajes": n, "Seguros": n, "Mercado Libre": n, "ABL": n, "Cargos bancarios": n, "Otros empresa": n},
      "rubros_personal": {"Comida y super": n, "Ropa": n, "Otros personales": n}
    }
  ]
}
Omití los rubros que den 0. Para cada titular, empresa_ars + personal_ars DEBE ser igual a total_consumos_ars (tolerancia mínima por redondeo). Los montos en USD del software van en empresa_usd, no en empresa_ars.`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en Vercel. Crear key en console.anthropic.com y agregarla a env vars.' })
  }

  const { pdfBase64, fileName } = req.body
  if (!pdfBase64) return res.status(400).json({ error: 'Falta pdfBase64' })

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
          { type: 'text', text: `Clasificá y sumá los consumos del mes de este resumen por titular (Empresa vs Personal). Archivo: ${fileName||'resumen.pdf'}. Devolvé SOLAMENTE el JSON.` },
        ],
      }],
    })

    const txt = resp.content?.[0]?.text || ''
    let parsed
    try {
      parsed = JSON.parse(txt.replace(/^```json\s*/,'').replace(/```\s*$/,'').trim())
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
