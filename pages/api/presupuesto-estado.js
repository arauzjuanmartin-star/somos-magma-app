import { getSheets } from '../../lib/sheets'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { num, estado, motivo } = req.body
  try {
    const { sheets, SHEET_ID } = await getSheets()

    // Leer PRESUPUESTOS completo
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'PRESUPUESTOS!A:AZ',
    })
    const rows = r.data.values || []
    let rowIndex = -1
    let presuRow = null
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(num)) {
        rowIndex = i + 1
        presuRow = rows[i]
        break
      }
    }
    if (rowIndex === -1) return res.status(404).json({ error: 'No encontrado' })

    // Actualizar estado col D (índice 3)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `PRESUPUESTOS!D${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[estado]] }
    })

    if (motivo) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `PRESUPUESTOS!AU${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[motivo]] }
      })
    }

    // Si APROBADO → crear fila en PROYECTOS
    if (estado === 'APROBADO' && presuRow) {
      // Índices por posición (orden real del Sheet):
      // A=0: Nro, B=1: FechaEvento, C=2: PMInterno, D=3: Estado
      // E=4: Agencia, F=5: Cliente, G=6: Proyecto, H=7: CantFechas
      // I=8: PrecioFinal, J=9: FechaPresupuesto, K=10: Contacto
      // L=11: Pedido1, M=12: Precio1, N=13: Pedido2, O=14: Precio2 ...
      const nro        = presuRow[0]  || ''
      const fechaEvento = presuRow[1]  || ''
      const pmInterno  = presuRow[2]  || ''
      const agencia    = presuRow[4]  || ''
      const cliente    = presuRow[5]  || ''
      const proyecto   = presuRow[6]  || ''
      const precio     = presuRow[8]  || ''

      // Verificar duplicado en PROYECTOS
      const rProy = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'PROYECTOS!A:A',
      })
      const proyRows = rProy.data.values || []
      const yaExiste = proyRows.some(r => String(r[0]) === String(num))

      if (!yaExiste) {
        // Columnas PROYECTOS: N° presupuesto, Proyecto, Cliente, Agencia, PM Interno, Fecha Evento, Total, Carga Staff, Pedido1..12 + Precio1..12
        const proyRow = [nro, proyecto, cliente, agencia, pmInterno, fechaEvento, precio, '']
        // Pedidos: desde índice 11 de presuRow, de a pares (pedido, precio)
        for (let j = 0; j < 12; j++) {
          proyRow.push(presuRow[11 + j*2] || '')  // Pedido
          proyRow.push(presuRow[12 + j*2] || '')  // Precio
        }
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'PROYECTOS!A:A',
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [proyRow] }
        })
      }
    }

    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
