// Lee la casilla de admin@somosmagma.com por IMAP y devuelve las RESPUESTAS de freelancers
// a los mails de pago (asunto "Re: Facturación…" o remitente que está en RRHH). Para que Flor
// vea quién contestó / mandó su factura, sin entrar a Gmail.
import { ImapFlow } from 'imapflow'
import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

// Recorre el bodyStructure buscando algún adjunto (disposition attachment o filename).
function tieneAdjunto(bs) {
  if (!bs) return false
  const check = node => {
    if (!node) return false
    const disp = String(node.disposition || '').toLowerCase()
    const fname = node.dispositionParameters?.filename || node.parameters?.name
    if (disp === 'attachment' || fname) return true
    return Array.isArray(node.childNodes) ? node.childNodes.some(check) : false
  }
  return check(bs)
}

export default async function handler(req, res) {
  const auth = await requireAuth(req, res)
  if (!auth) return
  const USER = process.env.MAIL_USER, PASS = process.env.MAIL_APP_PASSWORD
  if (!USER || !PASS) return res.status(503).json({ error: 'Falta configurar MAIL_USER / MAIL_APP_PASSWORD.' })

  // RRHH (email→nombre) + PAGOS_STAFF (para saber a quién se le mandó el mail / quién tiene factura)
  let freelPorMail = {}, psRows = []
  try {
    const { sheets, SHEET_ID } = await getSheets()
    const b = await sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEET_ID, ranges: ['RRHH!A:D', 'PAGOS_STAFF!A:N'] })
    const rrhh = b.data.valueRanges?.[0]?.values || []
    const h = rrhh[0] || []
    const iNom = h.indexOf('Nombre Apellido'), iMail = h.indexOf('Mail')
    rrhh.slice(1).forEach(row => { const m = String(row[iMail] || '').trim().toLowerCase(); if (/@/.test(m)) freelPorMail[m] = String(row[iNom] || '').trim() })
    psRows = b.data.valueRanges?.[1]?.values || []
  } catch (e) { /* seguimos sin roster */ }

  let client
  try {
    client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: USER, pass: PASS.replace(/\s+/g, '') }, logger: false })
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    const out = []
    try {
      const desde = new Date(); desde.setDate(desde.getDate() - 21)
      let uids = []
      try { uids = await client.search({ since: desde }, { uid: true }) } catch (e) { uids = [] }
      if (Array.isArray(uids) && uids.length) {
        uids = uids.slice(-150)  // acotar
        for await (const msg of client.fetch(uids, { uid: true, envelope: true, flags: true, bodyStructure: true }, { uid: true })) {
          const e = msg.envelope || {}
          const fromAddr = String(e.from?.[0]?.address || '').toLowerCase()
          const fromName = e.from?.[0]?.name || ''
          const subj = e.subject || '(sin asunto)'
          if (fromAddr === USER.toLowerCase()) continue  // no los que mandamos nosotros
          // Solo respuestas a los mails de pago: asunto "Re: Facturación {mes} — Somos Magma".
          // (Filtro preciso para no traer VEPs del contador, invitaciones, mails internos, etc.)
          const esRespuestaPago = /facturaci[oó]n/i.test(subj) && /somos\s*magma/i.test(subj)
          if (!esRespuestaPago) continue
          out.push({
            uid: msg.uid,
            nombre: freelPorMail[fromAddr] || fromName || fromAddr,
            email: fromAddr,
            asunto: subj,
            fecha: e.date ? new Date(e.date).toISOString() : null,
            adjunto: tieneAdjunto(msg.bodyStructure),
            leido: !!msg.flags?.has('\\Seen'),
            esFreelancer: esFreel,
          })
        }
      }
    } finally { lock.release() }
    await client.logout()
    out.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0))

    // Estado de los mails de pago: enviados (ciclo, últimos 40 días) vs quién respondió / tiene factura
    const norm = s => String(s || '').trim().toLowerCase()
    const repliedNames = new Set(out.map(m => norm(m.nombre)))
    const hace = new Date(); hace.setDate(hace.getDate() - 40)
    const parseDMY = s => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (!m) return null; const y = m[3].length === 2 ? '20' + m[3] : m[3]; const d = new Date(Number(y), Number(m[2]) - 1, Number(m[1])); return isNaN(d.getTime()) ? null : d }
    const psH = psRows[0] || []
    const iFre = psH.indexOf('Freelancer') !== -1 ? psH.indexOf('Freelancer') : 1
    const iEnv = psH.indexOf('Mail Enviado') !== -1 ? psH.indexOf('Mail Enviado') : 12
    const iFac = psH.indexOf('Factura') !== -1 ? psH.indexOf('Factura') : 13
    const porPers = {}
    psRows.slice(1).forEach(row => {
      const nombre = String(row[iFre] || '').trim(); if (!nombre) return
      const k = norm(nombre)
      if (!porPers[k]) porPers[k] = { nombre, enviadoReciente: false, factura: false }
      if (String(row[iFac] || '').trim()) porPers[k].factura = true
      const env = String(row[iEnv] || '').trim(); if (env) { const d = parseDMY(env); if (d && d >= hace) porPers[k].enviadoReciente = true }
    })
    const enviados = Object.values(porPers).filter(p => p.enviadoReciente).map(p => {
      const replied = repliedNames.has(norm(p.nombre))
      return { nombre: p.nombre, replied, factura: p.factura, respondio: replied || p.factura }
    })
    const facturaNames = new Set(Object.values(porPers).filter(p => p.factura).map(p => norm(p.nombre)))
    const resumen = {
      enviados: enviados.length,
      respondieron: enviados.filter(e => e.respondio).length,
      sinResponder: enviados.filter(e => !e.respondio).length,
      sinGuardar: out.filter(m => m.adjunto && !facturaNames.has(norm(m.nombre))).length,
    }
    res.json({ ok: true, casilla: USER, respuestas: out.slice(0, 40), enviados, resumen })
  } catch (e) {
    console.error('pagos-staff-respuestas:', e.message)
    try { await client?.logout() } catch (_) {}
    res.status(500).json({ error: 'No se pudo leer la casilla: ' + e.message })
  }
}
