// Envía el mail de factura DE VERDAD desde la app (sin abrir el cliente de mail).
// Usa nodemailer + Gmail SMTP con una contraseña de aplicación de admin@somosmagma.com.
// Requiere env: MAIL_USER (admin@somosmagma.com) y MAIL_APP_PASSWORD (app password sin espacios).
import nodemailer from 'nodemailer'
import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { to = [], cc = [], asunto, cuerpo, presupuestoNum } = req.body || {}
  const dest = (Array.isArray(to) ? to : [to]).map(s => String(s||'').trim()).filter(Boolean)
  if (!dest.length) return res.status(400).json({ error: 'No hay destinatarios' })
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
      cc: (Array.isArray(cc) ? cc : [cc]).map(s => String(s||'').trim()).filter(Boolean).join(', ') || undefined,
      replyTo: USER,
      subject: asunto,
      text: cuerpo,
    })

    // Marcar "Fc Enviada" = TRUE en la factura (best-effort) + log
    try {
      const { sheets, SHEET_ID } = await getSheets()
      if (presupuestoNum) {
        const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AG' })
        const rows = r.data.values || [], h = rows[0] || []
        const iNum = h.indexOf('N° Presupuesto'), iEnv = h.indexOf('Fc Enviada'), iFecha = h.indexOf('Fecha enviada')
        if (iNum >= 0 && iEnv >= 0) {
          const idx = rows.findIndex((row, i) => i > 0 && String(row[iNum]||'').trim() === String(presupuestoNum).trim())
          if (idx > 0) {
            const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)} return s }
            const upd = [{ range: `FACTURACION!${colLetra(iEnv)}${idx+1}`, values: [[true]] }]
            // Fecha enviada: se estampa la 1ra vez que se manda por mail (si no estaba ya cargada por el upload).
            if (iFecha >= 0 && !String(rows[idx][iFecha]||'').trim()) {
              const d = new Date(); const hoy = d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear()
              upd.push({ range: `FACTURACION!${colLetra(iFecha)}${idx+1}`, values: [[hoy]] })
            }
            await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: upd } })
          }
        }

      }
      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'factura-mail-enviado', 'FACTURACION', String(presupuestoNum||''), `a: ${dest.join(', ')}`]] } })
    } catch (e) { console.warn('post-envío (marca/log) falló:', e.message) }

    res.json({ ok: true, enviadoA: dest })
  } catch (e) {
    console.error('factura-enviar:', e)
    const msg = /invalid login|username and password|BadCredentials/i.test(e.message)
      ? 'Gmail rechazó el usuario/contraseña. Revisá que MAIL_APP_PASSWORD sea una contraseña de aplicación válida de admin@somosmagma.com (con 2FA activado).'
      : e.message
    res.status(500).json({ error: msg })
  }
}
