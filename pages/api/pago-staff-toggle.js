import { getSheets } from '../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']
const colLetra = col => { let s='',c=col+1; while(c>0){c--;s=String.fromCharCode(65+(c%26))+s;c=Math.floor(c/26);} return s }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

  const { mes, persona, monto, pagado, cuenta, fechaPago } = req.body || {}
  if (!mes || !persona) return res.status(400).json({ error: 'Faltan mes o persona' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PAGOS_STAFF!A:L' })
    const rows = r.data.values || []
    const headers = rows[0] || []
    const iMes = headers.findIndex(h=>String(h||'').toLowerCase().includes('mes'))
    const iPersona = headers.findIndex(h=>String(h||'').toLowerCase().includes('persona') || String(h||'').toLowerCase().includes('nombre') || String(h||'').toLowerCase().includes('staff'))
    const iMonto = headers.findIndex(h=>String(h||'').toLowerCase().includes('monto') || String(h||'').toLowerCase().includes('total'))
    let iPag = headers.findIndex(h=>String(h||'').toLowerCase().includes('pagado'))
    let iCuenta = headers.findIndex(h=>String(h||'').toLowerCase().includes('cuenta'))
    let iFechaPago = headers.findIndex(h=>String(h||'').toLowerCase().includes('fecha') && String(h||'').toLowerCase().includes('pag'))

    // Si faltan columnas, usar últimas disponibles (J=9, K=10, L=11)
    if (iPag < 0) iPag = 9
    if (iCuenta < 0) iCuenta = 10
    if (iFechaPago < 0) iFechaPago = 11

    // Buscar fila por mes + persona
    let rowIdx = rows.findIndex((r, i) => i > 0 &&
      String(r[iMes]||'').trim() === String(mes).trim() &&
      String(r[iPersona]||'').trim() === String(persona).trim()
    )

    const now = new Date()
    const fechaStr = fechaPago || (now.getDate()+'/'+(now.getMonth()+1)+'/'+now.getFullYear())

    if (rowIdx > 0) {
      const sheetRow = rowIdx + 1
      const updates = [
        { range: `PAGOS_STAFF!${colLetra(iPag)}${sheetRow}`, values: [[pagado?'SÍ':'NO']] },
        { range: `PAGOS_STAFF!${colLetra(iCuenta)}${sheetRow}`, values: [[cuenta||'']] },
        { range: `PAGOS_STAFF!${colLetra(iFechaPago)}${sheetRow}`, values: [[pagado?fechaStr:'']] },
      ]
      await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates } })
    } else {
      // Append si no existe la fila
      const newRow = new Array(12).fill('')
      newRow[iMes] = mes
      newRow[iPersona] = persona
      if (iMonto >= 0) newRow[iMonto] = Number(monto)||0
      newRow[iPag] = pagado?'SÍ':'NO'
      newRow[iCuenta] = cuenta||''
      newRow[iFechaPago] = pagado?fechaStr:''
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'PAGOS_STAFF!A:L',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [newRow] },
      })
    }

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, pagado?'pago-staff-marcado':'pago-staff-desmarcado', 'PAGOS_STAFF', `${mes} ${persona}`, `cuenta=${cuenta||'-'} monto=${monto||'-'}`]] },
      })
    } catch (e) {}

    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
