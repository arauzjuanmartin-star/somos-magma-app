import { getSheets } from '../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

const colLetra = col => { let s='',c=col+1; while(c>0){c--;s=String.fromCharCode(65+(c%26))+s;c=Math.floor(c/26);} return s }
const num = v => parseFloat(String(v||'0').replace(/[^\d.-]/g,''))||0

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

  const {
    nroPresupuesto,
    tipoCobro = 'total',         // 'adelanto' | 'parcial' | 'total'
    monto,                       // monto facturado que se cobra en este evento
    cuentaDestino,
    formaPago,
    retGanancias = 0,
    retIIBB = 0,
    retIVA = 0,
    comision = 0,
    fechaCobro,
    reservarIVA,
    alicuotaIVA = 0.21,
    porcentajeAdelanto,          // sólo si tipoCobro='adelanto' (30, 50, etc)
    notas = '',
  } = req.body

  if (!nroPresupuesto) return res.status(400).json({ error: 'Falta nroPresupuesto' })

  try {
    const { sheets, SHEET_ID } = await getSheets()

    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A1:AG500' })
    const rows = r.data.values || []
    const headers = rows[0] || []
    const H = name => headers.indexOf(name)
    const idx = {
      presu: H('N° Presupuesto'),
      cob30: H('Cobrado 30%'),
      cob50: H('Cobrado 50%'),
      cobrado: H('Cobrado'),
      fechaCobro: H('Fecha cobro'),
      neto: H('Precio SIN IVA'),
      iva: H('IVA'),
      precioFinal: H('Precio FINAL'),
      tipoFactura: H('Tipo de Factura'),
      cliente: H('Cliente'),
      ret: H('Retenciones'),
      cuenta: H('Cuenta destino'),
      forma: H('Forma de pago'),
      retG: H('Ret. Ganancias'),
      retI: H('Ret. IIBB'),
      retV: H('Ret. IVA'),
      com: H('Comision banco'),
      montoCob: H('Monto cobrado'),
    }
    if (idx.presu === -1 || idx.montoCob === -1) {
      return res.status(500).json({ error: 'FACTURACION sin columnas requeridas. Falta correr setup-cobros.' })
    }

    let rowIndex = -1, facturaRow = null
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][idx.presu]) === String(nroPresupuesto)) { rowIndex = i + 1; facturaRow = rows[i]; break }
    }
    if (rowIndex === -1) return res.status(404).json({ error: 'Factura no encontrada' })

    // Bloquear cobros duplicados a facturas ya marcadas como cobradas
    const yaCobradaTotal = String(facturaRow[idx.cobrado] || '').toUpperCase() === 'TRUE'
    if (yaCobradaTotal) {
      return res.status(409).json({ error: 'Esta factura ya está marcada como cobrada. Si necesitás corregir, editá manualmente.' })
    }

    const precioFinal = num(facturaRow[idx.precioFinal])
    const montoCobradoActual = num(facturaRow[idx.montoCob])
    const montoEvento = num(monto) || (tipoCobro === 'total' ? precioFinal - montoCobradoActual : 0)
    const nuevoAcumulado = montoCobradoActual + montoEvento
    const llegoACuenta = montoEvento - num(retGanancias) - num(retIIBB) - num(retIVA) - num(comision)

    // Determinar si la factura quedó completamente cobrada
    const tolerancia = 1
    const completa = tipoCobro === 'total' || nuevoAcumulado >= (precioFinal - tolerancia)
    const fechaParaCobrado = completa ? (fechaCobro || hoy()) : ''

    // Sumar retenciones totales a la columna existente
    const retTotal = num(retGanancias) + num(retIIBB) + num(retIVA) + num(comision)
    const retActual = num(facturaRow[idx.ret])

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
      if (Number(porcentajeAdelanto) <= 35 && idx.cob30 !== -1) {
        updates.push({ range: `FACTURACION!${colLetra(idx.cob30)}${rowIndex}`, values: [[true]] })
      } else if (Number(porcentajeAdelanto) <= 60 && idx.cob50 !== -1) {
        updates.push({ range: `FACTURACION!${colLetra(idx.cob50)}${rowIndex}`, values: [[true]] })
      }
    }
    if (completa) {
      if (idx.cobrado !== -1) updates.push({ range: `FACTURACION!${colLetra(idx.cobrado)}${rowIndex}`, values: [[true]] })
      if (idx.fechaCobro !== -1) updates.push({ range: `FACTURACION!${colLetra(idx.fechaCobro)}${rowIndex}`, values: [[fechaParaCobrado]] })
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
    })

    // Sumar a cuenta destino el "llegó a la cuenta" (montoEvento - retenciones - comisión)
    let nuevoSaldo = null
    if (cuentaDestino && llegoACuenta > 0) {
      try {
        const rC = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CUENTAS!A:H' })
        const cuentasRows = rC.data.values || []
        const ch = cuentasRows[0] || []
        const iNombre = ch.indexOf('Nombre')
        const iSaldo = ch.indexOf('Saldo actual')
        const iFechaU = ch.indexOf('Última actualización')
        const idxCuenta = cuentasRows.findIndex((r, i) => i > 0 && String(r[iNombre] || '').trim() === String(cuentaDestino).trim())
        if (idxCuenta > 0) {
          const saldoActual = num(cuentasRows[idxCuenta][iSaldo])
          nuevoSaldo = saldoActual + llegoACuenta
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: { valueInputOption: 'USER_ENTERED', data: [
              { range: `CUENTAS!${colLetra(iSaldo)}${idxCuenta+1}`, values: [[nuevoSaldo]] },
              { range: `CUENTAS!${colLetra(iFechaU)}${idxCuenta+1}`, values: [[hoy()]] },
            ]},
          })
        }
      } catch (e) { console.error('Error actualizando cuenta:', e) }
    }

    // Reserva IVA si factura tipo A y reservarIVA=true
    let reservaCreada = null
    const tipoFactura = String(facturaRow[idx.tipoFactura] || '').toUpperCase()
    if (reservarIVA && tipoFactura === 'A' && cuentaDestino && montoEvento > 0) {
      try {
        const ivaFactura = num(facturaRow[idx.iva])
        const proporcion = precioFinal > 0 ? (montoEvento / precioFinal) : 1
        const montoIVAReserva = Math.round(ivaFactura * proporcion) - num(retIVA)
        if (montoIVAReserva > 0) {
          const cliente = facturaRow[idx.cliente] || ''
          await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'RESERVAS!A:I',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[cuentaDestino, `IVA factura #${nroPresupuesto}`, montoIVAReserva, hoy(), 'IVA', String(nroPresupuesto), 'SÍ', '', `Auto. Cliente: ${cliente}. ${tipoCobro}`]] },
          })
          reservaCreada = { monto: montoIVAReserva, concepto: `IVA factura #${nroPresupuesto}` }
        }
      } catch (e) { console.error('Error creando reserva IVA:', e) }
    }

    // Append a COBROS (historial de eventos)
    try {
      const cliente = facturaRow[idx.cliente] || ''
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'COBROS!A:L',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[
          new Date().toISOString(),
          String(nroPresupuesto),
          cliente,
          tipoCobro + (porcentajeAdelanto ? ` ${porcentajeAdelanto}%` : ''),
          montoEvento,
          cuentaDestino || '',
          formaPago || '',
          num(retGanancias),
          num(retIIBB),
          num(retIVA),
          num(comision),
          notas,
        ]] },
      })
    } catch (e) { console.error('Error append COBROS:', e) }

    // LOG
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'factura-cobro', 'FACTURACION', String(nroPresupuesto), `${tipoCobro} $${montoEvento} cuenta=${cuentaDestino||'-'} llego=${llegoACuenta} acum=${nuevoAcumulado}/${precioFinal} ${completa?'COMPLETA':''}`]] },
      })
    } catch (e) {}

    res.json({
      ok: true,
      tipoCobro,
      montoEvento,
      llegoACuenta,
      acumulado: nuevoAcumulado,
      precioFinal,
      completa,
      nuevoSaldo,
      reservaCreada,
    })
  } catch(e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}

function hoy() {
  const d = new Date()
  return d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear()
}
