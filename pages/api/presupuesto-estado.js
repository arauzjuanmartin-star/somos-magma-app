import { getSheets, MAX_SLOTS, SLOT_PRESU, SLOT_PROY, ANCHO_PROY } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { asegurarCarpetasProyecto } from '../../lib/drive'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail
  const { num, estado, motivo, noCalendar } = req.body
  try {
    const { sheets, SHEET_ID } = await getSheets()

    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'PRESUPUESTOS!A:DI',
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

    // Si el estado NO es APROBADO → eliminar la fila correspondiente en PROYECTOS si existe.
    // Solo APROBADO debe estar en PROYECTOS. Cualquier otro estado (EN ESPERA,
    // REPRESUPUESTADO, DESAPROBADO, etc) significa que ya NO es un trabajo activo.
    if (estado !== 'APROBADO' && presuRow) {
      try {
        const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties)' })
        const proySheet = meta.data.sheets.find(s => s.properties.title === 'PROYECTOS')
        if (proySheet) {
          const rProy = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:C' })
          const proyRows = rProy.data.values || []
          let proyRowIdx = -1
          for (let i = 1; i < proyRows.length; i++) {
            if (String(proyRows[i][2]) === String(num)) { proyRowIdx = i + 1; break }
          }
          if (proyRowIdx > 0) {
            await sheets.spreadsheets.batchUpdate({
              spreadsheetId: SHEET_ID,
              requestBody: { requests: [{
                deleteDimension: {
                  range: { sheetId: proySheet.properties.sheetId, dimension: 'ROWS', startIndex: proyRowIdx-1, endIndex: proyRowIdx }
                }
              }] }
            })
            try {
              await sheets.spreadsheets.values.append({
                spreadsheetId: SHEET_ID,
                range: 'LOG!A:F',
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[new Date().toISOString(), mail, 'proy-borrado-por-cambio-estado', 'PROYECTOS', String(num), `Eliminado por cambio a estado=${estado}`]] },
              })
            } catch (e) {}
          }
        }
      } catch (e) { console.error('Error eliminando proyecto al represupuestar:', e) }

      // También eliminar facturas NO cobradas de ese presupuesto (quedaron huérfanas al
      // represupuestar/desaprobar — ej: error + nota de crédito). Las cobradas se respetan.
      try {
        const meta2 = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties)' })
        const factSheet = meta2.data.sheets.find(s => /facturacion/i.test(s.properties.title))
        if (factSheet) {
          const rFact = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AG' })
          const fRows = rFact.data.values || [], fh = fRows[0] || []
          const iNum = fh.indexOf('N° Presupuesto'), iCob = fh.findIndex(x => /^cobrado$/i.test(x))
          const esCob = row => ['true','sí','si'].includes(String(row[iCob]||'').toLowerCase().trim())
          const aBorrar = []
          for (let i = 1; i < fRows.length; i++) {
            if (String(fRows[i][iNum]||'').trim() === String(num).trim() && !esCob(fRows[i])) aBorrar.push(i)
          }
          if (aBorrar.length) {
            await sheets.spreadsheets.batchUpdate({
              spreadsheetId: SHEET_ID,
              requestBody: { requests: aBorrar.sort((a,b)=>b-a).map(i => ({ deleteDimension: { range: { sheetId: factSheet.properties.sheetId, dimension: 'ROWS', startIndex: i, endIndex: i+1 } } })) }
            })
            try { await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'facturas-borradas-por-cambio-estado', 'FACTURACION', String(num), `${aBorrar.length} factura(s) no cobradas eliminadas por estado=${estado}`]] } }) } catch (e) {}
          }
        }
      } catch (e) { console.error('Error eliminando facturas al represupuestar:', e) }
    }

    // Escribir el motivo en col AY (Motivo Desaprobado, índice 50).
    // ATENCIÓN: la col Y (índice 24) era Precio 7 — escribir ahí pisaba datos. Bug fixed 2026-06-08.
    try {
      const motivoFinal = (estado === 'DESAPROBADO' || estado === 'REPRESUPUESTADO') ? (motivo || '') : ''
      if (motivoFinal || estado === 'APROBADO' || estado === 'EN ESPERA') {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `PRESUPUESTOS!AY${rowIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[motivoFinal]] }
        })
      }
    } catch (e) { console.error('Error escribiendo motivo:', e) }

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
      const precioFinal = presuRow[8]  || ''  // I — lo que cliente paga
      const fechaPresu  = presuRow[9]  || ''
      // Financieros del presu
      const subtotal    = presuRow[38] || ''  // AM
      const fee         = presuRow[39] || ''  // AN
      const impGan      = presuRow[40] || ''  // AO
      const iibb        = presuRow[41] || ''  // AP
      const plazo       = presuRow[42] || ''  // AQ
      const interesPct  = presuRow[43] || ''  // AR
      const interesAmt  = presuRow[44] || ''  // AS
      const totalBruto  = presuRow[45] || ''  // AT — antes del ajuste/descuento
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

      // Construir fila completa de PROYECTOS (A:ER)
      // Layout: A Mes, B CargaStaff, C Nro, D FechaEvento, E Agencia, F Cliente, G Proyecto, H Total, I FeeFinal, J Diferencia, K FeeAgencia,
      // L..AU (slots 1..12), AV..AX Otros, AY FechaPresu, AZ PM, BA Subtotal, BB ImpGan, BC IIBB, BD Plazo, BE Int%, BF Int$, BG Total, BH Ajuste,
      // BI..CF (slots 13..20), CG..CJ Días/No facturable, CK..ER (slots 21..40). Ver SLOT_PROY.
      const proyRow = new Array(ANCHO_PROY).fill('')
      proyRow[0]  = mesStr
      proyRow[1]  = false              // Carga Staff (todavía no)
      proyRow[2]  = nro
      proyRow[3]  = fechaEvento
      proyRow[4]  = agencia
      proyRow[5]  = cliente
      proyRow[6]  = proyecto
      proyRow[7]  = precioFinal        // Total (lo que cliente paga, ya con descuento aplicado)
      proyRow[8]  = fee                // Fee Final
      proyRow[9]  = ''                 // Diferencia (vs presu inicial)
      proyRow[10] = fee                // Fee Agencia (mismo que Fee Final inicialmente)
      // Pedidos: copiar SOLO los base (no los adicionales opcionales).
      // 'Es Adicional' (col BD, idx 55) es un CSV 1|0 alineado con los slots Pedido.
      // OJO: 'Es Adicional' es el índice 55. Antes esta ruta leía PRESUPUESTOS!A:AZ
      // (índices 0..51), así que presuRow[55] SIEMPRE era undefined y el filtro no
      // filtraba nada: los adicionales que el cliente NO tomó se copiaban igual al
      // proyecto como costo. Con el rango A:DI ya llega de verdad.
      const esAdicArr = String(presuRow[55]||'').split('|')
      const basePedidos = []
      for (let j = 0; j < MAX_SLOTS; j++) {
        const cp = SLOT_PRESU(j + 1)
        const ped = presuRow[cp.pedido] || '', prc = presuRow[cp.precio] || ''
        if (!ped && !prc) continue
        if (esAdicArr[j] === '1') continue   // adicional no tomado → no va al proyecto
        basePedidos.push({ ped, prc })
      }
      basePedidos.forEach((bp, k) => {
        if (k >= MAX_SLOTS) return
        const cy = SLOT_PROY(k + 1)
        proyRow[cy.pedido] = bp.ped
        proyRow[cy.precio] = bp.prc
        proyRow[cy.staff]  = ''
      })
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
      proyRow[58] = precioFinal        // BG Total (lo que cliente paga, igual que H)
      proyRow[59] = ajuste              // BH Ajuste (descuento aplicado, negativo si descuento)

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
        const ap = await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'PROYECTOS!A:ER',
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [proyRow] }
        })
        // La fila donde cayó, para escribir Días (CG)
        const m = String(ap.data?.updates?.updatedRange || '').match(/!\w+?(\d+)/)
        if (m) proyRowIdx = parseInt(m[1])
      } else {
        // Update fila existente — completar BB-BH y H/I/K (Fee/Total), preservar Carga Staff y Staff slots
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `PROYECTOS!BA${proyRowIdx}:BH${proyRowIdx}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[subtotal, impGan, iibb, plazo, interesPct, interesAmt, precioFinal, ajuste]] }
        })
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { valueInputOption: 'USER_ENTERED', data: [
            { range: `PROYECTOS!H${proyRowIdx}`, values: [[precioFinal]] },
            { range: `PROYECTOS!I${proyRowIdx}`, values: [[fee]] },
            { range: `PROYECTOS!K${proyRowIdx}`, values: [[fee]] },
          ]},
        })
      }

      // 📅 DÍAS (CG) — "Cant. Fechas" del presu como punto de partida.
      // OJO: Cant. Fechas son las fechas presupuestadas (armado + evento); no todos
      // van a todas. Por eso se marca origen "presupuesto" y NO se pisa lo revisado.
      try {
        const cantFechas = parseInt(String(presuRow[7]||'').replace(/[^\d]/g,'')) || 0
        if (cantFechas > 0 && proyRowIdx > 0) {
          const rD = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID, range: `PROYECTOS!CG${proyRowIdx}:CI${proyRowIdx}`,
          })
          const [diasAct, , origen] = (rD.data.values?.[0] || [])
          if (String(origen||'').trim() !== 'revisado' && !String(diasAct||'').trim()) {
            await sheets.spreadsheets.values.batchUpdate({
              spreadsheetId: SHEET_ID,
              requestBody: { valueInputOption: 'USER_ENTERED', data: [
                { range: `PROYECTOS!CG${proyRowIdx}`, values: [[cantFechas]] },
                { range: `PROYECTOS!CI${proyRowIdx}`, values: [['presupuesto']] },
              ]},
            })
          }
        }
      } catch (e) { console.warn('No se pudo propagar Días:', e.message) }
    }

    // 📁 CARPETAS EN DRIVE (best-effort, no bloquea)
    // Al aprobar, el material ya tiene dónde ir, en las dos unidades madre:
    //   CRUDO     CR_AGENCIA/CR_CLIENTE/AÑO/NRO_FECHA_Proyecto/{Fotos,Videos}
    //   ENTREGAS  CLIENTE/AÑO/NRO_FECHA_Proyecto/{Fotos,Videos}
    // Las subcarpetas salen de lo que se vendió (ver subcarpetasDe). Es idempotente:
    // si ya existen solo guarda los links. NO comparte con nadie todavía — compartir
    // con el staff o darle el crudo al cliente son botones explícitos del módulo Edición.
    let driveResult = null
    if (estado === 'APROBADO') {
      try {
        driveResult = await asegurarCarpetasProyecto({ sheets, SHEET_ID, num, destinos: ['crudo', 'entregas'] })
      } catch (e) {
        console.warn('Drive carpeta falló (no bloquea):', e.message)
        driveResult = { error: e.message }
      }
    }

    // 🗓 SINCRONIZAR CON CALENDAR MAGMA (best-effort, no bloquea el flujo si falla)
    // Si noCalendar=true, el front lo hace en segundo plano para que el cambio de estado sea rápido.
    let calendarResult = null
    if (!noCalendar) try {
      // Hacemos el call HTTP al endpoint interno con la sesión actual (forward la cookie)
      const cookie = req.headers.cookie || ''
      const host = req.headers.host
      const proto = host?.includes('localhost') ? 'http' : 'https'
      const accion = estado === 'APROBADO' ? 'aprobar'
                   : (estado === 'DESAPROBADO' || estado === 'REPRESUPUESTADO') ? 'borrar'
                   : 'pendiente'
      const calR = await fetch(`${proto}://${host}/api/calendar-evento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ num, accion }),
      })
      calendarResult = await calR.json().catch(()=>({}))
    } catch (e) {
      console.warn('Calendar sync falló (no bloquea):', e.message)
    }

    res.json({ ok: true, calendar: calendarResult, drive: driveResult })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
