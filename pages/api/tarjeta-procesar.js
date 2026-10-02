import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '../../lib/auth-helpers'
import { getSheets } from '../../lib/sheets'

// Leer un resumen largo (más de 100 consumos) le lleva a la IA cerca de un minuto: sin esto Vercel corta a los 10 segundos.
export const config = { api: { bodyParser: { sizeLimit: '15mb' } }, maxDuration: 60 }

// Cómo se reparte cada tarjeta entre Magma y lo personal de los socios. Son reglas que dio Juan (03/08 y 01/10/2026);
// si cambia el uso de una tarjeta, se cambia acá. La persona igual puede corregir consumo por consumo antes de guardar.
const REGLAS = {
  'BBVA Visa': `Esta tarjeta es de la EMPRESA (titular SOMOS MAGMA SRL, con plásticos de Juan y de Sofi): TODO consumo es "Empresa", sea del titular que sea. Únicas excepciones, que son "Personal": cualquier consumo que diga VENANCI (MERPAGO*ASOCIACIONVENANCI), y las cuotas de estas compras: CHIPOTE, MERCADOLIBRE, EQUUS, MUNDO DEL JUGUETE (personales de Juan) y FLORIAN, LUBOLOQUE, 47 STREET, MISHKA (personales de Sofi).`,
  'Santander Visa': `Tarjeta a nombre de Sofía con adicional de Juan, de uso mixto. Los consumos del plástico de SOFIA (terminado en 7665) son TODOS "Empresa", salvo AILES, que es "Personal" (de Juan). Los consumos del plástico de JUAN (terminado en 2355) son TODOS "Personal", salvo AMAZON PRIME, que es "Empresa".`,
}
const REGLA_GENERICA = `Esta tarjeta es de uso MIXTO (personal + Magma) y muchos meses la mayoría es PERSONAL. Por eso NO asumas "todo es empresa". Regla:
- Marcá "Empresa" SOLO si el consumo es claramente de producción/operación de Magma: nafta/combustible (YPF, Shell, Axion, AppYPF, ACA), software y suscripciones de trabajo (Adobe, Canva, OpenAI/ChatGPT, Google, Apple/iCloud, Squarespace/SQSP, Notion, Artlist, Motionarray, WeTransfer), seguros de Magma, rental de equipos, catering/comida de rodaje, y transferencias a freelancers/proveedores CONOCIDOS.
- Marcá "Personal" TODO lo demás: restaurantes, cafés, comida, Rappi/PedidosYa, supermercados, compras, entretenimiento/entradas (DF Entertainment, festivales), cuotas de compras personales (Ailes, Chipote, pasajes personales), estacionamiento suelto, y en especial las transferencias MercadoPago a nombres de PERSONAS (MERPAGO*NOMBRE) — NO asumas que son pagos a proveedores, por defecto son transferencias personales. Marcalas Empresa solo si el nombre es un freelancer/proveedor conocido de Magma.
Ante la duda, poné "Personal" (el humano lo pasa a Empresa con un toque si corresponde).`
const reglaDe = tarjeta => `=== 3) CLASIFICACIÓN (Empresa vs Personal) ===
${REGLAS[tarjeta] || REGLA_GENERICA}
Si el PDF viene PINTADO con resaltador, eso manda sobre cualquier otra regla: amarillo = personal de Sofi, naranja = personal de Juan, sin pintar = Empresa.
En cualquier tarjeta: un débito o cuota a nombre de "JUAN MARTIN ARAUZ" es su retiro personal → Personal.`

const armarPrompt = (tarjeta, rubrosTxt) => `Sos el asistente contable de SOMOS MAGMA (productora audiovisual argentina). Te paso un resumen de tarjeta de crédito y tenés que devolver el TOTAL A PAGAR y la LISTA COMPLETA de consumos del período, uno por uno, separados por titular, con una clasificación TENTATIVA Empresa (Magma) vs Personal. El humano después corrige a mano, así que NO agregues ni resumas: listá CADA movimiento.

=== 1) TOTAL A PAGAR (lo más importante — no lo dejes en 0) ===
El total del resumen puede NO estar en la primera hoja. Buscalo en este orden y usá el primero que tenga un número real:
1. El recuadro final "SALDO ACTUAL $" (ojo: en muchos resúmenes ese recuadro está VACÍO en todas las hojas menos la última — usá el que tenga el número, que suele estar en la ÚLTIMA hoja / cuadro resumen).
2. La línea "DEBITAREMOS DE SU C.C. ... LA SUMA DE $ X + U$S Y" (X = total_a_pagar_ars, Y = total_a_pagar_usd).
3. "TOTAL A PAGAR".
NUNCA uses como total: "SALDO ANTERIOR", "Su saldo financiado", "PAGO MINIMO", ni "SALDO ACTUAL" de una hoja donde el número esté vacío. Si dudás, el total a pagar es el más grande entre SALDO ACTUAL final y DEBITAREMOS.
- total_a_pagar_usd: los U$S de ese mismo recuadro/línea (0 si no hay).
- vencimiento: la fecha de "VENCIMIENTO ACTUAL" / "VENCIMIENTO" (formato DD/MM/YYYY).

=== 2) MOVIMIENTOS (listá TODOS, uno por uno) ===
El resumen separa consumos por titular ("Total Consumos de JUAN MARTIN ARAUZ", "Total Consumos de SOFIA MARIA GRENIER", etc.). Por CADA titular, listá TODOS sus consumos del período, uno por movimiento, con: fecha (DD/MM), comercio (el texto tal cual del resumen), monto (número), moneda ("ARS" o "USD"), categoria ("Empresa" o "Personal"), rubro y cuota.
CUOTAS: si el movimiento es una cuota (el texto dice "C.NN/MM", "NN/MM" o "cuota NN/MM"), poné el campo cuota con "NN/MM" (ej: "C.03/09" → cuota "3/9"). Si NO es cuota, cuota "".
CRÍTICO: cada consumo pertenece a UN SOLO titular (la sección donde figura). No repitas, no inventes, no muevas consumos de un titular a otro.
NO incluyas: "SALDO ANTERIOR", los pagos del período ("SU PAGO EN PESOS/USD", "CR.RG..."), las cuotas FUTURAS a vencer, ni las "BONIF. CONSUMO" (ya vienen netas). SÍ incluí las cuotas que impactan este período (las que tienen monto en la columna del período).

${reglaDe(tarjeta)}

=== 4) CARGOS DEL BANCO ===
Los cargos del resumen van en un titular aparte con nombre "Cargos", como movimientos con categoria "Empresa", SEPARADOS (uno por cargo), con estos rubros:
- INTERESES de financiación o punitorios → "Costos bancarios / financieros · Intereses tarjetas".
- IVA, comisiones, impuesto de sellos, percepciones de Ingresos Brutos (IIBB PERCEP), IVA RG 4240 → "Costos bancarios / financieros · Comisiones e impuestos bancarios".
- DB.RG 5617 (la percepción del 30% sobre consumos en dólares) → "Percepciones a recuperar".

=== RUBROS (la lista única de Magma: usá EXACTAMENTE una de estas claves en el campo "rubro" cuando categoria sea Empresa) ===
${rubrosTxt}
"Percepciones a recuperar" (solo para la RG 5617).
Si es Personal, poné rubro "Personal". Si un consumo de Empresa no calza en ninguno, usá "Compras varias · Insumos / equipos chicos".

=== SALIDA ===
Devolvé ÚNICAMENTE un objeto JSON (sin texto antes/después, sin comentarios, sin backticks), compacto (sin saltos de línea ni espacios de más), con los valores REALES del resumen:
- total_a_pagar_ars (number), total_a_pagar_usd (number), vencimiento (string "DD/MM/YYYY")
- titulares (array), cada uno: nombre (string: "Juan" si dice Juan/Arauz, "Sofi" si dice Sofia/Grenier, "Cargos" para los bancarios, si no el nombre tal cual), total_consumos_ars (number, suma de sus movimientos en pesos), total_consumos_usd (number), y movimientos: un array con TODOS sus consumos, cada uno como un ARRAY de 7 valores en este orden exacto: [fecha "DD/MM", comercio, monto (number), moneda ("ARS" o "USD"), "E" si es Empresa o "P" si es Personal, rubro (la clave exacta de la lista si es Empresa; "" si es Personal), cuota ("NN/MM", o "" si no es cuota)].
Reglas de números: sin separador de miles ni símbolo $, punto decimal. La suma de los movimientos ARS de cada titular debe dar su total_consumos_ars.

EJEMPLO DE FORMATO (números inventados de muestra — NO los copies, poné los del resumen real):
{"total_a_pagar_ars":1234567.89,"total_a_pagar_usd":123.45,"vencimiento":"13/07/2026","titulares":[{"nombre":"Juan","total_consumos_ars":302232,"total_consumos_usd":49,"movimientos":[["07/06","DF ENTERTAINMENT",112500,"ARS","P","",""],["16/04","MERPAGO*ROUGE C.03/09",45000,"ARS","P","","3/9"],["20/06","MERCPAGO*APPYPFCOMB",144732,"ARS","E","Producción · Nafta / combustible",""],["05/06","P.SKOOL.COM",49,"USD","P","",""]]},{"nombre":"Cargos","total_consumos_ars":709174,"total_consumos_usd":0,"movimientos":[["02/07","INTERESES FINANCIACION",509174,"ARS","E","Costos bancarios / financieros · Intereses tarjetas",""],["02/07","IVA",200000,"ARS","E","Costos bancarios / financieros · Comisiones e impuestos bancarios",""]]}]}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en Vercel. Crear key en console.anthropic.com y agregarla a env vars.' })
  }

  const { pdfBase64, fileName, tarjeta } = req.body
  if (!pdfBase64) return res.status(400).json({ error: 'Falta pdfBase64' })

  try {
    // Los rubros salen de la solapa RUBROS (la lista única de Magma, la misma que usa "¿Pagaste algo?"), con lo que incluye cada uno.
    let rubrosTxt = ''
    try {
      const { sheets, SHEET_ID } = await getSheets()
      const rv = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'RUBROS!A:C' })).data.values || []
      const ih = rv.findIndex(r => String(r[0] || '').trim().toUpperCase() === 'RUBRO')
      rubrosTxt = rv.slice(ih + 1).filter(r => String(r[0] || '').trim() && !/^personal/i.test(String(r[0]))).map(r => { const sub = String(r[1] || '').trim(); return `"${String(r[0]).trim()}${sub && !/^[—-]$/.test(sub) ? ` · ${sub}` : ''}"${String(r[2] || '').trim() ? ` (${String(r[2]).trim()})` : ''}` }).join('\n')
    } catch (e) { console.error('rubros para el lector de tarjetas:', e.message) }
    if (!rubrosTxt) return res.status(500).json({ error: 'No pude leer la solapa RUBROS: sin la lista de rubros no clasifico el resumen.' })
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    // El modelo más nuevo primero; si la cuenta todavía no lo tiene, el de antes.
    const pedir = model => client.messages.create({
      model,
      max_tokens: 20000,
      system: armarPrompt(String(tarjeta || '').trim(), rubrosTxt),
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
          { type: 'text', text: `Clasificá y sumá los consumos del mes de este resumen por titular (Empresa vs Personal). Archivo: ${fileName||'resumen.pdf'}. Devolvé SOLAMENTE el JSON.` },
        ],
      }],
    })
    let resp
    // Solo si el modelo no existe para esta cuenta (404). Un error de cuota o de PDF se devuelve tal cual: reintentar duplicaría la espera.
    try { resp = await pedir('claude-sonnet-5-5') } catch (e) { if (e?.status === 404) resp = await pedir('claude-sonnet-4-5'); else throw e }
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

    // Cada consumo viene como un array corto (así la respuesta pesa la mitad y entra en el tiempo de Vercel): se pasa a objeto, que es lo que usa la pantalla.
    for (const t of (Array.isArray(parsed?.titulares) ? parsed.titulares : [])) {
      t.movimientos = (Array.isArray(t.movimientos) ? t.movimientos : []).map(m => Array.isArray(m)
        ? { fecha: String(m[0] ?? ''), comercio: String(m[1] ?? ''), monto: Number(m[2]) || 0, moneda: String(m[3] || 'ARS').toUpperCase(), categoria: /^e/i.test(String(m[4] ?? '')) ? 'Empresa' : 'Personal', rubro: String(m[5] ?? ''), cuota: String(m[6] ?? '') }
        : m)
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
