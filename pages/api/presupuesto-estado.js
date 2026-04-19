import { getSheets } from '../../lib/sheets'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  const { num, estado, motivo } = req.body
  try {
    const { sheets, SHEET_ID } = await getSheets()

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
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[estado]] }
    })

    // El motivo NO se escribe en una columna de PRESUPUESTOS (antes iba a AU y pisaba Ajuste).
    // Va solo al LOG para auditoría.
    if (motivo) {
      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'LOG!A:F',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[new Date().toISOString(), mail, 'presupuesto-estado', 'PRESUPUESTOS', String(num), `${estado} | motivo: ${motivo}`]] },
        })
      } catch (e) {}
    } else {
      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'LOG!A:F',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[new Date().toISOString(), mail, 'presupuesto-estado', 'PRESUPUESTOS', String(num), estado]] },
        })
      } catch (e) {}
    }

    // Si APROBADO → crear fila en PROYECTOS con el orden correcto del Sheet
    if (estado === 'APROBADO' && presuRow) {
      const nro         = presuRow[0]  || ''
      const fechaEvento = presuRow[1]  || ''
      const pmInterno   = presuRow[2]  || ''
      const agencia     = presuRow[4]  || ''
      const cliente     = presuRow[5]  || ''
      const proyecto    = presuRow[6]  || ''
      const precio      = presuRow[8]  || ''

      const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
      let mesStr = ''
      if (fechaEvento) {
        const parts = fechaEvento.split('/')
        if (parts.length >= 2) {
          const mesNum = parseInt(parts[1]) || parseInt(parts[0])
          if (mesNum >= 1 && mesNum <= 12) {
            mesStr = String(mesNum).padStart(2,'0') + ' - ' + MESES[mesNum-1]
          }
        }
      }

      const rProy = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'PROYECTOS!C:C',
      })
      const proyRows = rProy.data.values || []
      const yaExiste = proyRows.some(r => String(r[0]) === String(nro))

      if (!yaExiste) {
        const proyRow = [
          mesStr, '', nro, fechaEvento, agencia, cliente, proyecto, precio, '', '', '',
        ]
        for (let j = 0; j < 12; j++) {
          proyRow.push(presuRow[11 + j*2] || '')  // Pedido
          proyRow.push(presuRow[12 + j*2] || '')  // Precio
          proyRow.push('')                         // Staff
        }

        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'PROYECTOS!A:A',
          valueInputOption: 'USER_ENTERED',
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
