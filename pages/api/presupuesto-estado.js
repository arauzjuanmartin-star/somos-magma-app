import { getSheets, MAX_SLOTS, SLOT_PRESU, SLOT_PROY, ANCHO_PROY } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { asegurarCarpetasProyecto } from '../../lib/drive'
import { sincronizarEdicion, migrarEdicionRepresupuesto } from '../../lib/edicion-sync'
import { condicionDe, sinPedir, esOC } from '../../lib/condicion-cobro'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail
  // `nuevo`: al represupuestar, el número de la versión nueva (lo manda el front
  // después de crearla). Con eso las tareas de Edición cambian de número en vez
  // de quedar huérfanas.
  const { num, estado, motivo, noCalendar, nuevo } = req.body
  try {
    const { sheets, SHEET_ID } = await getSheets()

    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'PRESUPUESTOS!A:DW',
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

    // 🔒 RESGUARDO DEL COBRO — desde el 08/10/2026 nada se aprueba (y por lo tanto nada
    // entra a PROYECTOS ni al Calendar) sin la seña del 30 % cobrada o la orden de compra
    // del cliente. Decisión de Juan y Sofi después de CeraVe #2355 (4 presupuestos, 11
    // piezas por 8 cotizadas, $0 de seña, cobro a 30 días con el staff pagándose el 15).
    // La seña era obligatoria desde el 18/08 y se cobró 0 veces en 164 facturas: escrita
    // en el PDF no alcanzó, hace falta que la app lo trabe. Queda en PRESUPUESTOS
    // (Resguardo · Resguardo detalle · Resguardo fecha, ver lib/slots.js) y en el LOG.
    // Si el presupuesto ya tenía resguardo (re-aprobar) no se vuelve a pedir, y un
    // presupuesto en $0 (interno, canje) no lo necesita. Se chequea ANTES de tocar nada.
    const headers = rows[0] || []
    const iResg = headers.indexOf('Resguardo')
    const hoyAR = () => new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
    let resguardoEscrito = null
    if (estado === 'APROBADO' && presuRow) {
      const precio = parseFloat(String(presuRow[8] || '').replace(/[$\s,]/g, '')) || 0   // I = Precio Final
      const yaTiene = iResg > -1 && String(presuRow[iResg] || '').trim() !== ''
      const rg = req.body.resguardo || {}
      const tipo = String(rg.tipo || '').toLowerCase()
      const monto = Math.round(Number(rg.monto) || 0)
      const ref = String(rg.ref || '').trim()
      const valido = (tipo === 'sena' && monto > 0) || (tipo === 'oc' && ref !== '')
      if (precio > 0 && !yaTiene) {
        // La condición de cobro de la agencia (es quien paga) o, si no tiene, del cliente (lib/condicion-cobro.js).
        // Vacía = Seña 30%. "Cuenta corriente" y "OC después" aprueban sin pedir nada y lo dejan anotado igual,
        // para que se vea que fue una decisión y no un olvido. Juan, 07/10/2026: "Ostara nos paga después, ADN
        // también y por eso nos dan un montón de trabajo; Austral hace la OC después de la fecha".
        let condicion = '', fuente = ''
        try {
          const ac = await sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEET_ID, ranges: ['AGENCIAS!A:Z', 'CLIENTES!A:Z'] })
          const [AG, CL] = ac.data.valueRanges.map(v => v.values || [])
          const objs = M => { const hh = M[0] || []; return M.slice(1).map(r => Object.fromEntries(hh.map((k, i) => [k, r[i] ?? '']))) }
          const agencias = objs(AG), clientes = objs(CL), presuObj = { Agencia: presuRow[4] || '', Cliente: presuRow[5] || '' }
          condicion = condicionDe(presuObj, agencias, clientes)
          if (condicion) fuente = condicionDe(presuObj, agencias, []) ? `AGENCIAS: ${String(presuRow[4] || '').trim()}` : `CLIENTES: ${String(presuRow[5] || '').trim()}`
        } catch (e) { console.warn('No pude leer la condición de cobro (sigo como Seña 30%):', e.message) }
        if (sinPedir(condicion)) {
          resguardoEscrito = { tipo: 'condicion', etiqueta: condicion, detalle: fuente, fecha: hoyAR() }
        } else if (!valido) {
          const que = esOC(condicion) ? 'la orden de compra del cliente' : 'la seña cobrada o la orden de compra del cliente'
          return res.status(409).json({ error: `Para aprobar hace falta ${que}. Sin eso el trabajo no se agenda.`, sinResguardo: true, condicion })
        } else {
          resguardoEscrito = { tipo, monto, ref, fecha: String(rg.fecha || '').trim() || hoyAR() }
        }
      }
    }

    // Actualizar estado col D (índice 3)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `PRESUPUESTOS!D${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[estado]] }
    })

    // 🔒 Dejar escrito el resguardo (ver arriba). Best-effort: la aprobación ya pasó el candado.
    if (resguardoEscrito) {
      const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
      const etiqueta = resguardoEscrito.tipo === 'condicion' ? resguardoEscrito.etiqueta : resguardoEscrito.tipo === 'sena' ? 'Seña' : 'OC'
      const detalle = resguardoEscrito.tipo === 'condicion' ? resguardoEscrito.detalle : resguardoEscrito.tipo === 'sena' ? resguardoEscrito.monto : resguardoEscrito.ref
      try {
        if (iResg > -1) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `PRESUPUESTOS!${colLetra(iResg)}${rowIndex}:${colLetra(iResg + 2)}${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[etiqueta, detalle, resguardoEscrito.fecha]] },
          })
        } else {
          console.warn('PRESUPUESTOS no tiene la columna Resguardo: corré scripts/presupuestos-columnas-resguardo.mjs --escribir')
        }
        // Seña cobrada + factura ya cargada para este N° → "Cobrado 30%" tildado (lo lee el reporte de los lunes).
        // Si la factura todavía no existe, factura-nueva la crea ya tildada leyendo esta misma columna.
        if (resguardoEscrito.tipo === 'sena') {
          const rF = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:C' })
          const fR = rF.data.values || [], fh = fR[0] || []
          const iN = fh.indexOf('N° Presupuesto'), i30 = fh.indexOf('Cobrado 30%')
          if (iN > -1 && i30 > -1) {
            const data = []
            for (let i = 1; i < fR.length; i++) if (String(fR[i][iN] || '').trim() === String(num).trim()) data.push({ range: `FACTURACION!${colLetra(i30)}${i + 1}`, values: [[true]] })
            if (data.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data } })
          }
        }
      } catch (e) { console.error('No se pudo escribir el resguardo:', e.message) }
      try {
        const detLog = resguardoEscrito.tipo === 'condicion' ? `${resguardoEscrito.etiqueta} · ${resguardoEscrito.detalle} · sin pedir nada`
          : resguardoEscrito.tipo === 'sena'
          ? `Seña $${resguardoEscrito.monto.toLocaleString('es-AR')}${resguardoEscrito.ref ? ' · ' + resguardoEscrito.ref : ''} · ${resguardoEscrito.fecha}`
          : `OC ${resguardoEscrito.ref} · ${resguardoEscrito.fecha}`
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[new Date().toISOString(), mail, 'presupuesto-resguardo', 'PRESUPUESTOS', String(num), detLog]] },
        })
      } catch (e) {}
    }

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

      // Las facturas de ese presupuesto:
      //  · Represupuestado CON versión nueva → pasan al número nuevo. Es el mismo
      //    trabajo con otro precio; la factura emitida sigue valiendo y lo que falta
      //    se ve como saldo a facturar.
      //  · Si no → se borran SOLO las filas sin N° de factura y sin cobrar. Una factura
      //    con número existe en AFIP aunque el presupuesto se caiga: se anula con nota
      //    de crédito, no borrando la fila. El 10/9/2026 esta lógica borró la 0001-149
      //    de Farmacity ($968.000, emitida, mandada al cliente) y quedó sin rastro.
      try {
        const meta2 = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties)' })
        const factSheet = meta2.data.sheets.find(s => /facturacion/i.test(s.properties.title))
        if (factSheet) {
          const rFact = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AG' })
          const fRows = rFact.data.values || [], fh = fRows[0] || []
          const iNum = fh.indexOf('N° Presupuesto'), iCob = fh.findIndex(x => /^cobrado$/i.test(x))
          const iNroF = fh.findIndex(x => /^n(ro|°)\.? de factura$/i.test(String(x || '').trim()))
          const esCob = row => ['true','sí','si'].includes(String(row[iCob]||'').toLowerCase().trim())
          const tieneNro = row => iNroF > -1 && String(row[iNroF] || '').trim() !== ''
          const delPresu = []
          for (let i = 1; i < fRows.length; i++) if (String(fRows[i][iNum]||'').trim() === String(num).trim()) delPresu.push(i)
          const hayNuevo = estado === 'REPRESUPUESTADO' && nuevo && String(nuevo).trim() !== String(num).trim()
          if (hayNuevo && delPresu.length) {
            const colNum = String.fromCharCode(65 + iNum)
            await sheets.spreadsheets.values.batchUpdate({
              spreadsheetId: SHEET_ID,
              requestBody: { valueInputOption: 'USER_ENTERED', data: delPresu.map(i => ({ range: `FACTURACION!${colNum}${i + 1}`, values: [[String(nuevo).trim()]] })) },
            })
            try { await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'facturas-migradas-represupuesto', 'FACTURACION', String(num), `${delPresu.length} factura(s) pasan al #${nuevo}`]] } }) } catch (e) {}
          } else {
            const aBorrar = delPresu.filter(i => !esCob(fRows[i]) && !tieneNro(fRows[i]))
            const quedan = delPresu.length - aBorrar.length
            if (aBorrar.length) {
              await sheets.spreadsheets.batchUpdate({
                spreadsheetId: SHEET_ID,
                requestBody: { requests: aBorrar.sort((a,b)=>b-a).map(i => ({ deleteDimension: { range: { sheetId: factSheet.properties.sheetId, dimension: 'ROWS', startIndex: i, endIndex: i+1 } } })) }
              })
            }
            if (aBorrar.length || quedan) {
              try { await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'facturas-por-cambio-estado', 'FACTURACION', String(num), `estado=${estado}: ${aBorrar.length} sin número borradas · ${quedan} con número o cobradas quedan`]] } }) } catch (e) {}
            }
          }
        }
      } catch (e) { console.error('Error con las facturas al cambiar de estado:', e) }
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

    // 🎬 REPRESUPUESTADO con versión nueva → las tareas de Edición pasan al número
    // nuevo. Si no, quedan colgadas del viejo sin link a las carpetas (que se crean
    // con el nuevo) — pasó con #2191 → #2293. Best-effort, no bloquea.
    let edicionMigrada = null
    if (estado === 'REPRESUPUESTADO' && nuevo && String(nuevo).trim() !== String(num).trim()) {
      try {
        const nRow = rows.slice(1).find(x => String(x[0] || '').trim() === String(nuevo).trim())
        const pedidosNuevos = []
        if (nRow) for (let n = 1; n <= MAX_SLOTS; n++) { const p = String(nRow[SLOT_PRESU(n).pedido] || '').trim(); if (p) pedidosNuevos.push({ slot: n, pedido: p }) }
        edicionMigrada = await migrarEdicionRepresupuesto({ sheets, SHEET_ID, viejo: num, nuevo, pedidosNuevos, motivo })
        if (edicionMigrada.migradas || edicionMigrada.borradas) {
          try {
            await sheets.spreadsheets.values.append({
              spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
              requestBody: { values: [[new Date().toISOString(), mail, 'edicion-represupuesto', 'EDICION', String(num), `→ #${nuevo} · ${edicionMigrada.detalle.join(' · ')}`]] },
            })
          } catch (e) {}
        }
      } catch (e) {
        console.warn('Edición no migró al represupuestar (no bloquea):', e.message)
        edicionMigrada = { error: e.message }
      }
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
    //   CRUDO     CR_AGENCIA/CR_CLIENTE/AÑO/9 I 14 Proyecto/{Fotos,Videos}
    //   ENTREGAS  AGENCIA/CLIENTE/AÑO/9 I 14 Proyecto/{Fotos,Videos}
    // La carpeta de la agencia y del cliente sale de AGENCIAS/CLIENTES ("Drive Crudo",
    // "Drive Entregas") si está cargada; si no, se busca por nombre y se anota.
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

    // 🎬 TABLERO DE EDICIÓN (best-effort, no bloquea)
    // La fila del entregable nace acá, ya con el link al crudo que se acaba de
    // crear. Antes dependía de que alguien apretara "↻ Actualizar" en Edición: al
    // 14/9/2026 el tablero llevaba una semana sin correrlo y le faltaban 17
    // entregables aprobados. Sin bajas: aprobar un trabajo no borra filas de otros.
    let edicionResult = null
    if (estado === 'APROBADO') {
      try {
        const e = await sincronizarEdicion({ sheets, SHEET_ID, sinBajas: true })
        edicionResult = { nuevas: e.nuevas, actualizadas: e.actualizadas }
      } catch (e) {
        console.warn('Edición sync falló (no bloquea):', e.message)
        edicionResult = { error: e.message }
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

    res.json({ ok: true, calendar: calendarResult, drive: driveResult, edicion: edicionResult, edicionMigrada })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
