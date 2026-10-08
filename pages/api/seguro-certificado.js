// El certificado que devuelve La Segunda (PDF "Certificado Cobertura AP - Somos Magma - fecha")
// queda pegado al pedido: en Drive (ADMINISTRACION / Seguros / cliente) y linkeado en la columna
// "Certificado" de las filas de ese pedido en SEGUROS. Dos formas:
//   modo 'mail'    → lo busca solo en la casilla desde la que salió el pedido (misma delegación
//                    que el envío): el último mail del productor con un PDF adjunto, después del
//                    pedido. Es lo normal: Álvaro contesta en el hilo con el PDF.
//   modo 'archivo' → lo sube quien lo tiene (base64), por si llegó por otro lado.
import { google } from 'googleapis'
import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { HOJA_SEGUROS, BROKER_MAILS } from '../../lib/seguros'
import { getDrive, subirASeguros, nombreLimpio } from '../../lib/seguros-drive'

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const parseAR = s => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (!m) return null; let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]) }

// El último PDF que mandó el productor a esa casilla después de la fecha del pedido
async function buscarEnMail(casilla, desde) {
  const gmail = google.gmail({ version: 'v1', auth: new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
    scopes: ['https://www.googleapis.com/auth/gmail.modify'], clientOptions: { subject: casilla },
  }) })
  const remitentes = BROKER_MAILS.map(m => m.toLowerCase())
  const dominio = 'lasegunda.com.ar'
  const q = `(${remitentes.map(m => `from:${m}`).join(' OR ')} OR from:${dominio}) has:attachment filename:pdf newer_than:60d`
  const l = await gmail.users.messages.list({ userId: 'me', q, maxResults: 15 })
  const cab = (msg, n) => (msg.payload?.headers || []).find(h => h.name.toLowerCase() === n.toLowerCase())?.value || ''
  const partes = []; const recorrer = p => { if (p?.filename && p.body?.attachmentId) partes.push(p); (p?.parts || []).forEach(recorrer) }
  for (const m of l.data.messages || []) {
    const msg = (await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' })).data
    const fecha = new Date(Number(msg.internalDate || 0))
    if (desde && fecha < desde) continue
    const from = cab(msg, 'From').toLowerCase()
    if (!remitentes.some(r => from.includes(r)) && !from.includes(dominio)) continue
    if (/noresponder|no-reply|noreply|envios/.test(from)) continue   // los automáticos de la aseguradora no son el certificado
    partes.length = 0; recorrer(msg.payload)
    const pdf = partes.find(p => /certificado/i.test(p.filename) && /\.pdf$/i.test(p.filename)) || partes.find(p => /\.pdf$/i.test(p.filename))
    if (!pdf) continue
    const att = (await gmail.users.messages.attachments.get({ userId: 'me', messageId: m.id, id: pdf.body.attachmentId })).data
    return { nombre: pdf.filename, tipo: pdf.mimeType || 'application/pdf', content: Buffer.from(att.data, 'base64url'), asunto: cab(msg, 'Subject'), de: cab(msg, 'From'), fecha }
  }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail
  const { num, modo = 'mail', nombre, tipo, base64 } = req.body || {}
  if (!String(num || '').trim()) return res.status(400).json({ error: 'Falta el N° del trabajo' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    // 1) Las filas del último pedido de ese trabajo
    const r = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${HOJA_SEGUROS}!A:Z` }))
    const rows = r.data.values || [], H = (rows[0] || []).map(x => String(x).trim())
    const iNum = H.indexOf('N° Presupuesto'), iFecha = H.indexOf('Fecha pedido'), iCert = H.indexOf('Certificado'), iDesde = H.indexOf('Desde'), iCli = H.indexOf('Cliente'), iAg = H.indexOf('Agencia')
    if (iNum < 0 || iCert < 0) return res.status(400).json({ error: `La solapa ${HOJA_SEGUROS} no tiene las columnas que hacen falta (N° Presupuesto, Certificado).` })
    const mias = rows.map((row, i) => ({ row, i })).filter(({ row, i }) => i > 0 && String(row[iNum] || '').trim() === String(num).trim())
    if (!mias.length) return res.status(404).json({ error: `Para el #${num} no hay ningún pedido de seguro anotado.` })
    const ultima = mias[mias.length - 1]
    const fechaPedido = iFecha > -1 ? String(ultima.row[iFecha] || '').trim() : ''
    const delPedido = mias.filter(({ row }) => iFecha < 0 || String(row[iFecha] || '').trim() === fechaPedido)
    const cliente = String(ultima.row[iCli] || ultima.row[iAg] || '').trim()

    // 2) El PDF: del mail o del que subieron
    let archivo = null, origen = ''
    if (modo === 'archivo') {
      if (!base64 || !nombre) return res.status(400).json({ error: 'Falta el archivo' })
      archivo = { nombre: nombreLimpio(nombre), tipo: String(tipo || 'application/pdf'), content: Buffer.from(String(base64), 'base64') }
      origen = 'subido a mano'
    } else {
      const casilla = (iDesde > -1 && /@somosmagma\.com$/i.test(String(ultima.row[iDesde] || ''))) ? String(ultima.row[iDesde]).trim().toLowerCase() : (/@somosmagma\.com$/i.test(mail) ? mail : '')
      if (!casilla) return res.status(400).json({ error: 'No sé en qué casilla buscar la respuesta. Subí el PDF a mano.' })
      const d = parseAR(fechaPedido); if (d) d.setHours(0, 0, 0, 0)
      archivo = await buscarEnMail(casilla, d)
      if (!archivo) return res.status(404).json({ error: `En ${casilla} todavía no hay una respuesta del productor con un PDF después del ${fechaPedido || 'pedido'}. Cuando llegue, volvé a tocar; o subilo a mano.` })
      origen = `del mail "${archivo.asunto}" (${archivo.de})`
    }

    // 3) A Drive y 4) el link en las filas del pedido
    const subido = await withSheetsRetry(() => subirASeguros(getDrive(), { num, cliente, nombre: archivo.nombre, tipo: archivo.tipo, content: archivo.content }))
    await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED',
      data: delPedido.map(({ i }) => ({ range: `${HOJA_SEGUROS}!${colLetra(iCert)}${i + 1}`, values: [[subido.link]] })) } }))
    try {
      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'seguro-certificado', HOJA_SEGUROS, String(num).trim(), `${subido.nombre} · ${origen} · ${delPedido.length} filas`.slice(0, 900)]] } })
    } catch (e) {}
    res.json({ ok: true, link: subido.link, nombre: subido.nombre, origen, filas: delPedido.length })
  } catch (e) {
    console.error('seguro-certificado:', e)
    res.status(500).json({ error: e.message })
  }
}
