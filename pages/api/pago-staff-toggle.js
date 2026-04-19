import { getSheets } from '../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']
const colLetra = col => { let s='',c=col+1; while(c>0){c--;s=String.fromCharCode(65+(c%26))+s;c=Math.floor(c/26);} return s }

// Estructura PAGOS_STAFF (fila por trabajo):
// A Mes | B Persona | C N° Proyecto | D Proyecto | E Pedido | F Monto
// G Fecha Evento | H Agencia | I Cuenta | J Fecha Pago | K Pagado | L Observación

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

  const { mes, persona, nroProyecto, proyecto, pedido, monto, fechaEvento, agencia, pagado, cuenta, fechaPago, observacion } = req.body || {}
  if (!mes || !persona) return res.status(400).json({ error: 'Faltan mes o persona' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PAGOS_STAFF!A:L' })
    const rows = r.data.values || []
    const headers = rows[0] || []
    // Detectar columnas (con fallback a posiciones 0..11)
    const find = (...names) => { for (const n of names) { const i = headers.findIndex(h => String(h||'').toLowerCase().trim() === n.toLowerCase()); if (i >= 0) return i }; return -1 }
    const iMes = find('Mes') >= 0 ? find('Mes') : 0
    const iPersona = find('Persona','Nombre','Staff') >= 0 ? find('Persona','Nombre','Staff') : 1
    const iNro = find('N° Proyecto','N° presupuesto','Nro','Proyecto') >= 0 ? find('N° Proyecto','N° presupuesto','Nro') : 2
    const iProy = find('Proyecto','Descripción') >= 0 ? find('Proyecto') : 3
    const iPedido = find('Pedido','Servicio') >= 0 ? find('Pedido','Servicio') : 4
    const iMonto = find('Monto','Total','Precio') >= 0 ? find('Monto','Total','Precio') : 5
    const iFE = find('Fecha Evento','Fecha') >= 0 ? find('Fecha Evento') : 6
    const iAg = find('Agencia') >= 0 ? find('Agencia') : 7
    const iCuenta = find('Cuenta','Cuenta pago') >= 0 ? find('Cuenta','Cuenta pago') : 8
    const iFechaPago = find('Fecha pago','Fecha Pago') >= 0 ? find('Fecha pago','Fecha Pago') : 9
    const iPag = find('Pagado') >= 0 ? find('Pagado') : 10
    const iObs = find('Observación','Notas') >= 0 ? find('Observación','Notas') : 11

    // Buscar fila por mes + persona + nro proyecto + pedido (máxima granularidad)
    const rowIdx = rows.findIndex((r, i) => i > 0 &&
      String(r[iMes]||'').trim() === String(mes).trim() &&
      String(r[iPersona]||'').trim() === String(persona).trim() &&
      (!nroProyecto || String(r[iNro]||'').trim() === String(nroProyecto).trim()) &&
      (!pedido || String(r[iPedido]||'').trim() === String(pedido).trim())
    )

    const now = new Date()
    const fechaStr = fechaPago || (now.getDate()+'/'+(now.getMonth()+1)+'/'+now.getFullYear())

    if (rowIdx > 0) {
      const sheetRow = rowIdx + 1
      const updates = [
        { range: `PAGOS_STAFF!${colLetra(iCuenta)}${sheetRow}`, values: [[cuenta||'']] },
        { range: `PAGOS_STAFF!${colLetra(iFechaPago)}${sheetRow}`, values: [[pagado?fechaStr:'']] },
        { range: `PAGOS_STAFF!${colLetra(iPag)}${sheetRow}`, values: [[pagado?'SÍ':'NO']] },
      ]
      if (observacion !== undefined) updates.push({ range: `PAGOS_STAFF!${colLetra(iObs)}${sheetRow}`, values: [[observacion||'']] })
      await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates } })
    } else {
      const maxCol = Math.max(iObs, iPag, iFechaPago, iCuenta, iAg, iFE, iMonto, iPedido, iProy, iNro, iPersona, iMes) + 1
      const newRow = new Array(maxCol).fill('')
      newRow[iMes] = mes
      newRow[iPersona] = persona
      if (nroProyecto) newRow[iNro] = nroProyecto
      if (proyecto) newRow[iProy] = proyecto
      if (pedido) newRow[iPedido] = pedido
      newRow[iMonto] = Number(monto)||0
      if (fechaEvento) newRow[iFE] = fechaEvento
      if (agencia) newRow[iAg] = agencia
      newRow[iCuenta] = cuenta||''
      newRow[iFechaPago] = pagado?fechaStr:''
      newRow[iPag] = pagado?'SÍ':'NO'
      if (observacion) newRow[iObs] = observacion
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'PAGOS_STAFF!A:L',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [newRow] },
      })
    }

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, pagado?'pago-trabajo-pagado':'pago-trabajo-desmarcado', 'PAGOS_STAFF', `${mes} ${persona} #${nroProyecto||'?'} ${pedido||''}`, `cuenta=${cuenta||'-'} monto=${monto||'-'}`]] },
      })
    } catch (e) {}

    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
