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

=== SALIDA ===
Respondé ÚNICAMENTE con un objeto JSON válido, sin ningún texto antes ni después, sin comentarios (nada de //), sin backticks. Estructura exacta:
{
  "total_a_pagar_ars": 0,
  "total_a_pagar_usd": 0,
  "vencimiento": "DD/MM/YYYY",
  "titulares": [
    {"nombre": "Juan", "total_consumos_ars": 0, "empresa_ars": 0, "personal_ars": 0, "empresa_usd": 0, "rubros_empresa": {"Combustible": 0, "Movilidad": 0, "Software": 0, "Insumos Dia 317": 0, "Viajes": 0, "Seguros": 0, "Mercado Libre": 0, "ABL": 0, "Cargos bancarios": 0, "Otros empresa": 0}, "rubros_personal": {"Comida y super": 0, "Ropa": 0, "Otros personales": 0}}
  ]
}
Reglas de los valores:
- "total_a_pagar_ars"/"total_a_pagar_usd" = el SALDO ACTUAL / TOTAL A PAGAR impreso que debita el banco. Copialo EXACTO del resumen, NO lo calcules.
- "total_consumos_ars" = el TOTAL CONSUMOS impreso de ese titular. Para cada titular: empresa_ars + personal_ars = total_consumos_ars.
- Los consumos en dólares (software) van en empresa_usd, no en empresa_ars.
- Omití del JSON los rubros que den 0. Números sin separador de miles ni símbolo $, con punto como decimal.`

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
      max_tokens: 8000,
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
      let s = txt.trim().replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim()
      const i = s.indexOf('{'), j = s.lastIndexOf('}')
      if (i >= 0 && j > i) s = s.slice(i, j + 1)  // extrae el objeto JSON aunque venga con texto alrededor
      s = s.replace(/\/\/[^\n"]*/g, '')            // saca comentarios // si los hubiera
      parsed = JSON.parse(s)
    } catch (e) {
      console.error('Parse error:', e.message, '\nTexto:', txt.slice(0,800))
      return res.status(500).json({ error: 'Claude devolvió texto que no es JSON', raw: txt.slice(0,800) })
    }

    res.json({ ok: true, data: parsed })
  } catch (e) {
    console.error('Claude API error:', e.message)
    res.status(500).json({ error: e.message })
  }
}
