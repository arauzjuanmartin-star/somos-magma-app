import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const colLetra = col => { let s='',c=col+1; while(c>0){c--;s=String.fromCharCode(65+(c%26))+s;c=Math.floor(c/26);} return s }
const num = v => parseFloat(String(v||'0').replace(/[^\d.-]/g,''))||0
const hoy = () => { const d=new Date(); return d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear() }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const {
    nroPresupuesto, tipoCobro = 'total', monto, cuentaDestino, formaPago,
    retGanancias = 0, retIIBB = 0, retIVA = 0, comision = 0,
    fechaCobro, reservarIVA, alicuotaIVA = 0.21, porcentajeAdelanto, notas = '',
    historico = false,  // reconciliación: marca cobrada SIN tocar saldo de cuenta ni reservar IVA
  } = req.body

  if (!nroPresupuesto) return res.status(400).json({ error: 'Falta nroPresupuesto' })

  try {
    const { sheets, SHEET_ID } = await getSheets()

    // PARALELO: leer FACTURACION + CUENTAS al mismo tiempo (con retry)
    const [factR, cuentasR] = await Promise.all([
      withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A1:AG500' })),
      withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CUENTAS!A:H' })),
    ])

    const rows = factR.data.values || []
    const headers = rows[0] || []
    const H = name => headers.indexOf(name)
    const idx = {
      presu: H('N° Presupuesto'), cob30: H('Cobrado 30%'), cob50: H('Cobrado 50%'),
      cobrado: H('Cobrado'), fechaCobro: H('Fecha cobro'),
      neto: H('Precio SIN IVA'), iva: H('IVA'), precioFinal: H('Precio FINAL'),
      tipoFactura: H('Tipo de Factura'), cliente: H('Cliente'), ret: H('Retenciones'),
      cuenta: H('Cuenta destino'), forma: H('Forma de pago'),
      retG: H('Ret. Ganancias'), retI: H('Ret. IIBB'), retV: H('Ret. IVA'),
      com: H('Comision banco'), montoCob: H('Monto cobrado'),
    }
    if (idx.presu === -1 || idx.montoCob === -1) {
      return res.status(500).json({ error: 'FACTURACION sin columnas requeridas. Falta correr setup-cobros.' })
    }

    let rowIndex = -1, facturaRow = null
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][idx.presu]) === String(nroPresupuesto)) { rowIndex = i + 1; facturaRow = rows[i]; break }
    }
    if (rowIndex === -1) return res.status(404).json({ error: 'Factura no encontrada' })

    if (String(facturaRow[idx.cobrado] || '').toUpperCase() === 'TRUE') {
      return res.status(409).json({ error: 'Esta factura ya está marcada como cobrada. Si necesitás corregir, editá manualmente.' })
    }

    const precioFinal = num(facturaRow[idx.precioFinal])
    const montoCobradoActual = num(facturaRow[idx.montoCob])
    const montoEvento = num(monto) || (tipoCobro === 'total' ? precioFinal - montoCobradoActual : 0)
    const nuevoAcumulado = montoCobradoActual + montoEvento
    const llegoACuenta = montoEvento - num(retGanancias) - num(retIIBB) - num(retIVA) - num(comision)

    const tolerancia = 1
    const completa = tipoCobro === 'total' || nuevoAcumulado >= (precioFinal - tolerancia)
    const fechaParaCobrado = completa ? (fechaCobro || hoy()) : ''
    const retTotal = num(retGanancias) + num(retIIBB) + num(retIVA) + num(comision)
    const retActual = num(facturaRow[idx.ret])

    // Construir TODOS los updates en un solo batchUpdate.values
    const updates = [
      { range: `FACTURACION!${colLetra(idx.montoCob)}${rowIndex}`, values: [[nuevoAcumulado]] },
    ]
    if (cuentaDestino && idx.cuenta !== -1) updates.push({ range: `FACTURACION!${colLetra(idx.cuenta)}${rowIndex}`, values: [[cuentaDestino]] })
    if (formaPago && idx.forma !== -1) updates.push({ range: `FACTURACION!${colLetra(idx.forma)}${rowIndex}`, values: [[formaPago]] })
    if (idx.retG !== -1) updates.push({ range: `FACTURACION!${colLetra(idx.retG)}${rowIndex}`, values: [[num(facturaRow[idx.retG]) + num(retGanancias)]] })
    if (idx.retI !== -1) updates.push({ range: `FACTURACION!${colLetra(idx.retI)}${rowIndex}`, values: [[num(facturaRow[idx.retI]) + num(retIIBB)]] })
    if (idx.retV !== -1) updates.push({ range: `FACTURACION!${colLetra(idx.retV)}${rowIndex}`, values: [[num(facturaRow[idx.retV]) + num(retIVA)]] })
    if (idx.com !== -1) updates.push({ range: `FACTURACION!${colLetra(idx.com)}${rowIndex}`, values: [[num(facturaRow[idx.com]) + num(comision)]] })
    if (idx.ret !== -1) updates.push({ range: `FACTURACION!${colLetra(idx.ret)}${rowIndex}`, values: [[retActual + retTotal]] })

    if (tipoCobro === 'adelanto' && porcentajeAdelanto) {
      if (Number(porcentajeAdelanto) <= 35 && idx.cob30 !== -1) updates.push({ range: `FACTURACION!${colLetra(idx.cob30)}${rowIndex}`, values: [[true]] })
      else if (Number(porcentajeAdelanto) <= 60 && idx.cob50 !== -1) updates.push({ range: `FACTURACION!${colLetra(idx.cob50)}${rowIndex}`, values: [[true]] })
    }
    if (completa) {
      if (idx.cobrado !== -1) updates.push({ range: `FACTURACION!${colLetra(idx.cobrado)}${rowIndex}`, values: [[true]] })
      if (idx.fechaCobro !== -1) updates.push({ range: `FACTURACION!${colLetra(idx.fechaCobro)}${rowIndex}`, values: [[fechaParaCobrado]] })
    }

    // Update de CUENTAS (en el mismo batchUpdate). En modo histórico NO se toca el saldo
    // (la plata entró hace meses; solo estamos reconciliando el estado de cobrada).
    let nuevoSaldo = null
    if (!historico && cuentaDestino && llegoACuenta > 0) {
      const cuentasRows = cuentasR.data.values || []
      const ch = cuentasRows[0] || []
      const iNombre = ch.indexOf('Nombre')
      const iSaldo = ch.indexOf('Saldo actual')
      const iFechaU = ch.indexOf('Última actualización')
      const idxCuenta = cuentasRows.findIndex((r, i) => i > 0 && String(r[iNombre] || '').trim() === String(cuentaDestino).trim())
      if (idxCuenta > 0) {
        const saldoActual = num(cuentasRows[idxCuenta][iSaldo])
        nuevoSaldo = saldoActual + llegoACuenta
        updates.push({ range: `CUENTAS!${colLetra(iSaldo)}${idxCuenta+1}`, values: [[nuevoSaldo]] })
        updates.push({ range: `CUENTAS!${colLetra(iFechaU)}${idxCuenta+1}`, values: [[hoy()]] })
      }
    }

    // UN SOLO batchUpdate con todo (FACTURACION + CUENTAS) — con retry
    const batchPromise = withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
    }))

    // En paralelo: appends a RESERVAS, COBROS, LOG (independientes, no esperan al batchUpdate)
    const appendsPromises = []

    // Reserva IVA si corresponde
    let reservaCreada = null
    const tipoFactura = String(facturaRow[idx.tipoFactura] || '').toUpperCase()
    if (!historico && reservarIVA && tipoFactura === 'A' && cuentaDestino && montoEvento > 0) {
      const ivaFactura = num(facturaRow[idx.iva])
      const proporcion = precioFinal > 0 ? (montoEvento / precioFinal) : 1
      const montoIVAReserva = Math.round(ivaFactura * proporcion) - num(retIVA)
      if (montoIVAReserva > 0) {
        const cliente = facturaRow[idx.cliente] || ''
        appendsPromises.push(sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'RESERVAS!A:I',
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [[cuentaDestino, `IVA factura #${nroPresupuesto}`, montoIVAReserva, hoy(), 'IVA', String(nroPresupuesto), 'SÍ', '', `Auto. Cliente: ${cliente}. ${tipoCobro}`]] },
        }))
        reservaCreada = { monto: montoIVAReserva, concepto: `IVA factura #${nroPresupuesto}` }
      }
    }

    // Append a COBROS
    const cliente = facturaRow[idx.cliente] || ''
    appendsPromises.push(sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'COBROS!A:L',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[
        new Date().toISOString(), String(nroPresupuesto), cliente,
        tipoCobro + (porcentajeAdelanto ? ` ${porcentajeAdelanto}%` : ''),
        montoEvento, cuentaDestino || '', formaPago || '',
        num(retGanancias), num(retIIBB), num(retIVA), num(comision), notas,
      ]] },
    }))

    // Append LOG
    appendsPromises.push(sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'LOG!A:F',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[new Date().toISOString(), mail, 'factura-cobro', 'FACTURACION', String(nroPresupuesto), `${tipoCobro} $${montoEvento} cuenta=${cuentaDestino||'-'} llego=${llegoACuenta} acum=${nuevoAcumulado}/${precioFinal} ${completa?'COMPLETA':''}`]] },
    }))

    // Esperar TODO en paralelo (batchUpdate + 2-3 appends)
    await Promise.all([batchPromise, ...appendsPromises])

    res.json({
      ok: true, tipoCobro, montoEvento, llegoACuenta,
      acumulado: nuevoAcumulado, precioFinal, completa,
      nuevoSaldo, reservaCreada,
    })
  } catch(e) {
    console.error('Error cobro:', e)
    const status = e.code || e.response?.status
    if (status === 429) {
      return res.status(429).json({ error: 'Google está limitando los pedidos. Esperá 30 segundos y volvé a marcar el cobro. NO se grabó.' })
    }
    res.status(500).json({ error: e.message })
  }
}
