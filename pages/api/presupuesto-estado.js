import { getSheets } from '../../lib/sheets'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { num, estado, motivo } = req.body
  try {
    const { sheets, SHEET_ID } = await getSheets()

    // Leer PRESUPUESTOS para encontrar la fila
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'PRESUPUESTOS!A:AZ',
    })
    const rows = r.data.values || []
    const headers = rows[0] || []
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

    // Actualizar estado en PRESUPUESTOS col D
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

    // Si se aprueba, crear fila en PROYECTOS
    if (estado === 'APROBADO' && presuRow) {
      const get = (key) => {
        const idx = headers.indexOf(key)
        return idx >= 0 ? (presuRow[idx] || '') : ''
      }

      // Columnas PROYECTOS: N° presupuesto, Proyecto, Cliente, Agencia, PM Interno, Fecha Evento, Total, + servicios
      const proyRow = [
        get('Columna 1'),     // N° presupuesto
        get('Proyecto'),
        get('Cliente'),
        get('Agencia'),
        get('PM Interno'),
        get('Fecha Evento') || get('FechaEvento') || '',
        get('Precio Final'),  // Total
        '',                   // Carga Staff (vacío)
      ]

      // Agregar pedidos y precios
      for (let j = 1; j <= 12; j++) {
        const pedKey = j === 1 ? 'Pedido 1' : `Pedido ${j}`
        const precKey = j === 1 ? 'Precio 1' : `Precio ${j}`
        proyRow.push(get(pedKey))
        proyRow.push(get(precKey))
      }

      // Verificar si ya existe en PROYECTOS para no duplicar
      const rProy = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'PROYECTOS!A:A',
      })
      const proyRows = rProy.data.values || []
      const yaExiste = proyRows.some(r => String(r[0]) === String(num))

      if (!yaExiste) {
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
