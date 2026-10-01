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

  // medio = CÓMO se pagó (Efectivo, Transferencia…): va a la columna "Medio de pago". Antes este endpoint no la
  // escribía y había que completarla a mano en el sheet.
  let { categoria, concepto, monto, moneda, recurrencia, diaPago, cuenta, mes, anio, notas, tipo, pagado, cuentaPago, fechaPago, medio, rubro, subrubro, nroTrabajo } = req.body
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
    if (medio) set('Medio de pago', String(medio).trim())
    // Rubro y subrubro son los de la solapa RUBROS (la lista única). N° trabajo: si el gasto fue para un trabajo.
    // Con apóstrofo para que el sheet no lo tome como número ni como fórmula.
    const comoTexto = v => { const s = String(v ?? '').trim(); return s ? `'${s}` : '' }
    if (rubro) set('Rubro', comoTexto(rubro))
    if (subrubro) set('Subrubro', comoTexto(subrubro))
    if (nroTrabajo) set('N° trabajo', comoTexto(nroTrabajo))
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

    const ap = await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'GASTOS_FIJOS!A:W', valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: [fila] } })
    const filaNum = (() => { const m = String(ap.data.updates?.updatedRange || '').match(/![A-Z]+(\d+)/); return m ? parseInt(m[1]) : null })()

    // "Mes carga" se reescribe como TEXTO con RAW. Si va como número y la celda quedó con
    // formato de fecha, Sheets lee el 8 como 8/1/1900, devuelve "01-1900" y la app termina
    // mostrando el gasto en enero (pasó con el IVA del período 05, 20/8/2026).
    const iMes = headers.indexOf('Mes carga')
    if (filaNum && iMes >= 0) {
      try {
        await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `GASTOS_FIJOS!${colLetra(iMes)}${filaNum}`, valueInputOption: 'RAW', requestBody: { values: [[String(gMes)]] } })
      } catch (e) { console.error('mes carga como texto:', e.message) }
    }

    // Descontar de la cuenta si se pagó.
    // PERO si el pago es de un día ANTERIOR al último saldo cargado desde el banco (o contado en la caja), no se
    // resta: ese saldo ya lo tiene descontado. Ej: el 1/10 se actualiza Efectivo y después se anota un pago del
    // 30/9. Restarlo otra vez dejaría la caja $315.000 abajo de lo que hay.
    let aviso = ''
    if (pagado && cuentaPago) {
      try {
        const rC = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CUENTAS!A:N' })
        const rows = rC.data.values || [], ch = rows[0] || []
        const iN = ch.indexOf('Nombre'), iArs = ch.indexOf('Saldo actual'), iUsd = ch.indexOf('Saldo USD'), iF = ch.indexOf('Última actualización')
        const idx = rows.findIndex((row, i) => i > 0 && String(row[iN] || '').trim().toLowerCase() === String(cuentaPago).trim().toLowerCase())
        const col = moneda === 'USD' ? iUsd : iArs
        const iHist = ch.indexOf('Hist saldos')
        const aFecha = s => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null }
        const ultimaLinea = idx > 0 && iHist >= 0 ? String(rows[idx][iHist] || '').trim().split('\n').filter(Boolean).pop() || '' : ''
        const chequeado = aFecha(ultimaLinea), delPago = aFecha(hoy)
        if (idx > 0 && chequeado && delPago && delPago < chequeado) {
          aviso = `No se restó de ${cuentaPago}: su saldo se actualizó el ${chequeado.getDate()}/${chequeado.getMonth() + 1}, después de este pago, así que ya lo tiene descontado.`
        } else if (idx > 0 && col >= 0) {
          const nuevo = numv(rows[idx][col]) - monto
          const ups = [{ range: `CUENTAS!${colLetra(col)}${idx + 1}`, values: [[nuevo]] }]
          if (iF >= 0) ups.push({ range: `CUENTAS!${colLetra(iF)}${idx + 1}`, values: [[hoy]] })
          await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: ups } })
        }
      } catch (e) { console.error('descuento cuenta gasto-nuevo:', e.message) }
    }

    try {
      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'gasto-nuevo', 'GASTOS_FIJOS', concepto, `${esUnico?'único':'mensual'} ${moneda} ${monto} ${esUnico?`(${gMes}/${gAnio})`:''}${pagado?` · PAGADO ${cuentaPago}`:''}${rubro?` · ${rubro}${subrubro?' / '+subrubro:''}`:''}${nroTrabajo?` · trabajo #${nroTrabajo}`:''}${aviso?' · sin tocar el saldo':''}`]] } })
    } catch (e) {}

    res.json({ ok: true, fila: filaNum, aviso })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
