import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '../../lib/auth-helpers'

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

const SYSTEM_PROMPT = `Sos el asistente contable de SOMOS MAGMA (productora audiovisual argentina). Te paso un resumen de tarjeta de crédito y tenés que devolver el TOTAL A PAGAR y la LISTA COMPLETA de consumos del período, uno por uno, separados por titular, con una clasificación TENTATIVA Empresa (Magma) vs Personal. El humano después corrige a mano, así que NO agregues ni resumas: listá CADA movimiento.

=== 1) TOTAL A PAGAR (lo más importante — no lo dejes en 0) ===
El total del resumen puede NO estar en la primera hoja. Buscalo en este orden y usá el primero que tenga un número real:
1. El recuadro final "SALDO ACTUAL $" (ojo: en muchos resúmenes ese recuadro está VACÍO en todas las hojas menos la última — usá el que tenga el número, que suele estar en la ÚLTIMA hoja / cuadro resumen).
2. La línea "DEBITAREMOS DE SU C.C. ... LA SUMA DE $ X + U$S Y" (X = total_a_pagar_ars, Y = total_a_pagar_usd).
3. "TOTAL A PAGAR".
NUNCA uses como total: "SALDO ANTERIOR", "Su saldo financiado", "PAGO MINIMO", ni "SALDO ACTUAL" de una hoja donde el número esté vacío. Si dudás, el total a pagar es el más grande entre SALDO ACTUAL final y DEBITAREMOS.
- total_a_pagar_usd: los U$S de ese mismo recuadro/línea (0 si no hay).
- vencimiento: la fecha de "VENCIMIENTO ACTUAL" / "VENCIMIENTO" (formato DD/MM/YYYY).

=== 2) MOVIMIENTOS (listá TODOS, uno por uno) ===
El resumen separa consumos por titular ("Total Consumos de JUAN MARTIN ARAUZ", "Total Consumos de SOFIA MARIA GRENIER", etc.). Por CADA titular, listá TODOS sus consumos del período, uno por movimiento, con: fecha (DD/MM), comercio (el texto tal cual del resumen), monto (número), moneda ("ARS" o "USD"), categoria ("Empresa" o "Personal") y rubro.
CRÍTICO: cada consumo pertenece a UN SOLO titular (la sección donde figura). No repitas, no inventes, no muevas consumos de un titular a otro.
NO incluyas: "SALDO ANTERIOR", los pagos del período ("SU PAGO EN PESOS/USD", "CR.RG..."), las cuotas FUTURAS a vencer, ni las "BONIF. CONSUMO" (ya vienen netas). SÍ incluí las cuotas que impactan este período (las que tienen monto en la columna del período).

=== 3) CLASIFICACIÓN TENTATIVA (Empresa vs Personal) ===
Esta tarjeta es de uso MIXTO (personal + Magma) y muchos meses la mayoría es PERSONAL. Por eso NO asumas "todo es empresa". Regla:
- Marcá "Empresa" SOLO si el consumo es claramente de producción/operación de Magma: nafta/combustible (YPF, Shell, Axion, AppYPF, ACA), software y suscripciones de trabajo (Adobe, Canva, OpenAI/ChatGPT, Google, Apple/iCloud, Squarespace/SQSP, Notion, Artlist, Motionarray, WeTransfer), seguros de Magma, rental de equipos, catering/comida de rodaje, y transferencias a freelancers/proveedores CONOCIDOS.
- Marcá "Personal" TODO lo demás: restaurantes, cafés, comida, Rappi/PedidosYa, supermercados, compras, entretenimiento/entradas (DF Entertainment, festivales), cuotas de compras personales (Ailes, Chipote, pasajes personales), estacionamiento suelto, y en especial las transferencias MercadoPago a nombres de PERSONAS (MERPAGO*NOMBRE) — NO asumas que son pagos a proveedores, por defecto son transferencias personales. Marcalas Empresa solo si el nombre es un freelancer/proveedor conocido de Magma.
Ante la duda, poné "Personal" (el humano lo pasa a Empresa con un toque si corresponde).

=== 4) CARGOS BANCARIOS ===
Los cargos del resumen (INTERESES FINANCIACION, IVA, IIBB PERCEP, IVA RG 4240, percepciones, DB.RG 5617, comisiones) van en un titular aparte con nombre "Cargos", como movimientos con categoria "Empresa" y rubro "Costos bancarios". Podés listarlos juntos en un solo movimiento ("Intereses + IVA + IIBB + percepciones") sumando su total, o separados.

=== TAXONOMÍA DE RUBROS (usá una de estas claves en el campo "rubro" cuando categoria sea Empresa) ===
"Producción · Nafta", "Producción · Movilidad", "Producción · Viajes", "Producción · Rental de equipos", "Producción · Comida de rodaje/equipo", "Producción · Freelancers/proveedores", "Software · Edición/diseño", "Software · IA", "Software · Stock/música", "Software · Web/productividad", "Seguros", "Compras · Mercado Libre", "Compras · Insumos/equipos", "Compras · Súper/almacén", "Costos bancarios". Si es Personal, poné rubro "Personal".

=== SALIDA ===
Devolvé ÚNICAMENTE un objeto JSON (sin texto antes/después, sin comentarios, sin backticks) con los valores REALES del resumen:
- total_a_pagar_ars (number), total_a_pagar_usd (number), vencimiento (string "DD/MM/YYYY")
- titulares (array), cada uno: nombre (string: "Juan" si dice Juan/Arauz, "Sofi" si dice Sofia/Grenier, "Cargos" para los bancarios, si no el nombre tal cual), total_consumos_ars (number, suma de sus movimientos en pesos), total_consumos_usd (number), y movimientos (array de TODOS sus consumos, cada uno {fecha, comercio, monto, moneda, categoria, rubro}).
Reglas de números: sin separador de miles ni símbolo $, punto decimal. La suma de los movimientos ARS de cada titular debe dar su total_consumos_ars.

EJEMPLO DE FORMATO (números inventados de muestra — NO los copies, poné los del resumen real):
{"total_a_pagar_ars":1234567.89,"total_a_pagar_usd":123.45,"vencimiento":"13/07/2026","titulares":[{"nombre":"Juan","total_consumos_ars":500000,"total_consumos_usd":49,"movimientos":[{"fecha":"07/06","comercio":"DF ENTERTAINMENT","monto":112500,"moneda":"ARS","categoria":"Personal","rubro":"Personal"},{"fecha":"20/06","comercio":"MERCPAGO*APPYPFCOMB","monto":144732,"moneda":"ARS","categoria":"Empresa","rubro":"Producción · Nafta"},{"fecha":"05/06","comercio":"P.SKOOL.COM","monto":49,"moneda":"USD","categoria":"Personal","rubro":"Personal"}]},{"nombre":"Cargos","total_consumos_ars":709174,"total_consumos_usd":0,"movimientos":[{"fecha":"02/07","comercio":"Intereses + IVA + IIBB + percepciones","monto":709174,"moneda":"ARS","categoria":"Empresa","rubro":"Costos bancarios"}]}]}`

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
