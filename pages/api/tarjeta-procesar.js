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
- Dandy Saavedra, GangaHome, La Roble (LAROBLE), Mecubrocom, Total Pollo (comida para el equipo → rubro "Comida equipo")
- Seguros (La Segunda, seguros del resumen), ABL
- Viajes/hoteles: hoteles, Hilton, Posada de los Poetas, hospedajes
- Mercado Libre (todo MERPAGO*MERCADOLIBRE)
- Cargos bancarios del propio resumen (intereses, IVA, IIBB, percepciones, comisiones, DB.RG 5617) = EMPRESA

Son PERSONALES (no confundir): Rappi, comida, bares/cafés/restaurantes, supermercados (Carrefour, Coto/Cotodigital, Jumbo, Express Talcahuano, Dia Tienda que NO sea 317), ropa (Zara, 47Street, Las Pepas, Topper, Equus), PasajesCDP, Claro, Netflix, YouTube Premium, la cuota "JUAN MARTIN ARAUZ" (retiro de Juan), Florian, ReinaCasa, Luboloque, Toyotatreos, y las transferencias MERPAGO a nombres de personas.

NO cuentes en los consumos: el saldo anterior, los pagos del período ("SU PAGO EN ..."), ni las cuotas futuras a vencer.

=== TITULARES ===
El resumen separa los consumos por titular ("Consumos Juan Martin Arauz", "Consumos Sofia Maria Grenier", etc.). Clasificá y sumá por CADA titular por separado. Verificá que, para cada titular, empresa_ars + personal_ars = el TOTAL CONSUMOS impreso de ese titular (en pesos).

CRÍTICO — cada consumo pertenece a UN SOLO titular: la sección "Consumos <Nombre>" donde figura. NUNCA repitas el mismo consumo en dos titulares (ni en los subtotales ni en el array "personales"). Ejemplo: si "Florian" aparece en la sección de Sofia, va SOLO en Sofi, jamás en Juan. No inventes consumos en un titular que están en la sección del otro.

=== QUÉ LEER DEL RESUMEN (buscá estas líneas y copiá los números REALES) ===
- "SALDO ACTUAL $" o "TOTAL A PAGAR" en pesos → total_a_pagar_ars.
- "SALDO ACTUAL U$S" en dólares → total_a_pagar_usd (0 si no hay).
- "VENCIMIENTO ACTUAL" → vencimiento (formato DD/MM/YYYY).
- Por cada bloque "Consumos <Nombre>" / "TOTAL CONSUMOS DE <NOMBRE>" → un titular con ese total en pesos (y en USD si hay).
  Nombre: si dice Juan o Arauz → "Juan"; si dice Sofia o Grenier → "Sofi"; si no, el nombre tal cual.

=== SALIDA ===
Devolvé ÚNICAMENTE un objeto JSON (sin texto antes/después, sin comentarios, sin backticks) con los valores REALES del resumen. Campos:
- total_a_pagar_ars (number), total_a_pagar_usd (number), vencimiento (string "DD/MM/YYYY")
- titulares (array), cada uno: nombre (string), total_consumos_ars (number), empresa_ars (number), personal_ars (number), empresa_usd (number), rubros_empresa (objeto monto por rubro), rubros_personal (objeto monto por rubro), y "personales" (array de los consumos PERSONALES de ese titular —los que NO son de empresa—, hasta 40, ordenados de mayor a menor monto, cada uno {comercio, monto, fecha}). Sirve para revisarlos a mano.
Reglas: para cada titular empresa_ars + personal_ars = total_consumos_ars. El software en dólares va en empresa_usd. Omití los rubros que den 0. Números sin separador de miles ni símbolo $, punto decimal.

EJEMPLO DE FORMATO (los números son inventados de muestra — NO los copies, poné los del resumen real):
{"total_a_pagar_ars":1234567.89,"total_a_pagar_usd":123.45,"vencimiento":"10/07/2026","titulares":[{"nombre":"Juan","total_consumos_ars":800000,"empresa_ars":300000,"personal_ars":500000,"empresa_usd":50,"rubros_empresa":{"Combustible":200000,"Movilidad":100000},"rubros_personal":{"Comida y super":500000},"personales":[{"comercio":"Carrefour","monto":300000,"fecha":"12/05"},{"comercio":"Rappi","monto":200000,"fecha":"09/05"}]},{"nombre":"Sofi","total_consumos_ars":600000,"empresa_ars":150000,"personal_ars":450000,"empresa_usd":0,"rubros_empresa":{"Movilidad":150000},"rubros_personal":{"Comida y super":450000},"personales":[{"comercio":"Zara","monto":250000,"fecha":"08/05"},{"comercio":"Coto","monto":200000,"fecha":"15/05"}]}]}`

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

    const tp = Number(parsed?.total_a_pagar_ars) || 0
    const tits = Array.isArray(parsed?.titulares) ? parsed.titulares : []
    if (!tp && !tits.some(t => Number(t?.total_consumos_ars) > 0)) {
      return res.status(422).json({ error: 'La IA leyó el PDF pero no encontró los totales (SALDO ACTUAL / TOTAL CONSUMOS). Reintentá; si sigue, avisá para revisar el formato.', raw: JSON.stringify(parsed).slice(0,400) })
    }

    res.json({ ok: true, data: parsed })
  } catch (e) {
    console.error('Claude API error:', e.message)
    res.status(500).json({ error: e.message })
  }
}
