// El certificado que devuelve La Segunda (PDF "Certificado Cobertura AP - Somos Magma - fecha")
// queda pegado al pedido: en Drive (ADMINISTRACION / Seguros / cliente) y linkeado en la columna
// "Certificado" de las filas de ese pedido en SEGUROS. Dos formas:
//   modo 'mail'    → busca LA RESPUESTA A ESE MAIL, no cualquier PDF del productor. Primero en el
//                    hilo de Gmail del pedido (columna Hilo), si no por el asunto (columna Asunto),
//                    y para pedidos viejos sin esas columnas, por el mail enviado al productor
//                    después de la fecha del pedido. Si Álvaro todavía no contestó, dice eso y no
//                    trae nada. El 08/10/2026 la primera versión agarró "el último PDF del productor"
//                    y linkeó al #2367 el certificado del jueves (#2359): nunca más.
//   modo 'archivo' → lo sube quien lo tiene (base64), por si llegó por otro lado.
import { google } from 'googleapis'
import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { HOJA_SEGUROS, BROKER_MAILS, parseFechaSheet, fechaLegible } from '../../lib/seguros'
import { getDrive, subirASeguros, nombreLimpio } from '../../lib/seguros-drive'

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const REMITENTES = BROKER_MAILS.map(m => m.toLowerCase())
const DOMINIO = 'lasegunda.com.ar'
const esProductor = from => (REMITENTES.some(r => from.includes(r)) || from.includes(DOMINIO)) && !/noresponder|no-reply|noreply|envios/.test(from)

// La respuesta del productor con el PDF, dentro del pedido en cuestión.
// Devuelve {archivo} | {sinRespuesta:true, donde} | null (no encontré ni el mail que salió).
async function buscarRespuesta(casilla, { hilo, asunto, desde }) {
  const gmail = google.gmail({ version: 'v1', auth: new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
    scopes: ['https://www.googleapis.com/auth/gmail.modify'], clientOptions: { subject: casilla },
  }) })
  const cab = (msg, n) => (msg.payload?.headers || []).find(h => h.name.toLowerCase() === n.toLowerCase())?.value || ''
  const pdfDe = msg => { const partes = []; const rec = p => { if (p?.filename && p.body?.attachmentId) partes.push(p); (p?.parts || []).forEach(rec) }; rec(msg.payload)
    const pdfs = partes.filter(p => /\.pdf$/i.test(p.filename)); return pdfs.find(p => /certificado/i.test(p.filename)) || pdfs[0] || null }
  const hiloEntero = async id => (await gmail.users.threads.get({ userId: 'me', id, format: 'full' })).data.messages || []

  let mensajes = [], donde = ''
  if (hilo) { mensajes = await hiloEntero(hilo); donde = 'el hilo del pedido' }
  else if (asunto) {
    const l = await gmail.users.messages.list({ userId: 'me', q: `subject:"${String(asunto).replace(/"/g, '')}" newer_than:120d`, maxResults: 20 })
    const ids = [...new Set((l.data.messages || []).map(m => m.threadId))]
    for (const id of ids.slice(0, 3)) mensajes.push(...await hiloEntero(id))
    donde = `el hilo "${asunto}"`
  } else {
    // Pedidos viejos (antes de guardar Asunto e Hilo): el mail que salió al productor después del pedido
    const d = desde || new Date(Date.now() - 60 * 864e5)
    const after = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
    const l = await gmail.users.messages.list({ userId: 'me', q: `in:sent (${REMITENTES.map(m => 'to:' + m).join(' OR ')}) subject:Seguro after:${after}`, maxResults: 10 })
    const ids = [...new Set((l.data.messages || []).map(m => m.threadId))]
    if (!ids.length) return null
    for (const id of ids.slice(0, 3)) mensajes.push(...await hiloEntero(id))
    donde = 'el mail que salió al productor'
  }
  if (!mensajes.length) return null
  const cands = mensajes
    .map(msg => ({ msg, from: cab(msg, 'From').toLowerCase(), fecha: new Date(Number(msg.internalDate || 0)) }))
    .filter(c => esProductor(c.from) && (!desde || c.fecha >= desde))
    .map(c => ({ ...c, pdf: pdfDe(c.msg) })).filter(c => c.pdf)
    .sort((a, b) => b.fecha - a.fecha)
  const elegido = cands.find(c => /certificado/i.test(c.pdf.filename)) || cands[0]
  if (!elegido) return { sinRespuesta: true, donde }
  const att = (await gmail.users.messages.attachments.get({ userId: 'me', messageId: elegido.msg.id, id: elegido.pdf.body.attachmentId })).data
  return { archivo: { nombre: elegido.pdf.filename, tipo: elegido.pdf.mimeType || 'application/pdf', content: Buffer.from(att.data, 'base64url'), asunto: cab(elegido.msg, 'Subject'), de: cab(elegido.msg, 'From'), fecha: elegido.fecha } }
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
    const col = n => H.indexOf(n)
    const iNum = col('N° Presupuesto'), iFecha = col('Fecha pedido'), iCert = col('Certificado'), iDesde = col('Desde'), iCli = col('Cliente'), iAg = col('Agencia'), iAsunto = col('Asunto'), iHilo = col('Hilo')
    if (iNum < 0 || iCert < 0) return res.status(400).json({ error: `La solapa ${HOJA_SEGUROS} no tiene las columnas que hacen falta (N° Presupuesto, Certificado).` })
    const mias = rows.map((row, i) => ({ row, i })).filter(({ row, i }) => i > 0 && String(row[iNum] || '').trim() === String(num).trim())
    if (!mias.length) return res.status(404).json({ error: `Para el #${num} no hay ningún pedido de seguro anotado.` })
    const ultima = mias[mias.length - 1]
    const fechaPedido = iFecha > -1 ? String(ultima.row[iFecha] || '').trim() : ''
    const delPedido = mias.filter(({ row }) => iFecha < 0 || String(row[iFecha] || '').trim() === fechaPedido)
    const cliente = String(ultima.row[iCli] || ultima.row[iAg] || '').trim()

    // 2) El PDF: la respuesta a ese mail, o el que subieron
    let archivo = null, origen = ''
    if (modo === 'archivo') {
      if (!base64 || !nombre) return res.status(400).json({ error: 'Falta el archivo' })
      archivo = { nombre: nombreLimpio(nombre), tipo: String(tipo || 'application/pdf'), content: Buffer.from(String(base64), 'base64') }
      origen = 'subido a mano'
    } else {
      const casilla = (iDesde > -1 && /@somosmagma\.com$/i.test(String(ultima.row[iDesde] || ''))) ? String(ultima.row[iDesde]).trim().toLowerCase() : (/@somosmagma\.com$/i.test(mail) ? mail : '')
      if (!casilla) return res.status(400).json({ error: 'No sé en qué casilla buscar la respuesta. Subí el PDF a mano.' })
      const d = parseFechaSheet(fechaPedido); if (d) d.setHours(0, 0, 0, 0)
      const hilo = iHilo > -1 ? String(ultima.row[iHilo] || '').trim() : '', asunto = iAsunto > -1 ? String(ultima.row[iAsunto] || '').trim() : ''
      const out = await buscarRespuesta(casilla, { hilo, asunto, desde: d })
      if (!out) return res.status(404).json({ error: `En ${casilla} no encontré el mail del pedido del ${fechaLegible(fechaPedido) || '?'} al productor. Subí el PDF a mano.` })
      if (out.sinRespuesta) return res.status(404).json({ error: `Álvaro todavía no contestó ${out.donde} con el PDF (pedido del ${fechaLegible(fechaPedido)}). Cuando llegue, volvé a tocar.` })
      archivo = out.archivo
      origen = `respuesta "${archivo.asunto}" (${archivo.de})`
    }

    // 3) A Drive y 4) el link en las filas del pedido
    const subido = await withSheetsRetry(() => subirASeguros(getDrive(), { num, cliente, nombre: archivo.nombre, tipo: archivo.tipo, content: archivo.content }))
    await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'RAW',
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
