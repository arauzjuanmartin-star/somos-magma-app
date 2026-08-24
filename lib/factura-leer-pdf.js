/**
 * Leer el N° de factura del CONTENIDO del PDF, con Claude.
 *
 * Es el plan B: el 85% de los PDFs baja de AFIP con el número en el nombre del
 * archivo (ver lib/factura-numero.js, gratis e instantáneo). Esto es para los que
 * alguien renombró a mano — "Latam Ostara.pdf", "AFKL 6MAY.pdf".
 *
 * Solo backend: importa el SDK y usa la API key.
 */
import Anthropic from '@anthropic-ai/sdk'
import { partesDeNro } from './factura-numero.js'

const RX_SALIDA = /^\d{4}-\d{8}$/

export async function nroDesdeElPdf(pdfBuffer, mimeType = 'application/pdf') {
  if (!process.env.ANTHROPIC_API_KEY) return { nro: null, motivo: 'sin ANTHROPIC_API_KEY' }
  if (mimeType !== 'application/pdf') return { nro: null, motivo: 'no es un PDF' }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  try {
    const resp = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 200,
      system: 'Extraés datos de facturas electrónicas argentinas (AFIP). Respondés únicamente con el dato pedido, sin explicar nada.',
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBuffer.toString('base64') } },
          { type: 'text', text: [
            'Dame el número de comprobante de esta factura, en el formato PPPP-NNNNNNNN',
            '(4 dígitos de punto de venta, guion, 8 dígitos de número).',
            'En el PDF suele figurar como "Punto de Venta: 00001   Comp. Nro: 00000138" → 0001-00000138.',
            'Si no lo encontrás o el documento no es una factura, respondé exactamente: NO_ENCONTRADO',
            'No agregues ni una palabra más.',
          ].join('\n') },
        ],
      }],
    })
    const txt = (resp.content.find(b => b.type === 'text')?.text || '').trim()
    // Validamos contra el formato real: si el modelo devuelve cualquier otra cosa,
    // no la usamos. Un número inventado en una factura es peor que no tener número.
    if (!RX_SALIDA.test(txt) || !partesDeNro(txt)) return { nro: null, motivo: txt.slice(0, 40) || 'sin respuesta' }
    return { nro: txt, motivo: 'leído del PDF' }
  } catch (e) {
    console.warn('nroDesdeElPdf falló:', e.message)
    return { nro: null, motivo: e.message?.slice(0, 60) || 'error' }
  }
}
