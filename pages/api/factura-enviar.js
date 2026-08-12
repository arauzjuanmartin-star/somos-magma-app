// Envía el mail de factura DE VERDAD desde la app (sin abrir el cliente de mail).
// Usa nodemailer + Gmail SMTP con una contraseña de aplicación de admin@somosmagma.com.
// Requiere env: MAIL_USER (admin@somosmagma.com) y MAIL_APP_PASSWORD (app password sin espacios).
//
// El PDF de la factura va ADJUNTO al mail (no como link de Drive): el Drive es privado y
// el cliente terminaba en la pantalla de "solicitar acceso". La cuenta de servicio baja el
// archivo y nodemailer lo manda pegado al mail.
import nodemailer from 'nodemailer'
import { google } from 'googleapis'
import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const MAX_ADJUNTO = 20 * 1024 * 1024  // Gmail corta cerca de 25MB con el encoding incluido

function getDriveAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
}

// De un webViewLink de Drive (https://drive.google.com/file/d/XXXX/view) saca el ID
function fileIdDeLink(link) {
  const m = String(link || '').match(/[-\w]{25,}/)
  return m ? m[0] : ''
}

// Baja el PDF de Drive y lo devuelve listo para adjuntar. Tira error si no puede.
async function bajarAdjunto(link, nroFactura) {
  const fileId = fileIdDeLink(link)
  if (!fileId) throw new Error('El link de la factura guardado en el sheet no es un archivo de Drive válido')
  const drive = google.drive({ version: 'v3', auth: getDriveAuth() })

  const meta = await withSheetsRetry(() => drive.files.get({
    fileId, fields: 'name,mimeType,size', supportsAllDrives: true,
  }))
  const size = parseInt(meta.data.size || '0', 10)
  if (size > MAX_ADJUNTO) throw new Error(`El PDF pesa ${(size/1024/1024).toFixed(1)}MB y no entra como adjunto (máx 20MB)`)

  const bin = await withSheetsRetry(() => drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  ))

  // Nombre limpio para el cliente: "Factura A-0003-00001234.pdf" (con la extensión real)
  const nombreDrive = meta.data.name || 'factura.pdf'
  const ext = (nombreDrive.match(/\.[a-z0-9]{2,5}$/i) || ['.pdf'])[0]
  const nroLimpio = String(nroFactura || '').replace(/[\\/:*?"<>|]/g, '-').trim()
  const filename = nroLimpio ? `Factura ${nroLimpio}${ext}` : nombreDrive

  return {
    filename,
    content: Buffer.from(bin.data),
    contentType: meta.data.mimeType || 'application/pdf',
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  // accion/detalle: para que el LOG distinga un envío de factura de un reclamo de cuenta.
  // Sin presupuestoNum NO se marca "Fc Enviada" (un reclamo no re-envía la factura).
  // adjuntarPDF: lo manda el front cuando la factura tiene PDF cargado (lo dice factura-prep-mail).
  const { to = [], cc = [], asunto, cuerpo, presupuestoNum, accion, detalle, adjuntarPDF = false } = req.body || {}
  const dest = (Array.isArray(to) ? to : [to]).map(s => String(s||'').trim()).filter(Boolean)
  if (!dest.length) return res.status(400).json({ error: 'No hay destinatarios' })
  if (!asunto || !cuerpo) return res.status(400).json({ error: 'Falta asunto o cuerpo' })

  const USER = process.env.MAIL_USER, PASS = process.env.MAIL_APP_PASSWORD
  if (!USER || !PASS) {
    return res.status(503).json({ error: 'Falta configurar el envío de mail. Cargá MAIL_USER y MAIL_APP_PASSWORD (contraseña de aplicación de admin@somosmagma.com) en las variables de entorno.' })
  }

  try {
    // 1) Adjunto: buscar el PDF de la factura en Drive ANTES de mandar nada.
    //    Si el cuerpo promete "adjunto la factura", el mail no sale sin el PDF.
    let adjunto = null
    if (adjuntarPDF && presupuestoNum) {
      try {
        const { sheets, SHEET_ID } = await getSheets()
        const r = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AG' }))
        const rows = r.data.values || [], h = rows[0] || []
        const iNum = h.indexOf('N° Presupuesto'), iFact = h.indexOf('Factura'), iNro = h.indexOf('Nro de Factura')
        const fila = rows.find((row, i) => i > 0 && String(row[iNum]||'').trim() === String(presupuestoNum).trim())
        const link = fila && iFact >= 0 ? String(fila[iFact] || '').trim() : ''
        if (!link) throw new Error('La factura no tiene PDF cargado. Subilo con el botón 📎 y volvé a mandar el mail.')
        adjunto = await bajarAdjunto(link, fila && iNro >= 0 ? fila[iNro] : '')
      } catch (e) {
        console.error('factura-enviar (adjunto):', e)
        return res.status(400).json({ error: `No pude adjuntar el PDF de la factura: ${e.message}` })
      }
    }

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
      attachments: adjunto ? [adjunto] : undefined,
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
      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, accion || 'factura-mail-enviado', 'FACTURACION', String(presupuestoNum || detalle || ''), `a: ${dest.join(', ')}${adjunto ? ` · adjunto: ${adjunto.filename}` : ''}`]] } })
    } catch (e) { console.warn('post-envío (marca/log) falló:', e.message) }

    res.json({ ok: true, enviadoA: dest, adjunto: adjunto ? adjunto.filename : null })
  } catch (e) {
    console.error('factura-enviar:', e)
    const msg = /invalid login|username and password|BadCredentials/i.test(e.message)
      ? 'Gmail rechazó el usuario/contraseña. Revisá que MAIL_APP_PASSWORD sea una contraseña de aplicación válida de admin@somosmagma.com (con 2FA activado).'
      : e.message
    res.status(500).json({ error: msg })
  }
}
