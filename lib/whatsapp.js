// ============================ WHATSAPP (Cloud API de Meta) ============================
// Juan, 24/10/2026: "si lo vamos a estar poniendo en mailings o en la web alguien tiene que estar contestando
// automáticamente". El número del Business de Magma (+54 9 11 3011-6883) pasa a la API de Meta directo (sin
// intermediario, sin abono) y todo lo que entra y sale queda en la solapa WHATSAPP del Master.
//
// Cómo anda:
//   · Entra un mensaje → pages/api/whatsapp-webhook.js lo guarda y llama a responderSiCorresponde().
//   · El bot (Claude) contesta como Magma: pide los datos para presupuestar, NUNCA da precios ni promete fechas.
//   · Se calla solo si alguien del equipo ya contestó a ese número en las últimas 24 h (la persona tomó la charla)
//     o si ya derivó la conversación a una persona.
//   · Avisa por mail a Juan y Sofi: contacto nuevo, lead con los datos completos, o "quiere hablar con alguien".
//   · Para cortarlo de golpe: WHATSAPP_BOT=off en Vercel. Los mensajes se siguen guardando, el bot no contesta.
//
// Columnas de WHATSAPP (no reordenar: el webhook y el envío escriben por posición A:L):
//   Timestamp · Fecha · Hora · Direccion · Telefono · Nombre · Mensaje · Tipo · WA Message ID · Estado · Respondido · Notas
// En las salientes, Notas dice quién mandó: el mail de la persona del equipo, o "bot".

import Anthropic from '@anthropic-ai/sdk'
import { mandarAviso } from './edicion-avisos.js'

export const HOJA_WA = 'WHATSAPP'
const GRAPH = 'https://graph.facebook.com/v20.0'
const APP = process.env.NEXTAUTH_URL || 'https://somos-magma-app.vercel.app'
const AVISAR_A = 'juan@somosmagma.com, sofi@somosmagma.com'
const TOPE_BOT_POR_DIA = 12  // mensajes del bot a un mismo número en 24 h: si alguien lo hace conversar sin fin, frena
const DIA = 24 * 3600e3

// Lo que escribe alguien de afuera entra como texto, nunca como fórmula (ver el fix del 04/10 en el webhook).
export const plano = v => (/^[=+\-@]/.test(String(v)) ? "'" + v : v)
const txt = v => String(v ?? '').trim()

// Fecha y hora de Buenos Aires: Vercel corre en UTC y sin esto la hora del sheet quedaba 3 h adelantada.
const TZ = 'America/Argentina/Buenos_Aires'
export function filaWA({ ts = new Date(), direccion, telefono, nombre = '', mensaje, tipo = 'text', wamid = '', estado, notas = '' }) {
  return [
    ts.toISOString(),
    ts.toLocaleDateString('es-AR', { timeZone: TZ }),
    ts.toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }),
    direccion, plano(telefono), plano(nombre), plano(mensaje), plano(tipo), plano(wamid), estado, '', plano(notas),
  ]
}

export async function agregarFilas(sheets, SHEET_ID, filas) {
  if (!filas.length) return
  await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: `${HOJA_WA}!A:L`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: filas } })
}

/** Toda la solapa como objetos {ts, direccion, telefono, nombre, mensaje, tipo, wamid, estado, notas}, en orden. */
export async function leerWA(sheets, SHEET_ID) {
  const rows = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${HOJA_WA}!A:L` })).data.values || []
  return rows.slice(1).filter(r => txt(r[4])).map(r => ({
    ts: txt(r[0]), fecha: txt(r[1]), hora: txt(r[2]), direccion: txt(r[3]), telefono: txt(r[4]).replace(/^'/, ''),
    nombre: txt(r[5]).replace(/^'/, ''), mensaje: txt(r[6]).replace(/^'/, ''), tipo: txt(r[7]), wamid: txt(r[8]).replace(/^'/, ''),
    estado: txt(r[9]), notas: txt(r[11]).replace(/^'/, ''),
  }))
}

/** Manda un texto. Solo vale dentro de las 24 h desde el último mensaje del cliente (regla de Meta). */
export async function enviarTexto(to, text) {
  const PHONE = process.env.WHATSAPP_PHONE_ID, TOKEN = process.env.WHATSAPP_TOKEN
  if (!PHONE || !TOKEN) throw new Error('Falta configurar WHATSAPP_PHONE_ID y WHATSAPP_TOKEN en las variables de entorno de Vercel')
  const r = await fetch(`${GRAPH}/${PHONE}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: String(to).replace(/[^\d]/g, ''), type: 'text', text: { preview_url: true, body: String(text) } }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.error) { const e = new Error(j.error?.message || 'Error al enviar el mensaje'); e.detalle = j.error || null; throw e }
  return j.messages?.[0]?.id || ''
}

// ------------------------------------------------------------------ el bot

const SISTEMA = `Sos quien atiende el WhatsApp de SOMOS MAGMA, una productora audiovisual de Buenos Aires.
Escribís como una persona del equipo: español rioplatense, con voseo, cálido y directo, mensajes cortos de WhatsApp
(2 a 4 líneas). Sin signos de apertura (nada de "¿" ni "¡"). Como mucho un emoji, y no en todos los mensajes.

Qué hace Magma: fotografía, filmmaking, drone y FPV (pilotos certificados ANAC), edición y motion graphics, diseño
gráfico. Cubre eventos corporativos, activaciones, contenido para redes, gastronomía, deportes, moda, música, real
estate y estudio. Más de 30 profesionales. Dos modalidades: un proyecto puntual, o cobertura mensual para marcas con
necesidades frecuentes. NO hace branding ni identidad visual desde cero.

Tu trabajo: que la persona se sienta atendida y juntar lo necesario para que el equipo le arme un presupuesto:
  1. qué necesita (foto, video, ambos, drone, edición) y para qué (evento, contenido, campaña)
  2. fecha o fechas, y duración aproximada (horas o jornadas)
  3. lugar (barrio o ciudad)
  4. empresa o marca, y si viene por una agencia
  5. un mail para mandarle el presupuesto
Preguntá de a una o dos cosas por mensaje, no todo junto. Usá lo que ya dijo: no le vuelvas a preguntar algo que contestó.

Reglas firmes:
  - NUNCA des precios, rangos ni "desde $". Si pregunta cuánto sale: depende de la cobertura, y con los datos el
    equipo le arma el presupuesto en el día hábil.
  - NUNCA confirmes disponibilidad ni reserves fechas. El equipo la confirma con el presupuesto.
  - No inventes nada que no esté acá (trabajos hechos, clientes, equipos, plazos de entrega).
  - Cuando ya tengas los 5 datos (el mail puede faltar si no lo quiere dar), agradecé y decí que el equipo le
    manda el presupuesto en el día hábil. Marcá datos_completos.
  - Derivá a una persona (derivar = true) si: pide hablar con alguien, es un cliente con un trabajo en curso
    (entregas, cambios, facturas, pagos), es un freelancer o proveedor, hay una queja, o es algo que no sabés
    contestar. En ese caso respondé solo que le pasás la consulta a alguien del equipo que le escribe por acá.
  - Si el mensaje no es texto (audio, foto, video), decí que recibiste y pedí que lo cuente por escrito si puede.

Respondé SIEMPRE con el JSON pedido: respuesta (el texto exacto a mandar), derivar, datos_completos, y resumen
(una línea para el equipo con lo que se sabe del pedido: qué, cuándo, dónde, empresa, mail).`

const FORMATO = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      respuesta: { type: 'string' },
      derivar: { type: 'boolean' },
      datos_completos: { type: 'boolean' },
      resumen: { type: 'string' },
    },
    required: ['respuesta', 'derivar', 'datos_completos', 'resumen'],
    additionalProperties: false,
  },
}

/** Pide al modelo la respuesta para una conversación (lista de mensajes del sheet de un mismo número). */
export async function pensarRespuesta(conversacion) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  // La charla como turnos user/assistant. Los mensajes seguidos del mismo lado van juntos (la API no acepta dos
  // turnos iguales seguidos) y siempre termina en el cliente.
  const turnos = []
  for (const m of conversacion.slice(-30)) {
    const role = m.direccion === 'Entrante' ? 'user' : 'assistant'
    const texto = m.tipo === 'text' || !m.tipo ? m.mensaje : `${m.mensaje || `[${m.tipo}]`}`
    if (turnos.length && turnos[turnos.length - 1].role === role) turnos[turnos.length - 1].content += '\n' + texto
    else turnos.push({ role, content: texto })
  }
  while (turnos.length && turnos[0].role !== 'user') turnos.shift()
  if (!turnos.length || turnos[turnos.length - 1].role !== 'user') return null

  const resp = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: FORMATO },
    system: SISTEMA,
    messages: turnos,
  })
  if (resp.stop_reason === 'refusal') return null
  const crudo = resp.content.find(b => b.type === 'text')?.text || ''
  try { return JSON.parse(crudo) } catch (e) { return null }
}

/**
 * Decide si el bot contesta a este número y, si corresponde, contesta, lo guarda y avisa.
 * Nunca tira: el mensaje del cliente ya quedó guardado y un error acá no puede perderlo.
 */
export async function responderSiCorresponde({ sheets, SHEET_ID, telefono, nombre }) {
  try {
    const todo = await leerWA(sheets, SHEET_ID)
    const charla = todo.filter(m => m.telefono === telefono)
    const ahora = Date.now()
    const ultimas24 = charla.filter(m => ahora - Date.parse(m.ts) < DIA)
    const salientes24 = ultimas24.filter(m => m.direccion === 'Saliente')
    const primeraVez = charla.filter(m => m.direccion === 'Entrante').length <= 1

    // Si es la primera vez que escribe, el aviso sale aunque el bot esté apagado: alguien tiene que enterarse.
    const avisar = (asunto, detalle) => mandarAviso({
      para: AVISAR_A,
      asunto: `WhatsApp: ${asunto} · ${nombre || telefono}`,
      cuerpo: [
        `${nombre || 'Sin nombre'} · +${telefono}`,
        '',
        detalle,
        '',
        'Últimos mensajes:',
        ...charla.slice(-8).map(m => `${m.direccion === 'Entrante' ? '→' : '←'} ${m.hora} ${m.mensaje}`),
        '',
        `Contestar desde la app: ${APP}/whatsapp?tel=${telefono}`,
      ].join('\n'),
    })

    const motivoSilencio =
      txt(process.env.WHATSAPP_BOT).toLowerCase() === 'off' ? 'bot apagado'
      : !process.env.ANTHROPIC_API_KEY ? 'sin ANTHROPIC_API_KEY'
      : salientes24.some(m => m.notas && m.notas !== 'bot') ? 'ya lo está atendiendo una persona'
      : ultimas24.some(m => m.estado === 'bot-derivado') ? 'ya se derivó a una persona'
      : salientes24.filter(m => m.notas === 'bot').length >= TOPE_BOT_POR_DIA ? 'tope de mensajes del bot'
      : ''
    if (motivoSilencio) {
      if (primeraVez) await avisar('contacto nuevo', `El bot no contestó (${motivoSilencio}). Hay que contestarle a mano.`)
      return { contesto: false, motivo: motivoSilencio }
    }

    const r = await pensarRespuesta(charla)
    if (!r || !txt(r.respuesta)) {
      if (primeraVez) await avisar('contacto nuevo', 'El bot no pudo armar la respuesta. Hay que contestarle a mano.')
      return { contesto: false, motivo: 'sin respuesta del modelo' }
    }

    const wamid = await enviarTexto(telefono, r.respuesta)
    const yaEraLead = charla.some(m => m.estado === 'bot-lead')
    const estado = r.derivar ? 'bot-derivado' : (r.datos_completos && !yaEraLead ? 'bot-lead' : 'bot')
    await agregarFilas(sheets, SHEET_ID, [filaWA({ direccion: 'Saliente', telefono, mensaje: r.respuesta, wamid, estado, notas: 'bot' })])

    if (r.derivar) await avisar('quiere hablar con alguien', `El bot le dijo que le escribe alguien del equipo. Lo que se sabe: ${r.resumen}`)
    else if (estado === 'bot-lead') await avisar('lead listo para presupuestar', `Pedido: ${r.resumen}`)
    else if (primeraVez) await avisar('contacto nuevo', `El bot ya le contestó. Lo que se sabe hasta ahora: ${r.resumen}`)
    return { contesto: true, estado }
  } catch (e) {
    console.error('WA bot:', e.message, e.detalle || '')
    return { contesto: false, motivo: e.message }
  }
}
