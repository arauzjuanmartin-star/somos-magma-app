import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { hoja, fila, pagado, fechaPago, cuentaPago, monto, montoParcial, notas, tipoPago } = req.body
  if (!['GASTOS_FIJOS','TARJETAS','PRESTAMOS'].includes(hoja)) return res.status(400).json({ error: 'Hoja invalida' })
  if (!fila) return res.status(400).json({ error: 'Falta fila' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${hoja}!1:1` })
    const headers = r.data.values?.[0] || []
    const H = name => headers.indexOf(name)
    const num = v => parseFloat(String(v||'0').replace(/[^\d.-]/g,''))||0

    // Si es pago parcial, leer fila actual para acumular
    let acumDescuento = 0  // cuanto restar de CUENTAS efectivamente
    let nuevoPagadoFlag = pagado
    let nuevoMontoPagadoAcum = null
    if (tipoPago === 'parcial' && montoParcial > 0) {
      const rRow = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${hoja}!A${fila}:Z${fila}` })
      const row = rRow.data.values?.[0] || []
      const montoTotal = num(row[H('Monto')] || row[H('Monto cuota')])
      const yaPagado = num(row[H('Monto pagado')])
      nuevoMontoPagadoAcum = yaPagado + Number(montoParcial)
      acumDescuento = Number(montoParcial)
      // Si se completó, marcar Pagado=SI
      if (montoTotal > 0 && nuevoMontoPagadoAcum >= montoTotal - 1) {
        nuevoPagadoFlag = true
      }
    } else if (pagado === true) {
      // Pago total: si hay monto pagado previo, descontar solo lo que falta
      const rRow = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${hoja}!A${fila}:Z${fila}` })
      const row = rRow.data.values?.[0] || []
      const montoTotal = num(row[H('Monto')] || row[H('Monto cuota')])
      const yaPagado = num(row[H('Monto pagado')])
      acumDescuento = Math.max(0, montoTotal - yaPagado)
      nuevoMontoPagadoAcum = montoTotal
    }

    const updates = []
    if (nuevoPagadoFlag !== undefined && H('Pagado') !== -1) updates.push({ range: `${hoja}!${colLetra(H('Pagado'))}${fila}`, values: [[nuevoPagadoFlag ? 'SI' : 'NO']] })
    if (fechaPago !== undefined && H('Fecha pago') !== -1) updates.push({ range: `${hoja}!${colLetra(H('Fecha pago'))}${fila}`, values: [[fechaPago]] })
    if (cuentaPago !== undefined && H('Cuenta pago') !== -1) updates.push({ range: `${hoja}!${colLetra(H('Cuenta pago'))}${fila}`, values: [[cuentaPago]] })
    if (monto !== undefined && tipoPago !== 'parcial') {
      const idxM = H('Monto') !== -1 ? H('Monto') : H('Monto cuota')
      if (idxM !== -1) updates.push({ range: `${hoja}!${colLetra(idxM)}${fila}`, values: [[monto]] })
    }
    if (nuevoMontoPagadoAcum !== null && H('Monto pagado') !== -1) updates.push({ range: `${hoja}!${colLetra(H('Monto pagado'))}${fila}`, values: [[nuevoMontoPagadoAcum]] })
    if (notas !== undefined) {
      const idxN = H('Notas') !== -1 ? H('Notas') : H('Observacion')
      if (idxN !== -1) updates.push({ range: `${hoja}!${colLetra(idxN)}${fila}`, values: [[notas]] })
    }

    if (updates.length === 0) return res.json({ ok: true, msg: 'sin cambios' })

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
    })

    // Restar de CUENTAS lo efectivamente pagado en este evento
    if (cuentaPago && acumDescuento > 0) {
      try {
        const rC = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CUENTAS!A:H' })
        const cuentasRows = rC.data.values || []
        const ch = cuentasRows[0] || []
        const iN = ch.indexOf('Nombre'), iS = ch.indexOf('Saldo actual'), iF = ch.indexOf('Última actualización')
        const idx = cuentasRows.findIndex((r, i) => i > 0 && String(r[iN] || '').trim() === String(cuentaPago).trim())
        if (idx > 0) {
          const saldo = parseFloat(String(cuentasRows[idx][iS] || '0').replace(/[^\d.-]/g, '')) || 0
          const nuevo = saldo - acumDescuento
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
        requestBody: { values: [[new Date().toISOString(), mail, 'egreso-toggle', hoja, String(fila), `tipo=${tipoPago||'total'} pagado=${nuevoPagadoFlag} pagoEvento=${acumDescuento} cuenta=${cuentaPago||''} acum=${nuevoMontoPagadoAcum||''}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, completado: nuevoPagadoFlag, pagoEvento: acumDescuento, acumulado: nuevoMontoPagadoAcum })
  } catch(e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
