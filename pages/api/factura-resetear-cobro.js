// Resetea el estado de cobro de una factura:
// - Limpia Monto cobrado, retenciones, comisión, cuenta destino, forma pago
// - Quita los flags Cobrado 30%, 50%, Cobrado y Fecha cobro
// - Borra entradas en COBROS asociadas (opcionalmente solo las migradas)
// - Revierte el saldo en CUENTAS si tenía cuenta destino y se había sumado
import { getSheets } from '../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']
const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
const num = v => parseFloat(String(v||'0').replace(/[^\d.-]/g,''))||0

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

  const { presupuestoNum, soloMigrados = true, revertirSaldoCuenta = false } = req.body
  if (!presupuestoNum) return res.status(400).json({ error: 'Falta presupuestoNum' })

  try {
    const { sheets, SHEET_ID } = await getSheets()

    // 1. Leer FACTURACION y encontrar la fila
    const factR = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AG' })
    const headers = factR.data.values[0]
    const rows = factR.data.values
    const idxPresu = headers.indexOf('N° Presupuesto')

    let filaTarget = -1, facturaRow = null
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][idxPresu]||'').trim() === String(presupuestoNum).trim()) {
        filaTarget = i + 1
        facturaRow = rows[i]
        break
      }
    }
    if (filaTarget === -1) return res.status(404).json({ error: 'Factura no encontrada' })

    // 2. Updates en FACTURACION para limpiar campos de cobro
    const camposReset = {
      'Cobrado 30%': false, 'Cobrado 50%': false, 'Cobrado': false,
      'Fecha cobro': '', 'Cuenta destino': '', 'Forma de pago': '',
      'Ret. Ganancias': 0, 'Ret. IIBB': 0, 'Ret. IVA': 0,
      'Comision banco': 0, 'Retenciones': 0, 'Monto cobrado': 0,
    }
    const updates = []
    Object.entries(camposReset).forEach(([campo, valor]) => {
      const idx = headers.indexOf(campo)
      if (idx !== -1) updates.push({ range: `FACTURACION!${colLetra(idx)}${filaTarget}`, values: [[valor]] })
    })

    // 3. Buscar entradas en COBROS asociadas y reverter saldo si corresponde
    const cobrosR = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'COBROS!A:L' })
    const cobrosRows = cobrosR.data.values || []
    const filasABorrar = []
    const cobrosBorrados = []
    cobrosRows.forEach((row, i) => {
      if (i === 0) return
      if (String(row[1]||'').trim() === String(presupuestoNum).trim()) {
        const esMigrado = /migrado del hist[óo]rico/i.test(String(row[11]||''))
        if (!soloMigrados || esMigrado) {
          filasABorrar.push(i + 1)
          cobrosBorrados.push({ fila: i+1, monto: num(row[4]), cuenta: row[5], esMigrado })
        }
      }
    })

    // 4. Si revertirSaldoCuenta=true, descontar de CUENTAS lo que se había sumado
    let saldoActualizado = null
    if (revertirSaldoCuenta) {
      const cuentasMap = {}
      cobrosBorrados.forEach(c => {
        if (c.cuenta) cuentasMap[c.cuenta] = (cuentasMap[c.cuenta]||0) + c.monto
      })
      if (Object.keys(cuentasMap).length > 0) {
        const cR = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CUENTAS!A:H' })
        const cuRows = cR.data.values || []
        const ch = cuRows[0] || []
        const iNombre = ch.indexOf('Nombre')
        const iSaldo = ch.indexOf('Saldo actual')
        const iFechaU = ch.indexOf('Última actualización')
        Object.entries(cuentasMap).forEach(([cuenta, descontar]) => {
          const idxC = cuRows.findIndex((r,i) => i>0 && String(r[iNombre]||'').trim() === String(cuenta).trim())
          if (idxC > 0) {
            const nuevo = num(cuRows[idxC][iSaldo]) - descontar
            updates.push({ range: `CUENTAS!${colLetra(iSaldo)}${idxC+1}`, values: [[nuevo]] })
            updates.push({ range: `CUENTAS!${colLetra(iFechaU)}${idxC+1}`, values: [[new Date().toLocaleDateString('es-AR')]] })
            saldoActualizado = saldoActualizado || []
            saldoActualizado.push({ cuenta, descontado: descontar, nuevoSaldo: nuevo })
          }
        })
      }
    }

    // 5. Ejecutar batchUpdate
    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
      })
    }

    // 6. Borrar filas de COBROS (en orden inverso para no desplazar índices)
    if (filasABorrar.length > 0) {
      const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties)' })
      const cobrosSheet = meta.data.sheets.find(s => s.properties.title === 'COBROS')
      if (cobrosSheet) {
        filasABorrar.sort((a,b) => b - a)
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { requests: filasABorrar.map(f => ({
            deleteDimension: { range: { sheetId: cobrosSheet.properties.sheetId, dimension: 'ROWS', startIndex: f-1, endIndex: f } }
          })) }
        })
      }
    }

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'factura-resetear-cobro', 'FACTURACION', String(presupuestoNum), `cobros_borrados=${filasABorrar.length} soloMigrados=${soloMigrados} revertirSaldo=${revertirSaldoCuenta}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, cobrosBorrados: cobrosBorrados.length, detalleCobros: cobrosBorrados, saldoActualizado })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
