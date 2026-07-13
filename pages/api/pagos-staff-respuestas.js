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

  // Emails de freelancers (RRHH) → nombre, para reconocer quién escribe
  let freelPorMail = {}
  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'RRHH!A:D' })
    const rows = r.data.values || [], h = rows[0] || []
    const iNom = h.indexOf('Nombre Apellido'), iMail = h.indexOf('Mail')
    rows.slice(1).forEach(row => { const m = String(row[iMail] || '').trim().toLowerCase(); if (/@/.test(m)) freelPorMail[m] = String(row[iNom] || '').trim() })
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
    res.json({ ok: true, respuestas: out.slice(0, 40), casilla: USER })
  } catch (e) {
    console.error('pagos-staff-respuestas:', e.message)
    try { await client?.logout() } catch (_) {}
    res.status(500).json({ error: 'No se pudo leer la casilla: ' + e.message })
  }
}
