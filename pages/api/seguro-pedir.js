// Pedido de seguro: el mail a La Segunda con la nómina de quienes van a un rodaje (nombre, DNI,
// nacimiento, nacionalidad) para que emitan el certificado de Accidentes Personales. Juan,
// 08/10/2026: "una vez que confirmamos un laburo y ponemos a los que van, deberíamos poder
// mandarle un mail a la aseguradora… desde la aplicación tiene que ser fácil".
//
// Sale DESDE LA CASILLA DE QUIEN LO MANDA (juan@, sofi@…): la cuenta de servicio de la app
// actúa como ese usuario (la misma delegación que usa scripts/mail-borrador.mjs), así el mail
// queda en sus Enviados y la respuesta de Álvaro con el PDF le llega en el mismo hilo. Si eso
// falla (una casilla fuera del dominio), sale desde admin@ por SMTP con respuesta a quien lo
// mandó, como factura-enviar y oc-pedir.
//
// Deja una fila por persona en la solapa SEGUROS (qué trabajo, para cuándo, dónde, qué pidieron
// para ese lugar, a quién, quién lo pidió). Lo que piden depende del lugar: la próxima vez en el
// mismo lugar la pantalla lo precarga desde acá (lib/seguros.js, requisitosSugeridos).
//
// Adjuntos (08/10/2026, "hay veces que los clientes mandan en PDF lo que necesitan"): los archivos
// que se suben en la pantalla van pegados al mail, se guardan en Drive (ADMINISTRACION / Seguros /
// cliente) y el link queda en la fila, así la próxima vez en el mismo lugar se vuelven a adjuntar
// solos (`reutilizar`: ids de Drive que se bajan y se pegan). Vienen en el JSON en base64: Vercel
// corta el pedido en 4,5 MB, por eso la pantalla frena en 3 MB de archivos.
import { google } from 'googleapis'
import nodemailer from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer/index.js'
import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { HOJA_SEGUROS, formatAdjuntos } from '../../lib/seguros'
import { getDrive, subirASeguros, nombreLimpio } from '../../lib/seguros-drive'

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }
const MAX_ADJUNTOS = 3 * 1024 * 1024

// Un texto que empieza con = + - @ el sheet lo toma como fórmula y deja #ERROR! ("+Conectados").
const texto = v => { const s = String(v ?? '').trim(); return /^[=+\-@]/.test(s) ? `'${s}` : s }
const esMail = s => /^[a-z0-9][^@\s]*@[^@\s]+\.[^@\s]+$/i.test(String(s || '').trim())
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }

// Manda el mail como esa casilla @somosmagma.com (delegación en todo el dominio, alcance gmail.modify).
async function mandarComo(casilla, { to, cc, subject, text, attachments }) {
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
    scopes: ['https://www.googleapis.com/auth/gmail.modify'], clientOptions: { subject: casilla },
  })
  const gmail = google.gmail({ version: 'v1', auth })
  // Con el nombre con el que firma esa casilla (el mismo que usa Gmail al escribir a mano)
  let from = casilla
  try {
    const sa = (await gmail.users.settings.sendAs.list({ userId: 'me' })).data.sendAs || []
    const propio = sa.find(s => String(s.sendAsEmail || '').toLowerCase() === casilla)
    if (propio?.displayName) from = `"${propio.displayName}" <${casilla}>`
  } catch (e) { /* sin nombre, sale la casilla pelada */ }
  const raw = await new MailComposer({ from, to: to.join(', '), cc: cc.length ? cc.join(', ') : undefined, subject, text, attachments }).compile().build()
  const r = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: raw.toString('base64url') } })
  return { desde: casilla, id: r.data.id, threadId: r.data.threadId || '' }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { num, to = [], cc = [], asunto, cuerpo, personas = [], trabajo = {}, vigencia = '', requisitos = '', adjuntos = [], reutilizar = [] } = req.body || {}
  const dest = (Array.isArray(to) ? to : [to]).map(s => String(s || '').trim()).filter(esMail)
  const copias = (Array.isArray(cc) ? cc : [cc]).map(s => String(s || '').trim()).filter(esMail).filter(c => !dest.some(d => d.toLowerCase() === c.toLowerCase()))
  if (!dest.length) return res.status(400).json({ error: 'No hay destinatarios' })
  if (!asunto || !cuerpo) return res.status(400).json({ error: 'Falta asunto o cuerpo' })
  if (!String(num || '').trim()) return res.status(400).json({ error: 'Falta el N° del trabajo' })
  const lista = (Array.isArray(personas) ? personas : []).filter(p => p && String(p.nombre || '').trim())
  if (!lista.length) return res.status(400).json({ error: 'No hay personas en el pedido' })
  if (lista.length > 40) return res.status(400).json({ error: 'Son demasiadas personas para un solo pedido (máximo 40)' })
  // Los archivos: nuevos (base64) y los que ya están en Drive de un pedido anterior (por id)
  const nuevos = (Array.isArray(adjuntos) ? adjuntos : []).filter(a => a && a.base64 && String(a.nombre || '').trim()).map(a => ({ nombre: nombreLimpio(a.nombre), tipo: String(a.tipo || 'application/octet-stream'), content: Buffer.from(String(a.base64), 'base64') }))
  const pesoNuevos = nuevos.reduce((s, a) => s + a.content.length, 0)
  if (pesoNuevos > MAX_ADJUNTOS) return res.status(400).json({ error: `Los archivos pesan ${(pesoNuevos / 1024 / 1024).toFixed(1)} MB y el tope es 3 MB en total. Comprimí el PDF o mandalo aparte.` })
  const viejos = (Array.isArray(reutilizar) ? reutilizar : []).map(a => ({ id: String(a?.id || '').trim(), nombre: nombreLimpio(a?.nombre), link: String(a?.link || '').trim() })).filter(a => /^[-\w]{25,}$/.test(a.id))

  try {
    const { sheets, SHEET_ID } = await getSheets()

    // 1) La solapa tiene que estar ANTES de mandar nada: si no hay dónde anotar el pedido, el mail no sale.
    //    (Regla de oro: lo que hace la app queda en el sheet.)
    let headers = []
    try {
      const h = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${HOJA_SEGUROS}!1:1` }))
      headers = (h.data.values?.[0] || []).map(x => String(x).trim())
    } catch (e) { /* la solapa no existe */ }
    const faltan = ['Fecha pedido', 'N° Presupuesto', 'Persona'].filter(c => !headers.includes(c))
    if (faltan.length) return res.status(400).json({ error: `Falta la solapa ${HOJA_SEGUROS} (o sus columnas ${faltan.join(', ')}). Hay que crearla con scripts/seguros-setup.mjs --escribir antes de pedir seguros desde la app.` })

    // 2) Los adjuntos de un pedido anterior se bajan de Drive. Si uno no se puede bajar, el mail no sale
    //    (mejor que salga sin el PDF que el cliente pidió y nadie se entere).
    const attachments = nuevos.map(a => ({ filename: a.nombre, content: a.content, contentType: a.tipo }))
    if (viejos.length) {
      const drive = getDrive()
      for (const v of viejos) {
        try {
          const meta = await withSheetsRetry(() => drive.files.get({ fileId: v.id, fields: 'name,mimeType,size,webViewLink', supportsAllDrives: true }))
          const bin = await withSheetsRetry(() => drive.files.get({ fileId: v.id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' }))
          v.nombre = meta.data.name || v.nombre; v.link = meta.data.webViewLink || v.link
          attachments.push({ filename: v.nombre, content: Buffer.from(bin.data), contentType: meta.data.mimeType || 'application/octet-stream' })
        } catch (e) { return res.status(400).json({ error: `No pude bajar de Drive "${v.nombre}" para adjuntarlo (${e.message}). Sacalo o subilo de nuevo.` }) }
      }
    }

    // 3) El mail: primero como la casilla de quien lo manda; si no se puede, desde admin@.
    let envio = null, comoAdmin = ''
    if (/@somosmagma\.com$/i.test(mail)) {
      try { envio = await mandarComo(mail, { to: dest, cc: copias, subject: asunto, text: cuerpo, attachments }) }
      catch (e) { comoAdmin = e.message; console.warn('seguro-pedir: no pude mandar como', mail, '→', e.message) }
    }
    if (!envio) {
      const USER = process.env.MAIL_USER, PASS = process.env.MAIL_APP_PASSWORD
      if (!USER || !PASS) return res.status(503).json({ error: `No pude mandar desde ${mail}${comoAdmin ? ` (${comoAdmin})` : ''} y falta configurar el envío desde admin@ (MAIL_USER y MAIL_APP_PASSWORD).` })
      const transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: USER, pass: PASS.replace(/\s+/g, '') } })
      const ccAdmin = [...copias]; if (mail.toLowerCase() !== USER.toLowerCase() && !ccAdmin.some(c => c.toLowerCase() === mail.toLowerCase())) ccAdmin.push(mail)
      await transporter.sendMail({ from: `Somos Magma <${USER}>`, to: dest.join(', '), cc: ccAdmin.length ? ccAdmin.join(', ') : undefined, replyTo: `${mail}, ${USER}`, subject: asunto, text: cuerpo, attachments })
      envio = { desde: USER }
    }
    let aviso = ''

    // 4) Los archivos nuevos van a Drive (ADMINISTRACION / Seguros / cliente) para volver a usarlos la
    //    próxima vez en el mismo lugar. Best-effort: el mail ya salió.
    const subidos = []
    if (nuevos.length) {
      try {
        const drive = getDrive()
        for (const a of nuevos) subidos.push(await withSheetsRetry(() => subirASeguros(drive, { num, cliente: trabajo.cliente || trabajo.agencia, nombre: a.nombre, tipo: a.tipo, content: a.content })))
      } catch (e) {
        console.error('seguro-pedir (drive):', e.message)
        aviso = `El mail salió con los adjuntos, pero no pude guardarlos en Drive (${e.message}): la próxima vez habrá que subirlos de nuevo.`
      }
    }
    const adjuntosFila = formatAdjuntos([...subidos, ...viejos])

    // 5) El registro: una fila por persona, cada dato en la columna que lleva su título.
    //    La fecha es la de Argentina (el servidor corre en UTC: a las 22 hs ya sería "mañana").
    //    Se escribe RAW: con USER_ENTERED el sheet convertía "8/10/2026" y "25/10/1994" en números de
    //    serie (46303, 34632) y la app los mostraba así (08/10/2026).
    const ar = new Date(Date.now() - 3 * 3600e3)
    const hoy = `${ar.getUTCDate()}/${ar.getUTCMonth() + 1}/${ar.getUTCFullYear()}`
    const fila = p => {
      const dato = {
        'Fecha pedido': hoy, 'N° Presupuesto': String(num).trim(), 'Fecha evento': texto(trabajo.fechaEvento), 'Vigencia': texto(vigencia),
        'Cliente': texto(trabajo.cliente), 'Agencia': texto(trabajo.agencia), 'Proyecto': texto(trabajo.proyecto), 'Lugar': texto(trabajo.lugar),
        'Persona': texto(p.nombre), 'DNI': texto(p.dni), 'Nacimiento': texto(p.nacimiento), 'Nacionalidad': texto(p.nacionalidad),
        'Requisitos': texto(requisitos), 'Enviado a': texto(dest.join(', ')), 'Enviado por': texto(mail), 'Desde': texto(envio.desde), 'Certificado': '', 'Notas': '',
        'Adjuntos': adjuntosFila,
        // Con esto se encuentra la respuesta de Álvaro (el certificado) sin confundirla con otro pedido
        'Asunto': texto(asunto), 'Hilo': envio.threadId || '',
      }
      return headers.map(h => (h in dato ? dato[h] : ''))
    }
    try {
      await withSheetsRetry(() => sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: `${HOJA_SEGUROS}!A:${colLetra(headers.length - 1)}`,
        valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
        requestBody: { values: lista.map(fila) },
      }))
    } catch (e) {
      console.error('seguro-pedir (registro):', e)
      aviso = (aviso ? aviso + ' · ' : '') + `El mail salió, pero no pude anotarlo en ${HOJA_SEGUROS}: ${e.message}`
    }

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'seguro-pedido', HOJA_SEGUROS, String(num).trim(), `${lista.length} ${lista.length === 1 ? 'persona' : 'personas'} (${lista.map(p => String(p.nombre).trim()).join(', ')}) · ${vigencia} · a: ${dest.join(', ')} · desde ${envio.desde}${attachments.length ? ` · ${attachments.length} adjuntos` : ''}${aviso ? ' · AVISO: ' + aviso : ''}`.slice(0, 900)]] },
      })
    } catch (e) {}

    res.json({ ok: true, enviadoA: dest, cc: copias, desde: envio.desde, filas: lista.length, adjuntos: attachments.length, aviso })
  } catch (e) {
    console.error('seguro-pedir:', e)
    const msg = /invalid login|username and password|BadCredentials/i.test(e.message)
      ? 'Gmail rechazó el usuario/contraseña. Revisá que MAIL_APP_PASSWORD sea una contraseña de aplicación válida de admin@somosmagma.com (con 2FA activado).'
      : e.message
    res.status(500).json({ error: msg })
  }
}
