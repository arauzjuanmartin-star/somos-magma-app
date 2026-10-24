// Preaviso de vencimiento (regla en lib/preaviso-cobro.js). Sale de la casilla de Flor (admin@), con su nombre y su
// firma, y si es una sola factura va como respuesta en el hilo del mail con el que se mandó la factura: el cliente
// tiene el PDF ahí mismo. A quién: los mismos que recibieron la factura (se leen de ese mail en Enviados).
//
//   GET  → los avisos de hoy armados (para, asunto, texto) + los que no salen y por qué
//   POST { avisos: [{ filas, to, cc, asunto, cuerpo, threadId, inReplyTo }] } → los manda y anota la fecha en
//        FACTURACION, columna "Preaviso enviado" (la crea scripts/facturacion-columna-preaviso.mjs)
import { google } from 'googleapis'
import MailComposer from 'nodemailer/lib/mail-composer/index.js'
import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { preavisosDeHoy, textoPreaviso, COL_PREAVISO, FIRMA_ADMIN, hoyAR, dmy } from '../../lib/preaviso-cobro'

const CASILLA = FIRMA_ADMIN.casilla
const norm = v => String(v || '').toLowerCase().trim()
const esMail = s => /^[a-z0-9][^@\s]*@[^@\s]+\.[^@\s]+$/i.test(String(s || '').trim())
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }

const gmailAdmin = () => google.gmail({ version: 'v1', auth: new google.auth.GoogleAuth({
  credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
  scopes: ['https://www.googleapis.com/auth/gmail.modify'], clientOptions: { subject: CASILLA },
}) })
const cab = (msg, n) => (msg.payload?.headers || []).find(x => x.name.toLowerCase() === n.toLowerCase())?.value || ''
// "Silvia Pérez <silvia@x.com>, b@y.com" → ['silvia@x.com', 'b@y.com'] (sin las casillas de Magma)
const mailsDe = s => (String(s || '').match(/[^\s<>,;"]+@[^\s<>,;"]+/g) || []).filter(m => !/@somosmagma\.com$/i.test(m))

// El mail con el que salió la factura, en Enviados de admin@ (lo arma factura-enviar: "Factura <N°> - Somos Magma - …")
async function mailDeLaFactura(gmail, nroFactura) {
  const l = await gmail.users.messages.list({ userId: 'me', q: `in:sent subject:"Factura ${nroFactura}"`, maxResults: 5 })
  const ids = (l.data.messages || []).map(m => m.id)
  if (!ids.length) return null
  // El más viejo es el envío original (los siguientes pueden ser respuestas de Flor en el mismo hilo)
  const msg = (await gmail.users.messages.get({ userId: 'me', id: ids[ids.length - 1], format: 'full' })).data
  const to = mailsDe(cab(msg, 'To')), cc = mailsDe(cab(msg, 'Cc'))
  if (!to.length) return null
  // El saludo del mail original ("Hola Silvia,") para saludar igual
  const saludo = (String(msg.snippet || '').match(/^Hola\s+([^,!\s]+)/i) || [])[1] || ''
  return { to, cc, threadId: msg.threadId, inReplyTo: cab(msg, 'Message-ID'), asunto: cab(msg, 'Subject'), saludo }
}

async function lineasTransfer(sheets, SHEET_ID) {
  const r = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CUENTAS!A:N' }))
  const v = r.data.values || [], h = v[0] || []
  const cu = v.slice(1).find(x => norm(x[0]) === 'bbva somos magma') || v[1]
  if (!cu) return []
  const g = n => cu[h.indexOf(n)] || ''
  const out = []
  if (g('Titular') || g('Entidad fiscal')) out.push(`• Titular: ${g('Titular') || g('Entidad fiscal')}`)
  if (g('Banco')) out.push(`• Banco: ${g('Banco')}`)
  if (g('Alias')) out.push(`• Alias: ${g('Alias')}`)
  if (g('CBU')) out.push(`• CBU: ${g('CBU')}`)
  return out
}

const leerFacturacion = async (sheets, SHEET_ID) =>
  (await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AZ' }))).data.values || []

export default async function handler(req, res) {
  const auth = await requireAuth(req, res)
  if (!auth) return
  try {
    const { sheets, SHEET_ID } = await getSheets()
    const rows = await leerFacturacion(sheets, SHEET_ID)
    const H = (rows[0] || []).map(x => String(x).trim())
    const iCol = H.indexOf(COL_PREAVISO)
    if (iCol < 0) return res.status(400).json({ error: `Falta la columna "${COL_PREAVISO}" en FACTURACION. Se crea con scripts/facturacion-columna-preaviso.mjs --escribir.` })

    if (req.method === 'GET') {
      const { listas, fuera } = preavisosDeHoy(rows)
      // El cartel de Facturación solo necesita cuántos hay: sin ir al mail
      // (la promesa de pago no cuenta como "para resolver": ya está resuelta)
      if (req.query.contar === '1') return res.json({ ok: true, n: listas.length, total: listas.reduce((s, f) => s + f.monto, 0), resolver: fuera.filter(f => f.tipo !== 'prometio').length })
      const gmail = gmailAdmin()
      const transfer = await lineasTransfer(sheets, SHEET_ID)
      // Cada factura con el mail con el que salió; sin ese mail no se sabe a quién avisarle
      const conMail = []
      for (const f of listas) {
        let m = null
        try { m = await mailDeLaFactura(gmail, f.nroFactura) } catch (e) { console.warn('preaviso (gmail):', e.message) }
        if (m) conMail.push({ ...f, mail: m })
        else fuera.push({ ...f, tipo: 'sinmail', motivo: 'no encuentro en admin@ el mail con el que se mandó la factura (¿salió por fuera de la app?): avisale con "Avisar a mano"' })
      }
      // Uno por agencia y destinatarios: dos facturas de Ostara que se mandaron a personas distintas
      // (Daniela por una, Nahuel por otra) van cada una en su hilo, no juntas a los dos
      const porAg = {}
      conMail.forEach(f => { (porAg[`${norm(f.agencia)}|${f.mail.to.map(norm).sort().join(',')}`] ||= []).push(f) })
      const avisos = Object.values(porAg).map(fs => {
        const uno = fs.length === 1 ? fs[0] : null
        const to = [...new Set(fs.flatMap(f => f.mail.to.map(norm)))]
        const cc = [...new Set(fs.flatMap(f => f.mail.cc.map(norm)))].filter(c => !to.includes(c))
        const asunto = uno ? (/^re:/i.test(uno.mail.asunto) ? uno.mail.asunto : `Re: ${uno.mail.asunto}`) : `Facturas por vencer - Somos Magma / ${fs[0].agencia}`
        return {
          agencia: fs[0].agencia, filas: fs.map(f => f.fila), facturas: fs.map(({ mail, ...f }) => f),
          to, cc, asunto, cuerpo: textoPreaviso({ facturas: fs, saludo: fs[0].mail.saludo, lineasTransfer: transfer }),
          threadId: uno ? uno.mail.threadId : '', inReplyTo: uno ? uno.mail.inReplyTo : '',
          total: fs.reduce((s, f) => s + f.monto, 0),
        }
      })
      return res.json({ ok: true, avisos, fuera, desde: `${FIRMA_ADMIN.nombre} <${CASILLA}>` })
    }

    if (req.method !== 'POST') return res.status(405).end()
    const pedidos = Array.isArray(req.body?.avisos) ? req.body.avisos : []
    if (!pedidos.length) return res.status(400).json({ error: 'No hay avisos para mandar' })
    const hoy = dmy(hoyAR())
    const gmail = gmailAdmin()
    const from = `"${FIRMA_ADMIN.nombre}" <${CASILLA}>`
    const enviados = [], errores = []
    for (const a of pedidos) {
      const filas = (a.filas || []).map(Number).filter(n => n >= 2)
      const to = (a.to || []).filter(esMail), cc = (a.cc || []).filter(esMail)
      if (!filas.length || !to.length || !a.asunto || !a.cuerpo) { errores.push(`${a.agencia || '?'}: faltan datos`); continue }
      // Doble clic o dos personas a la vez: si alguna ya tiene preaviso, ese mail no sale
      if (filas.some(n => String(rows[n - 1]?.[iCol] || '').trim())) { errores.push(`${a.agencia}: ya se había avisado`); continue }
      try {
        const raw = await new MailComposer({
          from, to: to.join(', '), cc: cc.length ? cc.join(', ') : undefined, subject: a.asunto, text: a.cuerpo,
          ...(a.inReplyTo ? { inReplyTo: a.inReplyTo, references: a.inReplyTo } : {}),
        }).compile().build()
        await gmail.users.messages.send({ userId: 'me', requestBody: { raw: raw.toString('base64url'), ...(a.threadId ? { threadId: a.threadId } : {}) } })
      } catch (e) { errores.push(`${a.agencia}: no salió (${e.message})`); continue }
      // Regla de oro #1: queda en el sheet, en la fila de cada factura
      try {
        await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: {
          valueInputOption: 'RAW', data: filas.map(n => ({ range: `FACTURACION!${colLetra(iCol)}${n}`, values: [[hoy]] })),
        } }))
        filas.forEach(n => { if (rows[n - 1]) rows[n - 1][iCol] = hoy })
      } catch (e) { errores.push(`${a.agencia}: el mail salió pero no pude anotarlo en FACTURACION (${e.message}). Anotá "${hoy}" en "${COL_PREAVISO}" a mano para que no salga de nuevo.`) }
      try {
        await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[
          new Date().toISOString(), auth.mail, 'preaviso-cobro', 'FACTURACION', filas.join(','), `${a.agencia} · a: ${to.join(', ')} · desde ${CASILLA}`.slice(0, 900),
        ]] } })
      } catch (e) {}
      enviados.push({ agencia: a.agencia, to })
    }
    res.json({ ok: !errores.length || enviados.length > 0, enviados, errores })
  } catch (e) {
    console.error('preaviso-cobro:', e)
    res.status(500).json({ error: e.message })
  }
}
