import { getSheets } from '../../lib/sheets'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
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

    // Si APROBADO → crear fila en PROYECTOS con el orden correcto del Sheet
    if (estado === 'APROBADO' && presuRow) {
      // PRESUPUESTOS índices:
      // 0:Nro, 1:FechaEvento, 2:PMInterno, 3:Estado, 4:Agencia, 5:Cliente
      // 6:Proyecto, 7:CantFechas, 8:PrecioFinal, 9:FechaPresu, 10:Contacto
      // 11:Pedido1, 12:Precio1, 13:Pedido2, 14:Precio2 ...

      const nro         = presuRow[0]  || ''
      const fechaEvento = presuRow[1]  || ''
      const pmInterno   = presuRow[2]  || ''
      const agencia     = presuRow[4]  || ''
      const cliente     = presuRow[5]  || ''
      const proyecto    = presuRow[6]  || ''
      const precio      = presuRow[8]  || ''

      // Calcular mes para col A de PROYECTOS (formato "MM - NOMBRE")
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

      // Verificar duplicado en PROYECTOS (col C tiene el N° presupuesto)
      const rProy = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'PROYECTOS!C:C',
      })
      const proyRows = rProy.data.values || []
      const yaExiste = proyRows.some(r => String(r[0]) === String(nro))

      if (!yaExiste) {
        // PROYECTOS orden correcto:
        // A: Mes | B: Carga Staff (vacío) | C: N° Presupuesto | D: Fecha Evento
        // E: Agencia | F: Cliente | G: Proyecto | H: Total | I: Fee Final
        // J: Diferencia | K: Fee Agencia | L: Pedido 1 | M: Precio | N: Staff ...
        const proyRow = [
          mesStr,    // A: Mes
          '',        // B: Carga Staff (FALSE/vacío)
          nro,       // C: N° Presupuesto
          fechaEvento, // D: Fecha Evento
          agencia,   // E: Agencia
          cliente,   // F: Cliente
          proyecto,  // G: Proyecto
          precio,    // H: Total
          '',        // I: Fee Final (calculado por Sheet)
          '',        // J: Diferencia (calculado)
          '',        // K: Fee Agencia (calculado)
        ]
        // Agregar Pedido1, Precio1, Staff1 ... desde PRESUPUESTOS
        for (let j = 0; j < 12; j++) {
          proyRow.push(presuRow[11 + j*2] || '')  // Pedido
          proyRow.push(presuRow[12 + j*2] || '')  // Precio
          proyRow.push('')                          // Staff (vacío, se carga en Proyectos)
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
