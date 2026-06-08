import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { num, cambios, propagarPresupuesto } = req.body
  if (!num || !cambios) return res.status(400).json({ error: 'Falta num o cambios' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:CZ' })
    const headers = r.data.values[0]
    const rows = r.data.values
    const colN = headers.indexOf('N° presupuesto')

    let filaTarget = -1
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][colN]||'').trim() === String(num).trim()) { filaTarget = i + 1; break }
    }
    if (filaTarget === -1) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const updates = []
    // Si viene Fecha Evento nueva, recalcular el "Mes" (col A) también
    if (cambios['Fecha Evento']) {
      const parts = String(cambios['Fecha Evento']).split('/')
      if (parts.length >= 2) {
        const mesNum = parseInt(parts[1])
        if (mesNum >= 1 && mesNum <= 12) {
          const mesStr = String(mesNum).padStart(2,'0') + ' - ' + MESES[mesNum-1]
          updates.push({ range: `PROYECTOS!A${filaTarget}`, values: [[mesStr]] })
        }
      }
    }
    Object.entries(cambios).forEach(([campo, valor]) => {
      const idx = headers.indexOf(campo)
      if (idx === -1) return
      updates.push({ range: `PROYECTOS!${colLetra(idx)}${filaTarget}`, values: [[valor]] })
    })

    if (updates.length === 0) return res.json({ ok: true, msg: 'Nada para actualizar' })

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
    })

    // Propagar a PRESUPUESTOS (Fecha Evento, Cliente, Proyecto, Agencia, PM)
    let propagado = false
    if (propagarPresupuesto !== false) {
      // Leer headers (col 47/48 incluidas) + col A para buscar fila
      const [rHead, rColA] = await Promise.all([
        sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A1:AX1' }),
        sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:A' }),
      ])
      const presHeaders = rHead.data.values?.[0] || []
      const presRows = rColA.data.values || []
      let filaPres = -1
      for (let i = 1; i < presRows.length; i++) {
        if (String(presRows[i][0]||'').trim() === String(num).trim()) { filaPres = i + 1; break }
      }
      if (filaPres > 0) {
        const propagables = ['Fecha Evento','Cliente','Proyecto','Agencia','PM Interno','Contacto','Tipo Fechas','Fechas Adicionales','Cant. Fechas']
        const updPres = []
        propagables.forEach(campo => {
          if (cambios[campo] === undefined) return
          const idx = presHeaders.indexOf(campo)
          if (idx !== -1) updPres.push({ range: `PRESUPUESTOS!${colLetra(idx)}${filaPres}`, values: [[cambios[campo]]] })
        })
        if (updPres.length > 0) {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: { valueInputOption: 'USER_ENTERED', data: updPres }
          })
          propagado = true
        }
      }
    }

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'proyecto-editar', 'PROYECTOS', String(num), `campos=${Object.keys(cambios).join(',')}${propagado?' (+presu)':''}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, propagado })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
