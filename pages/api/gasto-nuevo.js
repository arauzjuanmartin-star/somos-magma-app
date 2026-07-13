import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
const numv = v => parseFloat(String(v==null?'':v).replace(/[^\d.-]/g,'')) || 0

// Agrega un gasto a GASTOS_FIJOS. Dos sabores:
//  - recurrente ('fijo'):  se paga todos los meses (sueldo, alquiler…). Frecuencia=mensual.
//  - puntual  ('unico'):   impuesto/gasto de UN mes concreto (IVA de julio…). Frecuencia=único,
//                          atado a Mes carga/Año carga → la app lo muestra solo en ese mes.
// Puede marcarse PAGADO de una (pagado + cuentaPago) → descuenta de la cuenta, igual que el toggle.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  let { categoria, concepto, monto, moneda, recurrencia, diaPago, cuenta, mes, anio, notas, tipo, pagado, cuentaPago, fechaPago } = req.body
  monto = numv(monto)
  moneda = String(moneda || 'ARS').toUpperCase()
  const esUnico = recurrencia === 'unico'
  if (!concepto) return res.status(400).json({ error: 'Falta el concepto' })
  if (monto <= 0) return res.status(400).json({ error: 'El monto tiene que ser mayor a 0' })
  if (pagado && !cuentaPago) return res.status(400).json({ error: 'Elegí de qué cuenta se pagó' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'GASTOS_FIJOS!1:1' })
    const headers = r.data.values?.[0] || []
    const fila = new Array(headers.length).fill('')
    const set = (name, val) => { const i = headers.indexOf(name); if (i >= 0) fila[i] = val }

    const now = new Date()
    const gMes = mes || (now.getMonth() + 1), gAnio = anio || now.getFullYear()
    const hoy = fechaPago || `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`
    set('Categoria', categoria || (esUnico ? 'Impuestos' : 'Otros'))
    set('Concepto', concepto)
    set('Monto', monto)
    set('Moneda', moneda)
    set('Frecuencia', esUnico ? 'único' : 'mensual')
    set('Dia pago', diaPago || '')
    set('Persona/Cuenta', cuenta || '')
    set('Activo', 'SI')
    set('Observacion', notas || '')
    set('Mes carga', gMes)
    set('Año carga', gAnio)
    set('Tipo', tipo || (esUnico ? 'impuesto' : 'gasto'))
    // Marcar pagado de una (opcional)
    if (pagado) {
      set('Pagado', 'SI')
      set('Fecha pago', hoy)
      set('Cuenta pago', cuentaPago)
      set('Meses pagados', `${gMes}/${gAnio}`)  // así la app lo muestra pagado en ese mes
    } else {
      set('Pagado', 'NO')
      set('Cuenta pago', '')
    }

    const ap = await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'GASTOS_FIJOS!A:Q', valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: [fila] } })
    const filaNum = (() => { const m = String(ap.data.updates?.updatedRange || '').match(/![A-Z]+(\d+)/); return m ? parseInt(m[1]) : null })()

    // Descontar de la cuenta si se pagó
    if (pagado && cuentaPago) {
      try {
        const rC = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CUENTAS!A:N' })
        const rows = rC.data.values || [], ch = rows[0] || []
        const iN = ch.indexOf('Nombre'), iArs = ch.indexOf('Saldo actual'), iUsd = ch.indexOf('Saldo USD'), iF = ch.indexOf('Última actualización')
        const idx = rows.findIndex((row, i) => i > 0 && String(row[iN] || '').trim().toLowerCase() === String(cuentaPago).trim().toLowerCase())
        const col = moneda === 'USD' ? iUsd : iArs
        if (idx > 0 && col >= 0) {
          const nuevo = numv(rows[idx][col]) - monto
          const ups = [{ range: `CUENTAS!${colLetra(col)}${idx + 1}`, values: [[nuevo]] }]
          if (iF >= 0) ups.push({ range: `CUENTAS!${colLetra(iF)}${idx + 1}`, values: [[hoy]] })
          await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: ups } })
        }
      } catch (e) { console.error('descuento cuenta gasto-nuevo:', e.message) }
    }

    try {
      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'gasto-nuevo', 'GASTOS_FIJOS', concepto, `${esUnico?'único':'mensual'} ${moneda} ${monto} ${esUnico?`(${gMes}/${gAnio})`:''}${pagado?` · PAGADO ${cuentaPago}`:''}`]] } })
    } catch (e) {}

    res.json({ ok: true, fila: filaNum })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
