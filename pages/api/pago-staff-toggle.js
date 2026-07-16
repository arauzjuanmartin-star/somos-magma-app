import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const colLetra = col => { let s='',c=col+1; while(c>0){c--;s=String.fromCharCode(65+(c%26))+s;c=Math.floor(c/26);} return s }

// Ajusta el saldo de una cuenta (+/- delta). Best-effort, no bloquea el pago si falla.
async function ajustarCuenta(sheets, SHEET_ID, nombreCuenta, delta) {
  if (!nombreCuenta || !delta) return
  try {
    const rC = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CUENTAS!A:H' })
    const rows = rC.data.values || [], ch = rows[0] || []
    const iN = ch.indexOf('Nombre'), iS = ch.indexOf('Saldo actual'), iF = ch.indexOf('Última actualización')
    if (iN === -1 || iS === -1) return
    const idx = rows.findIndex((r, i) => i > 0 && String(r[iN]||'').trim() === String(nombreCuenta).trim())
    if (idx <= 0) return
    const saldo = parseFloat(String(rows[idx][iS]||'0').replace(/[^\d.-]/g,'')) || 0
    const d = new Date()
    const data = [{ range: `CUENTAS!${colLetra(iS)}${idx+1}`, values: [[saldo + delta]] }]
    if (iF !== -1) data.push({ range: `CUENTAS!${colLetra(iF)}${idx+1}`, values: [[`${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`]] })
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data } })
  } catch (e) { console.error('ajustarCuenta:', e.message) }
}

// Esquema REAL de PAGOS_STAFF (2026):
// A Fecha Pago | B Freelancer | C Mes Referencia | D N° Presupuesto | E Proyecto
// F Servicio | G Monto Adeudado | H Monto Pagado | I Tipo | J Cuenta | K Estado | L Notas

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { mes, persona, nroProyecto, proyecto, pedido, monto, montoAdeudado, fechaEvento, agencia, pagado, cuenta, fechaPago, observacion } = req.body || {}
  if (!mes || !persona) return res.status(400).json({ error: 'Faltan mes o persona' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PAGOS_STAFF!A:L' })
    const rows = r.data.values || []
    const headers = rows[0] || []
    // Detectar columnas por nombre real (con fallback a posición fija del esquema 2026)
    const find = (names, def) => { for (const n of names) { const i = headers.findIndex(h => String(h||'').toLowerCase().trim() === n.toLowerCase()); if (i >= 0) return i }; return def }
    const iFechaPago = find(['Fecha Pago','Fecha pago'], 0)
    const iPersona   = find(['Freelancer','Persona','Nombre','Staff'], 1)
    const iMes       = find(['Mes Referencia','Mes'], 2)
    const iNro       = find(['N° Presupuesto','N° Proyecto','Nro'], 3)
    const iProy      = find(['Proyecto','Descripción'], 4)
    const iPedido    = find(['Servicio','Pedido'], 5)
    const iAdeudado  = find(['Monto Adeudado','Monto','Total'], 6)
    const iPagado$   = find(['Monto Pagado'], 7)
    const iTipo      = find(['Tipo'], 8)
    const iCuenta    = find(['Cuenta','Cuenta pago'], 9)
    const iEstado    = find(['Estado','Pagado'], 10)
    const iNotas     = find(['Notas','Observación'], 11)

    const eq = (a,b) => String(a||'').trim().toLowerCase() === String(b||'').trim().toLowerCase()
    const PAG = v => ['PAGADO','SÍ','SI','TRUE'].includes(String(v||'').toUpperCase())
    // Filas que matchean este trabajo (puede haber varias idénticas: 2 motions iguales, etc.)
    const matches = rows.map((row,i)=>({row,i})).filter(({row,i}) => i > 0 &&
      eq(row[iMes], mes) && eq(row[iPersona], persona) &&
      (!nroProyecto || eq(row[iNro], nroProyecto)) && (!pedido || eq(row[iPedido], pedido))
    )
    // Al pagar: tomar una PENDIENTE (si no hay, se crea otra). Al desmarcar: tomar una PAGADA.
    const target = pagado ? (matches.find(m=>!PAG(m.row[iEstado])) || null) : (matches.find(m=>PAG(m.row[iEstado])) || null)
    const rowIdx = target ? target.i : -1

    const now = new Date()
    const fechaStr = fechaPago || (now.getDate()+'/'+(now.getMonth()+1)+'/'+now.getFullYear())
    const montoN = Number(monto) || 0
    const estado = pagado ? 'Pagado' : 'Pendiente'

    // Estado/cuenta previos (para ajustar el saldo sin descontar dos veces)
    const wasPaid = rowIdx > 0 ? PAG(rows[rowIdx][iEstado]) : false
    const cuentaPrevia = rowIdx > 0 ? (rows[rowIdx][iCuenta]||'') : ''
    // Monto realmente pagado antes (para devolver EXACTO al deshacer, aunque haya incluido IVA)
    const montoPagadoPrevio = rowIdx > 0 ? (parseFloat(String(rows[rowIdx][iPagado$]||'0').replace(/[^\d.-]/g,''))||0) : 0

    if (rowIdx > 0) {
      const sheetRow = rowIdx + 1
      const updates = [
        { range: `PAGOS_STAFF!${colLetra(iFechaPago)}${sheetRow}`, values: [[pagado ? fechaStr : '']] },
        { range: `PAGOS_STAFF!${colLetra(iPagado$)}${sheetRow}`,   values: [[pagado ? montoN : '']] },
        { range: `PAGOS_STAFF!${colLetra(iEstado)}${sheetRow}`,    values: [[estado]] },
      ]
      if (cuenta !== undefined)      updates.push({ range: `PAGOS_STAFF!${colLetra(iCuenta)}${sheetRow}`, values: [[cuenta||'']] })
      if (observacion !== undefined) updates.push({ range: `PAGOS_STAFF!${colLetra(iNotas)}${sheetRow}`,  values: [[observacion||'']] })
      await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates } })
    } else {
      // No existe: si se está DESMARCANDO algo inexistente, no escribir nada.
      if (!pagado) return res.json({ ok: true, noop: true })
      const maxCol = Math.max(iFechaPago,iPersona,iMes,iNro,iProy,iPedido,iAdeudado,iPagado$,iTipo,iCuenta,iEstado,iNotas) + 1
      const newRow = new Array(maxCol).fill('')
      newRow[iFechaPago] = fechaStr
      newRow[iPersona]   = persona
      newRow[iMes]       = mes
      if (nroProyecto) newRow[iNro] = nroProyecto
      if (proyecto)    newRow[iProy] = proyecto
      if (pedido)      newRow[iPedido] = pedido
      newRow[iAdeudado]  = Number(montoAdeudado) || montoN  // neto (costo); si no viene, = pagado
      newRow[iPagado$]   = montoN                            // lo pagado (bruto con IVA si aplica)
      newRow[iTipo]      = 'Total'
      newRow[iCuenta]    = cuenta || ''
      newRow[iEstado]    = estado
      if (observacion)   newRow[iNotas] = observacion
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'PAGOS_STAFF!A:L',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [newRow] },
      })
    }

    // Ajustar saldo de la cuenta: descontar al pagar (nuevo), devolver al desmarcar
    if (pagado && !wasPaid && montoN > 0) await ajustarCuenta(sheets, SHEET_ID, cuenta, -montoN)
    else if (!pagado && wasPaid && montoPagadoPrevio > 0) await ajustarCuenta(sheets, SHEET_ID, cuentaPrevia, montoPagadoPrevio)

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, pagado?'pago-trabajo-pagado':'pago-trabajo-desmarcado', 'PAGOS_STAFF', `${mes} ${persona} #${nroProyecto||'?'} ${pedido||''}`, `cuenta=${cuenta||cuentaPrevia||'-'} monto=${monto||'-'}`]] },
      })
    } catch (e) {}

    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
