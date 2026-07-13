import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
const numv = v => parseFloat(String(v==null?'':v).replace(/[^\d.-]/g,'')) || 0

// Edita campos de un gasto en GASTOS_FIJOS (Concepto, Categoria, Monto, Dia pago, Moneda, Observacion).
// Si cambia el Monto y el gasto ya estaba pagado, ajusta la cuenta por la diferencia (para no descuadrar).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { fila, cambios } = req.body
  if (!fila || !cambios || typeof cambios !== 'object') return res.status(400).json({ error: 'Falta fila o cambios' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const rH = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'GASTOS_FIJOS!1:1' })
    const headers = rH.data.values?.[0] || []
    const H = n => headers.indexOf(n)
    const rRow = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `GASTOS_FIJOS!A${fila}:Q${fila}` })
    const row = rRow.data.values?.[0] || []
    if (!row.length) return res.status(404).json({ error: 'Gasto no encontrado' })

    const permitidos = ['Concepto', 'Categoria', 'Monto', 'Dia pago', 'Moneda', 'Observacion']
    const updates = []
    let deltaMonto = 0
    const montoViejo = numv(row[H('Monto')])
    for (const [campo, valor] of Object.entries(cambios)) {
      if (!permitidos.includes(campo)) continue
      const idx = H(campo)
      if (idx === -1) continue
      const val = campo === 'Monto' ? numv(valor) : valor
      updates.push({ range: `GASTOS_FIJOS!${colLetra(idx)}${fila}`, values: [[val]] })
      if (campo === 'Monto') deltaMonto = numv(valor) - montoViejo
    }
    if (!updates.length) return res.json({ ok: true, msg: 'sin cambios' })

    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates } })

    // Si cambió el monto y estaba pagado con una cuenta → ajustar esa cuenta por la diferencia
    const pagado = /^s[íi]$|^true$/i.test(String(row[H('Pagado')] || '').trim())
    const cuentaPago = String(row[H('Cuenta pago')] || '').trim()
    if (deltaMonto !== 0 && pagado && cuentaPago) {
      try {
        const moneda = String(row[H('Moneda')] || 'ARS').toUpperCase()
        const rC = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CUENTAS!A:N' })
        const rows = rC.data.values || [], ch = rows[0] || []
        const iN = ch.indexOf('Nombre'), iArs = ch.indexOf('Saldo actual'), iUsd = ch.indexOf('Saldo USD'), iF = ch.indexOf('Última actualización')
        const idx = rows.findIndex((r, i) => i > 0 && String(r[iN] || '').trim().toLowerCase() === cuentaPago.toLowerCase())
        const col = moneda === 'USD' ? iUsd : iArs
        if (idx > 0 && col >= 0) {
          const nuevo = numv(rows[idx][col]) - deltaMonto  // descontar lo que aumentó (o devolver lo que bajó)
          const d = new Date()
          const ups = [{ range: `CUENTAS!${colLetra(col)}${idx + 1}`, values: [[nuevo]] }]
          if (iF >= 0) ups.push({ range: `CUENTAS!${colLetra(iF)}${idx + 1}`, values: [[`${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`]] })
          await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: ups } })
        }
      } catch (e) { console.error('ajuste cuenta gasto-editar:', e.message) }
    }

    try {
      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'gasto-editar', 'GASTOS_FIJOS', String(fila), `campos=${Object.keys(cambios).join(',')}${deltaMonto?` deltaMonto=${deltaMonto}`:''}`]] } })
    } catch (e) {}

    res.json({ ok: true, ajusteCuenta: (deltaMonto !== 0 && pagado) ? -deltaMonto : 0 })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
