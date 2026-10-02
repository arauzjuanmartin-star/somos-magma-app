/**
 * Lee del mail los VEP que manda el contador. Solo lee: no marca, no mueve ni contesta nada.
 *
 * Diego manda un mail por impuesto ("VEP IVA 06-2026 Somos Magma") con el volante en PDF y, en el cuerpo, la fecha
 * ("VENCE: 23/09"). A veces contesta en el mismo hilo con un volante nuevo, y a veces lo manda como imagen: en ese
 * caso queda el aviso con lo que dice el asunto, sin monto, para que alguien lo complete.
 *
 * Va aparte de lib/impuestos.mjs (que es cálculo puro) porque esto sí sale a la red y solo corre en el servidor.
 */
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { leerVep, leerAsuntoVep, venceDeMail } from './impuestos.mjs'

// El día en que llegó, en hora de Argentina (Vercel corre en UTC: un mail de las 22 hs quedaría con fecha del día siguiente)
const dmy = d => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
// Lo que se escribió de nuevo en el mail, sin la cadena de mensajes citados (ahí puede haber un "VENCE:" viejo).
const sinCitas = t => String(t || '').split(/^\s*El .*escribi[óo]:|^\s*El .{5,80}\n?.*escribi[óo]:|^\s*On .*wrote:|^-{2,}\s*Mensaje original/m)[0].split('\n').filter(l => !/^\s*>/.test(l)).join('\n')

/**
 * @param opts { user, pass, desde: Date (opcional: solo mails desde ese día), maxMs (opcional: cortar la conexión si tarda más), dominio, casilla }
 * @returns { veps: [{ nro, titular, impuesto, periodo, monto, expira, vence, llego, asunto, sinPdf }] del más viejo al más nuevo,
 *            errores: ["asunto · archivo: por qué no se pudo leer"] }
 */
export async function vepsDelMail({ user, pass, desde = null, maxMs = 0, dominio = 'dmestudiocontable.com', casilla = '[Gmail]/Todos' }) {
  const { PDFParse } = await import('pdf-parse')
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false })
  // Sin esto, un corte de la conexión es un evento sin dueño y tira abajo todo el proceso (el aviso de la diaria incluido).
  client.on('error', () => {})
  const out = [], errores = []
  let lock = null, cortado = false
  // Si el mail no contesta a tiempo se cierra la conexión: lo que estaba esperando falla y nadie queda colgado.
  const reloj = maxMs ? setTimeout(() => { cortado = true; try { client.close() } catch (x) { /* ya estaba cerrada */ } }, maxMs) : null
  try {
    await client.connect()
    lock = await client.getMailboxLock(casilla)
    const seqs = await client.search({ from: dominio, ...(desde ? { since: desde } : {}) }, { uid: false })
    const meta = []
    if (seqs && seqs.length) for await (const msg of client.fetch(seqs, { envelope: true })) meta.push({ seq: msg.seq, asunto: msg.envelope.subject || '', fecha: new Date(msg.envelope.date) })
    for (const m of meta.filter(x => /vep/i.test(x.asunto)).sort((a, b) => a.fecha - b.fecha)) {
      const { content } = await client.download(`${m.seq}`)
      const mail = await simpleParser(content)
      const vence = venceDeMail(sinCitas(mail.text), m.fecha)
      let conPdf = 0, fallo = false
      for (const a of mail.attachments || []) {
        if (!/\.pdf$/i.test(a.filename || '')) continue
        let v = null
        // Un PDF que no se puede leer no frena al resto, pero queda dicho: no es lo mismo que "vino como imagen".
        try { v = leerVep((await new PDFParse({ data: a.content }).getText()).text) } catch (e) { fallo = true; errores.push(`${m.asunto.trim()} · ${a.filename}: ${e.message}`) }
        if (!v) continue
        conPdf++
        out.push({ ...v, vence, llego: dmy(m.fecha), asunto: m.asunto.trim(), sinPdf: false })
      }
      // El mail original de un VEP sin volante legible (vino como imagen): se avisa igual, con lo que dice el asunto.
      const a = leerAsuntoVep(m.asunto)
      if (!conPdf && !fallo && a && a.impuesto && a.periodo && !/^\s*(re|rv|fw|fwd)\s*:/i.test(m.asunto)) out.push({ nro: '', cuit: '', ...a, monto: 0, expira: '', vence, llego: dmy(m.fecha), asunto: m.asunto.trim(), sinPdf: true })
    }
    lock.release(); lock = null
    await client.logout()
  } catch (e) {
    try { lock && lock.release() } catch (x) { /* ya estaba suelto */ }
    try { client.close() } catch (x) { /* ya estaba cerrada */ }
    throw cortado ? new Error(`el mail tardó más de ${Math.round(maxMs / 1000)} segundos en contestar`) : e
  } finally { clearTimeout(reloj) }
  return { veps: out, errores }
}
