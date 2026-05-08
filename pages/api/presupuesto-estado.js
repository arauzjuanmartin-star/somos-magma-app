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

    // Si APROBADO → crear/completar fila en PROYECTOS con TODAS las columnas
    if (estado === 'APROBADO' && presuRow) {
      const nro         = presuRow[0]  || ''
      const fechaEvento = presuRow[1]  || ''
      const pmInterno   = presuRow[2]  || ''
      const agencia     = presuRow[4]  || ''
      const cliente     = presuRow[5]  || ''
      const proyecto    = presuRow[6]  || ''
      const precio      = presuRow[8]  || ''
      const fechaPresu  = presuRow[9]  || ''
      // Financieros del presu
      const subtotal    = presuRow[38] || ''  // AM
      const fee         = presuRow[39] || ''  // AN
      const impGan      = presuRow[40] || ''  // AO
      const iibb        = presuRow[41] || ''  // AP
      const plazo       = presuRow[42] || ''  // AQ
      const interesPct  = presuRow[43] || ''  // AR
      const interesAmt  = presuRow[44] || ''  // AS
      const total       = presuRow[45] || ''  // AT
      const ajuste      = presuRow[46] || ''  // AU

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

      // Construir fila completa de PROYECTOS (60 columnas A:BH)
      // Layout: A Mes, B CargaStaff, C Nro, D FechaEvento, E Agencia, F Cliente, G Proyecto, H Total, I FeeFinal, J Diferencia, K FeeAgencia,
      // L..AX (12 slots Pedido/Precio/Staff + Otros), AY FechaPresu, AZ PM, BA Subtotal, BB ImpGan, BC IIBB, BD Plazo, BE Int%, BF Int$, BG Total, BH Ajuste
      const proyRow = new Array(60).fill('')
      proyRow[0]  = mesStr
      proyRow[1]  = false              // Carga Staff (todavía no)
      proyRow[2]  = nro
      proyRow[3]  = fechaEvento
      proyRow[4]  = agencia
      proyRow[5]  = cliente
      proyRow[6]  = proyecto
      proyRow[7]  = total || precio    // Total (con IVA si aplica) — usa AT del presu
      proyRow[8]  = fee                // Fee Final
      proyRow[9]  = ''                 // Diferencia (vs presu inicial)
      proyRow[10] = fee                // Fee Agencia (mismo que Fee Final inicialmente)
      // Pedidos: 12 slots de 3 columnas (Pedido / Precio / Staff)
      for (let j = 0; j < 12; j++) {
        proyRow[11 + j*3]     = presuRow[11 + j*2] || ''  // Pedido
        proyRow[11 + j*3 + 1] = presuRow[12 + j*2] || ''  // Precio
        proyRow[11 + j*3 + 2] = ''                         // Staff (se completa después)
      }
      // Otros (slot 13)
      proyRow[47] = presuRow[35] || ''  // Otros
      proyRow[48] = presuRow[36] || ''  // Precio
      proyRow[49] = ''                  // Staff
      proyRow[50] = fechaPresu
      proyRow[51] = pmInterno
      proyRow[52] = subtotal
      proyRow[53] = impGan
      proyRow[54] = iibb
      proyRow[55] = plazo
      proyRow[56] = interesPct
      proyRow[57] = interesAmt
      proyRow[58] = total
      proyRow[59] = ajuste

      // Buscar si ya existe fila para este presupuesto
      const rProy = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'PROYECTOS!A:C',
      })
      const proyRows = rProy.data.values || []
      let proyRowIdx = -1
      for (let i = 1; i < proyRows.length; i++) {
        if (String(proyRows[i][2]) === String(nro)) { proyRowIdx = i + 1; break }
      }

      if (proyRowIdx === -1) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'PROYECTOS!A:BH',
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [proyRow] }
        })
      } else {
        // Update fila existente — solo BB-BH y los financieros de I,K (Fee), preservar Carga Staff y Staff slots
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `PROYECTOS!BA${proyRowIdx}:BH${proyRowIdx}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[subtotal, impGan, iibb, plazo, interesPct, interesAmt, total, ajuste]] }
        })
        // También actualizar I (Fee Final) y K (Fee Agencia) por si cambiaron
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { valueInputOption: 'USER_ENTERED', data: [
            { range: `PROYECTOS!H${proyRowIdx}`, values: [[total]] },
            { range: `PROYECTOS!I${proyRowIdx}`, values: [[fee]] },
            { range: `PROYECTOS!K${proyRowIdx}`, values: [[fee]] },
          ]},
        })
      }
    }

    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
