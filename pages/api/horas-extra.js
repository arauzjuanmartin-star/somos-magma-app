// Carga de horas extra desde Edición, en el momento y pegada al trabajo.
//
// Juan, 14/9/2026: "sumemos a cada proyecto Horas Extras, así Dani puede cargar
// ahí si laburó fuera de hora y no esperamos a fin de mes". Una fila por carga
// en la solapa HORAS_EXTRA: quién, cuándo, en qué trabajo, cuántas y por qué.
// A fin de mes se suma por persona; hasta hoy se reconstruía de memoria.
//
// body: { id (fila de EDICION) | num, horas, motivo, fecha (DD/MM/AAAA, opcional), persona (opcional) }
// Quien tiene acceso parcial (Dani) solo carga a su nombre.

import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { canonStaff } from '../../lib/staff'

const HEADERS = ['Fecha','Persona','Mail','N° presupuesto','Cliente','Proyecto','Entregable','ID edición','Horas','Motivo','Cargado por','Cargado el','Mes']
const colLetra = c => { let s='', n=c+1; while(n>0){ n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26) } return s }
const hoyAR = () => { const d = new Date(); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` }
const mesDe = f => { const m = String(f||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2,'0')}` : '' }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { id = '', num = '', horas, motivo = '', fecha = '', persona = '' } = req.body || {}
  const h = parseFloat(String(horas ?? '').replace(',', '.'))
  if (!h || h <= 0 || h > 24) return res.status(400).json({ error: 'Horas: un número entre 0,5 y 24' })
  const fechaOk = /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(fecha).trim()) ? String(fecha).trim() : hoyAR()

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const batch = await sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEET_ID, ranges: ['HORAS_EXTRA!A:M', 'EDICION!A:AM', 'PROYECTOS!A:ET', 'RRHH!A:F'] })
    const [HX, ED, PR, RH] = batch.data.valueRanges.map(v => v.values || [])
    if (!HX.length) return res.status(400).json({ error: 'Falta la solapa HORAS_EXTRA — correr scripts/horas-extra-setup.mjs --escribir' })

    // Quién: el de acceso parcial carga a su nombre; el resto puede elegir.
    const rh = RH[0] || [], iNom = rh.indexOf('Nombre Apellido'), iMail = rh.indexOf('Mail')
    const porMail = new Map(RH.slice(1).map(r => [String(r[iMail] || '').trim().toLowerCase(), String(r[iNom] || '').trim()]))
    let quien = auth.soloLoSuyo || (persona ? canonStaff(persona) : '') || porMail.get(mail.toLowerCase()) || canonStaff(mail.split('@')[0])
    const mailDe = [...porMail.entries()].find(([, n]) => n === quien)?.[0] || (quien === auth.soloLoSuyo ? mail : '')

    // El trabajo: por fila de EDICION o por N° de presupuesto
    let numero = String(num || '').trim(), cliente = '', proyecto = '', entregable = ''
    const hE = ED[0] || []
    const fila = id ? ED.slice(1).find(r => String(r[hE.indexOf('ID')] || '').trim() === String(id).trim()) : null
    if (fila) {
      numero = String(fila[hE.indexOf('N° presupuesto')] || '').trim() || numero
      cliente = String(fila[hE.indexOf('Cliente')] || ''); proyecto = String(fila[hE.indexOf('Proyecto')] || ''); entregable = String(fila[hE.indexOf('Entregable')] || '')
    } else if (numero) {
      const hP = PR[0] || []
      const p = PR.slice(1).find(r => String(r[hP.indexOf('N° presupuesto')] || '').trim() === numero)
      if (p) { cliente = String(p[hP.indexOf('Cliente')] || ''); proyecto = String(p[hP.indexOf('Proyecto')] || '') }
    }

    const row = { 'Fecha': fechaOk, 'Persona': quien, 'Mail': mailDe, 'N° presupuesto': numero, 'Cliente': cliente, 'Proyecto': proyecto, 'Entregable': entregable, 'ID edición': String(id || ''), 'Horas': h, 'Motivo': String(motivo || '').trim(), 'Cargado por': mail, 'Cargado el': new Date().toISOString(), 'Mes': mesDe(fechaOk) }
    const hdr = HX[0]
    const valores = hdr.map(k => row[k] ?? '')
    // Por fila calculada, no append (ver lib/edicion-sync.js: el append corría columnas).
    const desde = HX.length + 1
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties(title,sheetId,gridProperties(rowCount)))' })
    const hoja = meta.data.sheets.find(x => x.properties.title === 'HORAS_EXTRA')
    if (hoja && (hoja.properties.gridProperties?.rowCount || 0) < desde) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{ appendDimension: { sheetId: hoja.properties.sheetId, dimension: 'ROWS', length: 200 } }] } })
    }
    await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `HORAS_EXTRA!A${desde}:${colLetra(hdr.length - 1)}${desde}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [valores] } })
    try {
      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'horas-extra', 'HORAS_EXTRA', numero, `${quien}: ${h} hs el ${fechaOk}${motivo ? ' · ' + motivo : ''}${id ? ' · ' + id : ''}`]] } })
    } catch (e) {}
    res.json({ ok: true, fila: desde, persona: quien, horas: h, fecha: fechaOk })
  } catch (e) {
    console.error('horas-extra:', e)
    res.status(500).json({ error: e.message })
  }
}
