import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const colLetra = col => { let s='',c=col+1; while(c>0){c--;s=String.fromCharCode(65+(c%26))+s;c=Math.floor(c/26);} return s }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { mes, anio, persona, tipo, monto, adelantos, pagado, fechaPago, metodo, observacion } = req.body || {}
  if (!mes || !anio || !persona) return res.status(400).json({ error: 'Faltan mes, anio o persona' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SUELDOS!A:J' })
    const rows = r.data.values || []
    const headers = rows[0] || []
    const iMes = headers.indexOf('Mes'), iAnio = headers.indexOf('Año'), iPersona = headers.indexOf('Persona')
    const iTipo = headers.indexOf('Tipo'), iMonto = headers.indexOf('Monto'), iAdel = headers.indexOf('Adelantos')
    const iPag = headers.indexOf('Pagado'), iFechaPag = headers.indexOf('Fecha pago')
    const iMetodo = headers.indexOf('Método'), iObs = headers.indexOf('Observación')

    // Buscar fila existente por mes+anio+persona+tipo
    const tipoReal = tipo || 'fijo'
    let rowIdx = rows.findIndex((r, i) => i > 0 &&
      String(r[iMes]||'') === String(mes) &&
      String(r[iAnio]||'') === String(anio) &&
      String(r[iPersona]||'').trim() === String(persona).trim() &&
      String(r[iTipo]||'fijo').trim() === tipoReal.trim()
    )

    if (rowIdx > 0) {
      const sheetRow = rowIdx + 1
      const updates = []
      if (monto !== undefined) updates.push({ range: `SUELDOS!${colLetra(iMonto)}${sheetRow}`, values: [[Number(monto)||0]] })
      if (adelantos !== undefined) updates.push({ range: `SUELDOS!${colLetra(iAdel)}${sheetRow}`, values: [[Number(adelantos)||0]] })
      if (pagado !== undefined) updates.push({ range: `SUELDOS!${colLetra(iPag)}${sheetRow}`, values: [[pagado?'SÍ':'NO']] })
      if (fechaPago !== undefined) updates.push({ range: `SUELDOS!${colLetra(iFechaPag)}${sheetRow}`, values: [[fechaPago||'']] })
      if (metodo !== undefined) updates.push({ range: `SUELDOS!${colLetra(iMetodo)}${sheetRow}`, values: [[metodo||'']] })
      if (observacion !== undefined) updates.push({ range: `SUELDOS!${colLetra(iObs)}${sheetRow}`, values: [[observacion||'']] })
      if (updates.length) {
        await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates } })
      }
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'SUELDOS!A:J',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[mes, anio, persona, tipoReal, Number(monto)||0, Number(adelantos)||0, pagado?'SÍ':'NO', fechaPago||'', metodo||'', observacion||'']] },
      })
    }

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, rowIdx>0?'sueldo-update':'sueldo-new', 'SUELDOS', `${mes}/${anio} ${persona}`, `tipo=${tipoReal} monto=${monto}`]] },
      })
    } catch (e) {}

    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
