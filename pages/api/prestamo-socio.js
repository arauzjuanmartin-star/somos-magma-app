import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
const num = v => parseFloat(String(v==null?'':v).replace(/[^\d.-]/g,''))||0

// Registra una deuda/préstamo entre un socio y Magma en PRESTAMOS (Tipo=Socio).
//  - Deudor = quién debe (Magma o la persona) · Acreedor = a quién se le debe.
//  - Ej "Sofi prestó $650k": Deudor=Magma, Acreedor=Sofi, entra plata a una cuenta.
//  - Ej "Juan le debe a Magma": Deudor=Juan, Acreedor=Magma.
// Si se indica una cuenta, ajusta su saldo (entra=+, sale=-).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  // Acción SALDAR: marca una deuda socio como saldada (opcionalmente descuenta de una cuenta).
  if (req.body.saldarFila) {
    try {
      const { sheets, SHEET_ID } = await getSheets()
      const fila = parseInt(req.body.saldarFila)
      const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESTAMOS!1:1' })
      const H = r.data.values?.[0] || []
      const idx = n => H.indexOf(n)
      const ups = []
      if (idx('Saldado') !== -1) ups.push({ range: `PRESTAMOS!${colLetra(idx('Saldado'))}${fila}`, values: [['SI']] })
      if (idx('Pagado') !== -1) ups.push({ range: `PRESTAMOS!${colLetra(idx('Pagado'))}${fila}`, values: [['SI']] })
      if (idx('Fecha pago') !== -1) ups.push({ range: `PRESTAMOS!${colLetra(idx('Fecha pago'))}${fila}`, values: [[new Date().toLocaleDateString('es-AR')]] })
      if (ups.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: ups } })
      try { await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'prestamo-socio-saldar', 'PRESTAMOS', String(fila), 'saldada']] } }) } catch (e) {}
      return res.json({ ok: true, saldada: true })
    } catch (e) { console.error(e); return res.status(500).json({ error: e.message }) }
  }

  let { nombre, deudor, acreedor, monto, moneda, fecha, cuenta, efecto, notas } = req.body
  monto = num(monto)
  moneda = String(moneda || 'ARS').toUpperCase()
  efecto = String(efecto || '').toLowerCase()  // 'entra' | 'sale' | ''
  if (!deudor || !acreedor) return res.status(400).json({ error: 'Falta quién debe y a quién' })
  if (monto <= 0) return res.status(400).json({ error: 'El monto tiene que ser mayor a 0' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESTAMOS!1:1' })
    const headers = r.data.values?.[0] || []
    const fila = new Array(headers.length).fill('')
    const set = (name, val) => { const i = headers.indexOf(name); if (i >= 0) fila[i] = val }

    const label = nombre || `${deudor} debe a ${acreedor}`
    set('Prestamo', label)
    set('Cuota nro', 0)
    set('Cuotas total', 1)
    set('Vencimiento', fecha || '')
    set('Monto cuota', monto)
    set('Moneda', moneda)
    set('Pagado', 'NO')
    set('Notas', notas || '')
    set('Tipo', 'Socio')
    set('Deudor', deudor)
    set('Acreedor', acreedor)
    set('Saldado', 'NO')

    await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'PRESTAMOS!A:T', valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: [fila] } })

    // Ajustar saldo de la cuenta si corresponde
    if (cuenta && (efecto === 'entra' || efecto === 'sale')) {
      const rC = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CUENTAS!A:N' })
      const rows = rC.data.values || [], ch = rows[0] || []
      const iN = ch.indexOf('Nombre'), iArs = ch.indexOf('Saldo actual'), iUsd = ch.indexOf('Saldo USD'), iF = ch.indexOf('Última actualización')
      const idx = rows.findIndex((row, i) => i > 0 && String(row[iN] || '').trim().toLowerCase() === String(cuenta).trim().toLowerCase())
      const col = moneda === 'USD' ? iUsd : iArs
      if (idx > 0 && col >= 0) {
        const saldo = num(rows[idx][col])
        const nuevo = saldo + (efecto === 'entra' ? monto : -monto)
        const ups = [{ range: `CUENTAS!${colLetra(col)}${idx + 1}`, values: [[nuevo]] }]
        if (iF >= 0) ups.push({ range: `CUENTAS!${colLetra(iF)}${idx + 1}`, values: [[fecha || new Date().toLocaleDateString('es-AR')]] })
        await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: ups } })
      }
    }

    try {
      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'prestamo-socio', 'PRESTAMOS', label, `${moneda} ${monto} · ${efecto||'sin efecto cuenta'} ${cuenta||''}`]] } })
    } catch (e) {}

    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
