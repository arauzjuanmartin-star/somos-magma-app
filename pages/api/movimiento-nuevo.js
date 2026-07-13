import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
const num = v => parseFloat(String(v==null?'':v).replace(/[^\d.-]/g,''))||0

// Registra un MOVIMIENTO de plata que NO es un gasto: transferencia entre cuentas,
// compra/venta de dólares, retiro/depósito de efectivo. Ajusta los saldos de las cuentas
// involucradas (en su moneda) pero no toca los egresos del mes.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  let { fecha, tipo, descripcion, cuentaOrigen, monedaOrigen, montoOrigen, cuentaDestino, monedaDestino, montoDestino, cotizacion, persona, notas } = req.body
  monedaOrigen = String(monedaOrigen || 'ARS').toUpperCase()
  monedaDestino = String(monedaDestino || 'ARS').toUpperCase()
  montoOrigen = num(montoOrigen)
  montoDestino = num(montoDestino) || montoOrigen  // si no hay conversión, destino = origen
  if (!tipo) return res.status(400).json({ error: 'Falta el tipo de movimiento' })
  if (!cuentaOrigen && !cuentaDestino) return res.status(400).json({ error: 'Elegí al menos una cuenta (origen o destino)' })
  if (montoOrigen <= 0 && montoDestino <= 0) return res.status(400).json({ error: 'El monto tiene que ser mayor a 0' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const hoy = fecha || new Date().toLocaleDateString('es-AR')

    // 1) Append a MOVIMIENTOS (orden de headers fijo)
    const fila = [hoy, tipo, descripcion || '', cuentaOrigen || '', cuentaOrigen ? monedaOrigen : '', cuentaOrigen ? montoOrigen : '', cuentaDestino || '', cuentaDestino ? monedaDestino : '', cuentaDestino ? montoDestino : '', cotizacion || '', persona || '', mail, new Date().toISOString(), notas || '']
    await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'MOVIMIENTOS!A:N', valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: [fila] } })

    // 2) Ajustar saldos de las cuentas (en su moneda)
    const rC = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CUENTAS!A:N' })
    const rows = rC.data.values || [], ch = rows[0] || []
    const iN = ch.indexOf('Nombre'), iArs = ch.indexOf('Saldo actual'), iUsd = ch.indexOf('Saldo USD'), iF = ch.indexOf('Última actualización')
    const updates = []
    const fechaTxt = `${hoy}`
    const ajustar = (nombre, moneda, delta) => {
      if (!nombre || !delta) return
      const idx = rows.findIndex((r, i) => i > 0 && String(r[iN] || '').trim().toLowerCase() === String(nombre).trim().toLowerCase())
      if (idx <= 0) return
      const usd = moneda === 'USD'
      const col = usd ? iUsd : iArs
      if (col < 0) return
      const saldo = num(rows[idx][col])
      const nuevo = saldo + delta
      rows[idx][col] = String(nuevo)  // por si la misma cuenta es origen y destino
      updates.push({ range: `CUENTAS!${colLetra(col)}${idx + 1}`, values: [[nuevo]] })
      if (iF >= 0) updates.push({ range: `CUENTAS!${colLetra(iF)}${idx + 1}`, values: [[fechaTxt]] })
    }
    ajustar(cuentaOrigen, monedaOrigen, -montoOrigen)
    ajustar(cuentaDestino, monedaDestino, +montoDestino)
    if (updates.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates } })

    try {
      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'movimiento-nuevo', 'MOVIMIENTOS', tipo, `${cuentaOrigen||''} -${monedaOrigen} ${montoOrigen} → ${cuentaDestino||''} +${monedaDestino} ${montoDestino}`]] } })
    } catch (e) {}

    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
