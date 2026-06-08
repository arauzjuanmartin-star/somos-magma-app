import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { num, tambienPresupuesto, accionPresupuesto } = req.body
  if (!num) return res.status(400).json({ error: 'Falta num' })

  // Compat: si vino `tambienPresupuesto:true` (legacy) → equivale a DESAPROBADO
  let nuevoEstado = null
  if (accionPresupuesto === 'desaprobado') nuevoEstado = 'DESAPROBADO'
  else if (accionPresupuesto === 'represupuestado') nuevoEstado = 'REPRESUPUESTADO'
  else if (tambienPresupuesto) nuevoEstado = 'DESAPROBADO'

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties)' })
    const proySheet = meta.data.sheets.find(s => s.properties.title === 'PROYECTOS')
    if (!proySheet) return res.status(500).json({ error: 'No existe PROYECTOS' })

    // 1. Buscar y borrar fila en PROYECTOS
    const rProy = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:C' })
    const proyRows = rProy.data.values || []
    let proyRowIdx = -1
    for (let i = 1; i < proyRows.length; i++) {
      if (String(proyRows[i][2]) === String(num)) { proyRowIdx = i + 1; break }
    }
    if (proyRowIdx === -1) return res.status(404).json({ error: 'Proyecto no encontrado en PROYECTOS' })

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{
        deleteDimension: { range: { sheetId: proySheet.properties.sheetId, dimension: 'ROWS', startIndex: proyRowIdx-1, endIndex: proyRowIdx } }
      }] }
    })

    // 2. Opcionalmente cambiar estado en PRESUPUESTOS (DESAPROBADO o REPRESUPUESTADO)
    let presuActualizado = false
    if (nuevoEstado) {
      const rPres = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:D' })
      const presRows = rPres.data.values || []
      for (let i = 1; i < presRows.length; i++) {
        if (String(presRows[i][0]) === String(num)) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `PRESUPUESTOS!D${i+1}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[nuevoEstado]] }
          })
          presuActualizado = true
          break
        }
      }
    }

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'proyecto-eliminar', 'PROYECTOS', String(num), `fila ${proyRowIdx} eliminada${nuevoEstado?' + presu→'+nuevoEstado:''}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, presuActualizado })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
