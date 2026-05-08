import { getSheets } from '../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

  const { hoja, fila, pagado, fechaPago, cuentaPago, monto, notas } = req.body
  if (!['GASTOS_FIJOS','TARJETAS','PRESTAMOS'].includes(hoja)) return res.status(400).json({ error: 'Hoja invalida' })
  if (!fila) return res.status(400).json({ error: 'Falta fila' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${hoja}!1:1` })
    const headers = r.data.values?.[0] || []
    const H = name => headers.indexOf(name)

    const updates = []
    if (pagado !== undefined && H('Pagado') !== -1) updates.push({ range: `${hoja}!${colLetra(H('Pagado'))}${fila}`, values: [[pagado ? 'SI' : 'NO']] })
    if (fechaPago !== undefined && H('Fecha pago') !== -1) updates.push({ range: `${hoja}!${colLetra(H('Fecha pago'))}${fila}`, values: [[fechaPago]] })
    if (cuentaPago !== undefined && H('Cuenta pago') !== -1) updates.push({ range: `${hoja}!${colLetra(H('Cuenta pago'))}${fila}`, values: [[cuentaPago]] })
    if (monto !== undefined && H('Monto') !== -1) updates.push({ range: `${hoja}!${colLetra(H('Monto'))}${fila}`, values: [[monto]] })
    if (monto !== undefined && H('Monto cuota') !== -1) updates.push({ range: `${hoja}!${colLetra(H('Monto cuota'))}${fila}`, values: [[monto]] })
    if (notas !== undefined) {
      const idxN = H('Notas') !== -1 ? H('Notas') : H('Observacion')
      if (idxN !== -1) updates.push({ range: `${hoja}!${colLetra(idxN)}${fila}`, values: [[notas]] })
    }

    if (updates.length === 0) return res.json({ ok: true, msg: 'sin cambios' })

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
    })

    // Si se marca pagado y hay cuenta pago + monto, restar de CUENTAS
    if (pagado && cuentaPago && monto > 0) {
      try {
        const rC = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CUENTAS!A:H' })
        const cuentasRows = rC.data.values || []
        const ch = cuentasRows[0] || []
        const iN = ch.indexOf('Nombre'), iS = ch.indexOf('Saldo actual'), iF = ch.indexOf('Última actualización')
        const idx = cuentasRows.findIndex((r, i) => i > 0 && String(r[iN] || '').trim() === String(cuentaPago).trim())
        if (idx > 0) {
          const saldo = parseFloat(String(cuentasRows[idx][iS] || '0').replace(/[^\d.-]/g, '')) || 0
          const nuevo = saldo - Number(monto)
          const d = new Date()
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: { valueInputOption: 'USER_ENTERED', data: [
              { range: `CUENTAS!${colLetra(iS)}${idx+1}`, values: [[nuevo]] },
              { range: `CUENTAS!${colLetra(iF)}${idx+1}`, values: [[`${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`]] },
            ]},
          })
        }
      } catch (e) { console.error('Error actualizando cuenta:', e) }
    }

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'egreso-toggle', hoja, String(fila), `pagado=${pagado} monto=${monto||''} cuenta=${cuentaPago||''}`]] },
      })
    } catch (e) {}

    res.json({ ok: true })
  } catch(e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
