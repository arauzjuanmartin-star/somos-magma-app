import { getSheets } from '../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

  const { num, tambienPresupuesto } = req.body
  if (!num) return res.status(400).json({ error: 'Falta num' })

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

    // 2. Opcionalmente cambiar estado en PRESUPUESTOS a DESAPROBADO
    let presuActualizado = false
    if (tambienPresupuesto) {
      const rPres = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:D' })
      const presRows = rPres.data.values || []
      for (let i = 1; i < presRows.length; i++) {
        if (String(presRows[i][0]) === String(num)) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `PRESUPUESTOS!D${i+1}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [['DESAPROBADO']] }
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
        requestBody: { values: [[new Date().toISOString(), mail, 'proyecto-eliminar', 'PROYECTOS', String(num), `fila ${proyRowIdx} eliminada${presuActualizado?' + presu→DESAPROBADO':''}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, presuActualizado })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
