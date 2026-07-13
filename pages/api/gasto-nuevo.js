import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

// Agrega un gasto a GASTOS_FIJOS. Dos sabores:
//  - recurrente ('fijo'):  se paga todos los meses (sueldo, alquiler…). Frecuencia=mensual.
//  - puntual  ('unico'):   impuesto/gasto de UN mes concreto (IVA de julio…). Frecuencia=único,
//                          atado a Mes carga/Año carga → la app lo muestra solo en ese mes.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  let { categoria, concepto, monto, moneda, recurrencia, diaPago, cuenta, mes, anio, notas, tipo } = req.body
  monto = parseFloat(String(monto==null?'':monto).replace(/[^\d.-]/g,'')) || 0
  moneda = String(moneda || 'ARS').toUpperCase()
  const esUnico = recurrencia === 'unico'
  if (!concepto) return res.status(400).json({ error: 'Falta el concepto' })
  if (monto <= 0) return res.status(400).json({ error: 'El monto tiene que ser mayor a 0' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'GASTOS_FIJOS!1:1' })
    const headers = r.data.values?.[0] || []
    const fila = new Array(headers.length).fill('')
    const set = (name, val) => { const i = headers.indexOf(name); if (i >= 0) fila[i] = val }

    const now = new Date()
    set('Categoria', categoria || (esUnico ? 'Impuestos' : 'Otros'))
    set('Concepto', concepto)
    set('Monto', monto)
    set('Moneda', moneda)
    set('Frecuencia', esUnico ? 'único' : 'mensual')
    set('Dia pago', diaPago || '')
    set('Persona/Cuenta', cuenta || '')
    set('Activo', 'SI')
    set('Observacion', notas || '')
    set('Mes carga', mes || (now.getMonth() + 1))
    set('Año carga', anio || now.getFullYear())
    set('Tipo', tipo || (esUnico ? 'impuesto' : 'gasto'))
    set('Pagado', 'NO')
    set('Cuenta pago', '')

    await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'GASTOS_FIJOS!A:Q', valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: [fila] } })

    try {
      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'gasto-nuevo', 'GASTOS_FIJOS', concepto, `${esUnico?'único':'mensual'} ${moneda} ${monto} ${esUnico?`(${mes}/${anio})`:''}`]] } })
    } catch (e) {}

    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
