import nodemailer from 'nodemailer'
import { getSheets, withSheetsRetry } from '../../../../lib/sheets'
import { calcularBrief } from '../../../../lib/brief.mjs'
import { horaArgentina, recalcularDias, armarMail, asegurarSolapa, leerDiaria, yaEnviado, ultimoContador, filaDiaria, escribirFila } from '../../../../lib/diaria-mail.mjs'

// La diaria mandada desde Vercel: sale a las 8:10 y a las 15:10 aunque la Mac de Juan esté cerrada.
// (El 18/09/2026 el mail de las 8 no llegó: la Mac dormía, corrió el script sin red y falló.)
//
//   /api/cron/diaria/manana  → cron 11:10 UTC = 8:10 de Buenos Aires
//   /api/cron/diaria/tarde   → cron 18:10 UTC = 15:10 de Buenos Aires      (los dos en vercel.json)
//
// La Mac sigue corriendo a las 8:00 y 15:00 (scripts/diaria.mjs) porque es la única que puede leer el mail de Diego.
// Si ella ya mandó el aviso de hoy, acá no se manda nada: lo dice la columna "Mail" de la solapa DIARIA.
// Si no lo mandó, sale desde acá con el brief calculado en vivo y la última lectura del contador que haya guardada.
//
// No pasa por el login de la app (middleware.js lo deja pasar): lo protege CRON_SECRET, que Vercel manda solo
// en el header Authorization de cada cron.
//   ?dry=1 → calcula todo y devuelve qué haría, sin mandar mail ni escribir el sheet.

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  const secreto = process.env.CRON_SECRET
  if (!secreto) return res.status(503).json({ error: 'Falta la variable CRON_SECRET en Vercel: sin eso cualquiera con el link podría disparar el mail.' })
  if (req.headers.authorization !== `Bearer ${secreto}`) return res.status(401).json({ error: 'No autorizado' })

  const dry = req.query.dry === '1'
  const ahoraAR = horaArgentina()
  const pedido = String(req.query.aviso || '').toLowerCase()
  const tarde = pedido === 'tarde' || (pedido !== 'manana' && ahoraAR.getHours() >= 12)
  const aviso = tarde ? 'tarde' : 'mañana'
  const para = process.env.DIARIA_TO || 'juan@somosmagma.com'

  try {
    const { sheets, SHEET_ID } = await getSheets()
    if (!dry) await withSheetsRetry(() => asegurarSolapa(sheets, SHEET_ID))

    let filas = []
    try { filas = await withSheetsRetry(() => leerDiaria(sheets, SHEET_ID)) } catch (e) { /* sin columna N o sin solapa todavía: se toma como "nadie mandó nada" */ }
    const quien = yaEnviado(filas, ahoraAR, aviso)
    if (quien) return res.json({ ok: true, enviado: false, motivo: `El aviso de la ${aviso} de hoy ya lo mandó ${quien}.` })

    const r = await withSheetsRetry(() => sheets.spreadsheets.values.batchGet({
      spreadsheetId: SHEET_ID,
      ranges: ['PRESUPUESTOS', 'PROYECTOS', 'FACTURACION', 'RRHH'],
      valueRenderOption: 'FORMATTED_VALUE',
    }))
    const [PRE, PRO, FAC, RH] = r.data.valueRanges.map(v => v.values || [])
    const brief = calcularBrief({ PRE, PRO, FAC, RH }, ahoraAR)

    const ult = ultimoContador(filas)
    const contador = ult ? recalcularDias(ult.contador, ahoraAR) : null
    const link = `${process.env.DIARIA_APP_URL || 'https://somos-magma-app.vercel.app'}/diaria`
    const { subject, texto, html } = armarMail({ brief, contador, tarde, ahoraAR, link, origen: 'Vercel (la Mac no lo había mandado)', contadorLeido: ult?.leido || '' })

    if (dry) return res.json({ ok: true, dry: true, enviaria: true, aviso, para, subject, contadorLeido: ult?.leido || null, alertas: brief.alertas, html })

    const USER = process.env.MAIL_USER, PASS = process.env.MAIL_APP_PASSWORD
    if (!USER || !PASS) return res.status(503).json({ error: 'Faltan MAIL_USER / MAIL_APP_PASSWORD en Vercel.' })
    const t = nodemailer.createTransport({ service: 'gmail', auth: { user: USER, pass: PASS } })
    let mail = 'Vercel', fallo = null
    try { await t.sendMail({ from: `Somos Magma <${USER}>`, to: para, subject, text: texto, html }) }
    catch (e) { fallo = e.message; mail = `falló en Vercel: ${e.message}`.slice(0, 200) }

    // Regla de oro #1: quede enviado o no, queda anotado en el sheet
    await withSheetsRetry(() => escribirFila(sheets, SHEET_ID, filaDiaria({ brief, contador, contadorLeidoAhora: false, aviso, ahoraAR, mail })))
    if (fallo) return res.status(502).json({ error: `No se pudo mandar el mail: ${fallo}` })
    res.json({ ok: true, enviado: true, aviso, para, subject })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
