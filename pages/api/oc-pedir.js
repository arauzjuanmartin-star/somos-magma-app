// Pedido de orden de compra: el mail con la lista de trabajos hechos que se le manda al cliente
// para que los cargue en SU sistema de cobro. Caso Universidad Austral: no reciben la factura por
// mail; cargan los trabajos en su sistema (ahí nace la orden de compra) y recién entonces ese
// sistema habilita subir la factura. Hasta ahora ese mail se escribía a mano y no quedaba en
// ningún lado qué se había pedido ni cuándo.
//
// Manda el mail desde admin@somosmagma.com (igual que factura-enviar) y deja una fila por trabajo
// en la solapa OC_PEDIDOS: qué se pidió, cuándo, a quién y quién lo mandó.
import nodemailer from 'nodemailer'
import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const HOJA = 'OC_PEDIDOS'
// Un texto que empieza con = + - @ el sheet lo toma como fórmula y deja #ERROR! ("+Conectados").
const texto = v => { const s = String(v ?? '').trim(); return /^[=+\-@]/.test(s) ? `'${s}` : s }
const esMail = s => /^[a-z0-9][^@\s]*@[^@\s]+\.[^@\s]+$/i.test(String(s || '').trim())

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { agencia, to = [], asunto, cuerpo, copiaAMi = true, trabajos = [] } = req.body || {}
  const dest = (Array.isArray(to) ? to : [to]).map(s => String(s || '').trim()).filter(esMail)
  if (!dest.length) return res.status(400).json({ error: 'No hay destinatarios' })
  if (!asunto || !cuerpo) return res.status(400).json({ error: 'Falta asunto o cuerpo' })
  if (!String(agencia || '').trim()) return res.status(400).json({ error: 'Falta la agencia' })
  const lista = (Array.isArray(trabajos) ? trabajos : []).filter(t => t && String(t.presupuestoNum ?? '').trim())
  if (!lista.length) return res.status(400).json({ error: 'No hay trabajos en el pedido' })
  if (lista.length > 60) return res.status(400).json({ error: 'Son demasiados trabajos para un solo pedido (máximo 60)' })

  const USER = process.env.MAIL_USER, PASS = process.env.MAIL_APP_PASSWORD
  if (!USER || !PASS) {
    return res.status(503).json({ error: 'Falta configurar el envío de mail. Cargá MAIL_USER y MAIL_APP_PASSWORD (contraseña de aplicación de admin@somosmagma.com) en las variables de entorno.' })
  }

  try {
    const { sheets, SHEET_ID } = await getSheets()

    // 1) La solapa tiene que estar ANTES de mandar nada: si no hay dónde anotar el pedido, el mail no sale.
    //    (Regla de oro: lo que hace la app queda en el sheet.)
    let headers = []
    try {
      const h = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${HOJA}!1:1` }))
      headers = (h.data.values?.[0] || []).map(x => String(x).trim())
    } catch (e) { /* la solapa no existe */ }
    const faltan = ['Fecha pedido', 'Agencia', 'N° Presupuesto'].filter(c => !headers.includes(c))
    if (faltan.length) return res.status(400).json({ error: `Falta la solapa ${HOJA} (o sus columnas ${faltan.join(', ')}). Hay que crearla con scripts/oc-pedidos-setup.mjs antes de pedir órdenes de compra.` })

    // 2) El mail. La respuesta le llega a quien lo mandó y a administración.
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: USER, pass: PASS.replace(/\s+/g, '') },
    })
    const conCopia = copiaAMi && mail && mail.toLowerCase() !== USER.toLowerCase() && !dest.some(d => d.toLowerCase() === mail.toLowerCase())
    await transporter.sendMail({
      from: `Somos Magma <${USER}>`,
      to: dest.join(', '),
      cc: conCopia ? mail : undefined,
      replyTo: conCopia ? `${mail}, ${USER}` : USER,
      subject: asunto,
      text: cuerpo,
    })

    // 3) El registro: una fila por trabajo, cada dato en la columna que lleva su título.
    //    La fecha es la de Argentina (el servidor corre en UTC: a las 22 hs ya sería "mañana").
    const ar = new Date(Date.now() - 3 * 3600e3)
    const hoy = `${ar.getUTCDate()}/${ar.getUTCMonth() + 1}/${ar.getUTCFullYear()}`
    const fila = t => {
      const dato = {
        'Fecha pedido': hoy, 'Agencia': texto(agencia), 'N° Presupuesto': String(t.presupuestoNum).trim(),
        'Proyecto': texto(t.proyecto), 'Cliente': texto(t.cliente), 'Fecha evento': texto(t.fechaEvento),
        'Monto sin IVA': Math.round(Number(t.monto) || 0), 'OC': t.aparte ? 'Aparte (Comunicación)' : 'General',
        'Enviado a': texto(dest.join(', ')), 'Enviado por': texto(mail), 'N° OC': '', 'Notas': '',
      }
      return headers.map(h => (h in dato ? dato[h] : ''))
    }
    let aviso = ''
    try {
      await withSheetsRetry(() => sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: `${HOJA}!A:${String.fromCharCode(64 + Math.min(headers.length, 26))}`,
        valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
        requestBody: { values: lista.map(fila) },
      }))
    } catch (e) {
      console.error('oc-pedir (registro):', e)
      aviso = `El mail salió, pero no pude anotarlo en ${HOJA}: ${e.message}`
    }

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'oc-pedido', HOJA, texto(agencia), `${lista.length} trabajos (#${lista.map(t => String(t.presupuestoNum).trim()).join(', #')}) a: ${dest.join(', ')}${aviso ? ' · SIN REGISTRO' : ''}`.slice(0, 900)]] },
      })
    } catch (e) {}

    res.json({ ok: true, enviadoA: dest, conCopia: conCopia ? mail : '', filas: aviso ? 0 : lista.length, aviso })
  } catch (e) {
    console.error('oc-pedir:', e)
    const msg = /invalid login|username and password|BadCredentials/i.test(e.message)
      ? 'Gmail rechazó el usuario/contraseña. Revisá que MAIL_APP_PASSWORD sea una contraseña de aplicación válida de admin@somosmagma.com (con 2FA activado).'
      : e.message
    res.status(500).json({ error: msg })
  }
}
