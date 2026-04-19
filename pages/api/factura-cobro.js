import { getSheets } from '../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

const colLetra = col => { let s='',c=col+1; while(c>0){c--;s=String.fromCharCode(65+(c%26))+s;c=Math.floor(c/26);} return s }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

  const { nroPresupuesto, cobrado, fechaCobro, retenciones, montoReal, cuentaDestino, reservarIVA, alicuotaIVA } = req.body
  try {
    const { sheets, SHEET_ID } = await getSheets()

    // 1. Actualizar factura
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:U' })
    const rows = r.data.values || []
    const headers = rows[0] || []
    const colPresu = headers.indexOf('N° Presupuesto')
    const colCobrado = headers.indexOf('Cobrado')
    const colFecha = headers.indexOf('Fecha cobro')
    const colRet = headers.indexOf('Retenciones')
    const colTipo = headers.indexOf('Tipo')
    const colNeto = headers.indexOf('Precio SIN IVA')
    const colPrecioFinal = headers.indexOf('Precio FINAL')
    const colCliente = headers.indexOf('Cliente')
    let rowIndex = -1, facturaRow = null
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][colPresu]) === String(nroPresupuesto)) { rowIndex = i + 1; facturaRow = rows[i]; break }
    }
    if (rowIndex === -1) return res.status(404).json({ error: 'Factura no encontrada' })

    const updates = [
      { range: 'FACTURACION!'+colLetra(colCobrado)+rowIndex, values: [[cobrado]] },
      { range: 'FACTURACION!'+colLetra(colFecha)+rowIndex, values: [[fechaCobro||'']] },
      { range: 'FACTURACION!'+colLetra(colRet)+rowIndex, values: [[retenciones||0]] },
    ]
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
    })

    // 2. Si hay cuentaDestino y montoReal, sumar al saldo de la cuenta
    let nuevoSaldo = null, reservaCreada = null
    if (cuentaDestino && montoReal && cobrado) {
      try {
        const rC = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CUENTAS!A:H' })
        const cuentasRows = rC.data.values || []
        const ch = cuentasRows[0] || []
        const iNombre = ch.indexOf('Nombre')
        const iSaldo = ch.indexOf('Saldo actual')
        const iFechaU = ch.indexOf('Última actualización')
        const idxCuenta = cuentasRows.findIndex((r, i) => i > 0 && String(r[iNombre] || '').trim() === String(cuentaDestino).trim())
        if (idxCuenta > 0) {
          const saldoActual = parseFloat(String(cuentasRows[idxCuenta][iSaldo] || '0').replace(/[^\d.-]/g, '')) || 0
          nuevoSaldo = saldoActual + Number(montoReal)
          const now = new Date()
          const fechaStr = now.getDate()+'/'+(now.getMonth()+1)+'/'+now.getFullYear()
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: { valueInputOption: 'USER_ENTERED', data: [
              { range: `CUENTAS!${colLetra(iSaldo)}${idxCuenta+1}`, values: [[nuevoSaldo]] },
              { range: `CUENTAS!${colLetra(iFechaU)}${idxCuenta+1}`, values: [[fechaStr]] },
            ]},
          })

          // 3. Si reservarIVA=true y factura tipo A, crear reserva automática
          const tipo = facturaRow ? String(facturaRow[colTipo] || '').toUpperCase() : ''
          if (reservarIVA && tipo === 'A') {
            const alicuota = Number(alicuotaIVA) || 0.21
            const neto = parseFloat(String(facturaRow[colNeto] || '0').replace(/[^\d.-]/g, '')) || 0
            const montoIVA = Math.round(neto * alicuota)
            const cliente = facturaRow[colCliente] || ''
            await sheets.spreadsheets.values.append({
              spreadsheetId: SHEET_ID,
              range: 'RESERVAS!A:I',
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: [[cuentaDestino, `IVA factura #${nroPresupuesto}`, montoIVA, fechaStr, 'IVA', String(nroPresupuesto), 'SÍ', '', `Auto. Cliente: ${cliente}. Alicuota ${Math.round(alicuota*100)}%`]] },
            })
            reservaCreada = { monto: montoIVA, concepto: `IVA factura #${nroPresupuesto}` }
          }
        }
      } catch (e) { console.error('Error actualizando cuenta/reserva:', e) }
    }

    // 4. LOG
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'factura-cobro', 'FACTURACION', String(nroPresupuesto), `real=${montoReal||'-'} cuenta=${cuentaDestino||'-'} ret=${retenciones||0} reservaIVA=${reservaCreada?reservaCreada.monto:'no'}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, nuevoSaldo, reservaCreada })
  } catch(e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
