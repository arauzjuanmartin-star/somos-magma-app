import { getSheets } from '../../lib/sheets'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { nroPresupuesto, cobrado, fechaCobro, retenciones } = req.body
  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:U' })
    const rows = r.data.values
    const headers = rows[0]
    const colPresu = headers.indexOf('N° Presupuesto')
    const colCobrado = headers.indexOf('Cobrado')
    const colFecha = headers.indexOf('Fecha cobro')
    const colRet = headers.indexOf('Retenciones')
    let rowIndex = -1
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][colPresu]) === String(nroPresupuesto)) { rowIndex = i + 1; break }
    }
    if (rowIndex === -1) return res.status(404).json({ error: 'No encontrado' })
    const colLetra = col => { let s='',c=col+1; while(c>0){c--;s=String.fromCharCode(65+(c%26))+s;c=Math.floor(c/26);} return s }
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: [
        { range: 'FACTURACION!'+colLetra(colCobrado)+rowIndex, values: [[cobrado]] },
        { range: 'FACTURACION!'+colLetra(colFecha)+rowIndex, values: [[fechaCobro||'']] },
        { range: 'FACTURACION!'+colLetra(colRet)+rowIndex, values: [[retenciones||0]] },
      ]}
    })
    res.json({ ok: true })
  } catch(e) { res.status(500).json({ error: e.message }) }
}
