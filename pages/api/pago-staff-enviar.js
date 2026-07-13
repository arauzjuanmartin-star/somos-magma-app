// Envía el mail de pago a un freelancer DE VERDAD desde la app (sin abrir Outlook).
// Sale de admin@somosmagma.com (MAIL_USER + MAIL_APP_PASSWORD), igual que factura-enviar.
import nodemailer from 'nodemailer'
import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { to, cc = [], asunto, cuerpo } = req.body || {}
  const dest = (Array.isArray(to) ? to : [to]).map(s => String(s || '').trim()).filter(Boolean)
  if (!dest.length) return res.status(400).json({ error: 'Falta el mail del freelancer' })
  if (!asunto || !cuerpo) return res.status(400).json({ error: 'Falta asunto o cuerpo' })

  const USER = process.env.MAIL_USER, PASS = process.env.MAIL_APP_PASSWORD
  if (!USER || !PASS) {
    return res.status(503).json({ error: 'Falta configurar el envío de mail. Cargá MAIL_USER y MAIL_APP_PASSWORD (contraseña de aplicación de admin@somosmagma.com) en las variables de entorno.' })
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: USER, pass: PASS.replace(/\s+/g, '') },
    })

    await transporter.sendMail({
      from: `Somos Magma <${USER}>`,
      to: dest.join(', '),
      cc: (Array.isArray(cc) ? cc : [cc]).map(s => String(s || '').trim()).filter(Boolean).join(', ') || undefined,
      replyTo: USER,
      subject: asunto,
      text: cuerpo,
    })

    try {
      const { sheets, SHEET_ID } = await getSheets()
      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'pago-staff-mail-enviado', 'PAGOS_STAFF', '', `a: ${dest.join(', ')}`]] } })
    } catch (e) { /* best-effort */ }

    res.json({ ok: true, enviadoA: dest })
  } catch (e) {
    console.error('pago-staff-enviar:', e)
    const msg = /invalid login|username and password|BadCredentials/i.test(e.message)
      ? 'Gmail rechazó el usuario/contraseña. Revisá que MAIL_APP_PASSWORD sea una contraseña de aplicación válida de admin@somosmagma.com (con 2FA activado).'
      : e.message
    res.status(500).json({ error: msg })
  }
}
