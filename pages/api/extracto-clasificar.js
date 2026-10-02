// Revisar a mano un movimiento del banco que quedó "Para revisar" en MOVIMIENTOS_BANCO: decir qué es.
//
// Lo que hace SIEMPRE: anota en la fila del movimiento qué es (columna "Qué es"), a qué solapa y fila corresponde
// y lo deja como "Clasificado a mano". Lo que hace SOLO si se pide (marcar): pone como pagado, con la fecha del
// banco, el gasto fijo, la cuota o el resumen de tarjeta con que se lo unió, si todavía figuraba sin pagar.
//
// Los cobros de facturas NO se marcan acá: la pantalla llama antes a /api/factura-cobro (modo historico: no toca
// saldos) por cada factura sin cobrar, y después viene acá a unir el movimiento. Una factura que ya figuraba
// cobrada no se vuelve a cobrar: solo queda unida.
//
// NUNCA suma ni resta saldos: la plata ya se movió en el banco y el saldo lo trae el extracto.
// accion 'reabrir' devuelve el movimiento a "Para revisar" (no deshace lo que se haya marcado).
import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const HOJA = 'MOVIMIENTOS_BANCO'
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const txt = v => String(v ?? '').trim()
const num = v => parseFloat(String(v ?? '').replace(/[$,\s]/g, '')) || 0
const si = v => v === true || /^(s[ií]|true)$/i.test(txt(v))
// Un texto que empieza con = + - @ el sheet lo toma como fórmula y deja #ERROR!. Y un número suelto no es un monto.
const texto = v => { const s = txt(v); return s ? `'${s}` : '' }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { fila, clave, accion = 'clasificar', queEs, tipo, hoja = '', ref = '', marcar = null, staff = null } = req.body || {}
  if (!Number.isInteger(fila) || fila < 2) return res.status(400).json({ error: 'Falta la fila del movimiento' })
  if (!txt(clave)) return res.status(400).json({ error: 'Falta la clave del movimiento' })
  if (accion !== 'reabrir' && !txt(queEs)) return res.status(400).json({ error: 'Falta decir qué es' })
  if (marcar && !['GASTOS_FIJOS', 'PRESTAMOS', 'TARJETAS'].includes(marcar.hoja)) return res.status(400).json({ error: 'No se puede marcar en esa solapa' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const leer = rango => withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: rango }))
    const [rH, rF] = await Promise.all([leer(`${HOJA}!1:1`), leer(`${HOJA}!A${fila}:O${fila}`)])
    const H = (rH.data.values?.[0] || []).map(txt), mov = rF.data.values?.[0] || []
    const col = n => H.indexOf(n), val = n => txt(mov[col(n)])
    const faltan = ['Cuenta', 'Fecha', 'Qué es', 'Estado', 'Hoja', 'Ref', 'Clave'].filter(c => col(c) < 0)
    if (faltan.length) return res.status(400).json({ error: `A la solapa ${HOJA} le faltan columnas: ${faltan.join(', ')}` })
    // La fila tiene que seguir siendo ESE movimiento: si alguien ordenó o borró filas en el sheet, no se toca nada.
    if (val('Clave') !== txt(clave)) return res.status(409).json({ error: 'El movimiento cambió de lugar en el sheet. Actualizá la página y volvé a intentar.' })

    const updates = []
    const poner = (hojaX, filaX, cab, campo, valor) => { const i = cab.indexOf(campo); if (i >= 0) updates.push({ range: `${hojaX}!${colLetra(i)}${filaX}`, values: [[valor]] }) }
    let marcado = ''

    if (accion === 'reabrir') {
      poner(HOJA, fila, H, 'Estado', 'Para revisar'); poner(HOJA, fila, H, 'Hoja', ''); poner(HOJA, fila, H, 'Ref', '')
    } else {
      const cuenta = val('Cuenta'), fecha = val('Fecha'), monto = num(val('Salió')) || num(val('Entró'))
      // ---- Un pago a un freelancer: sus líneas de PAGOS_STAFF que estaban pendientes quedan pagadas, con la fecha y la
      //      cuenta del movimiento. Antes de escribir se comprueba que cada fila siga siendo de esa persona.
      if (staff && Array.isArray(staff.filas) && staff.filas.length) {
        const rowsS = (await leer('PAGOS_STAFF!A:P')).data.values || [], cabS = (rowsS[0] || []).map(txt)
        const iP = cabS.indexOf('Freelancer'), iE = cabS.indexOf('Estado'), iA = cabS.indexOf('Monto Adeudado'), iV = cabS.indexOf('Viáticos')
        if (iP < 0 || iE < 0 || iA < 0 || cabS.indexOf('Fecha Pago') < 0 || cabS.indexOf('Monto Pagado') < 0) return res.status(400).json({ error: 'PAGOS_STAFF no tiene las columnas esperadas' })
        // "Somos Magma" no es una persona: es la línea del fee, y no se paga (misma regla que lib/staff.js).
        if (/somos magma|^magma$/i.test(txt(staff.persona))) return res.status(400).json({ error: 'La línea de Somos Magma no es un pago a un freelancer' })
        // Mismo nombre aunque cambien las mayúsculas, las tildes o un espacio de más
        const igualNombre = s => txt(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
        const iN = cabS.indexOf('Notas')
        const hechas = []
        for (const f of staff.filas) {
          const row = Number.isInteger(f) && f > 1 ? rowsS[f - 1] : null
          if (!row || igualNombre(row[iP]) !== igualNombre(staff.persona)) return res.status(409).json({ error: 'Las líneas de Pagos Staff cambiaron de lugar en el sheet. Actualizá la página y volvé a intentar.' })
          if (/^(pagado|s[ií]|true)$/i.test(txt(row[iE]))) continue   // ya figuraba pagada: solo queda unida
          poner('PAGOS_STAFF', f, cabS, 'Fecha Pago', fecha); poner('PAGOS_STAFF', f, cabS, 'Monto Pagado', Math.round((num(row[iA]) * (staff.conIVA ? 1.21 : 1) + (iV >= 0 ? num(row[iV]) : 0)) * 100) / 100)
          // Pagado con IVA (el banco muestra el honorario + 21%): queda dicho en Notas, como cuando se tilda en Pagos Staff
          if (staff.conIVA && iN >= 0 && !/IVA 21%/i.test(txt(row[iN]))) poner('PAGOS_STAFF', f, cabS, 'Notas', texto([txt(row[iN]), 'Pago con IVA 21% (según el extracto del banco)'].filter(Boolean).join(' · ')))
          poner('PAGOS_STAFF', f, cabS, 'Cuenta', cuenta); poner('PAGOS_STAFF', f, cabS, 'Estado', 'Pagado')
          hechas.push(f)
        }
        if (hechas.length) marcado = `${hechas.length} ${hechas.length === 1 ? 'línea' : 'líneas'} de ${txt(staff.persona)} en Pagos Staff`
      }
      // ---- Marcar pagado lo que se unió (si todavía no lo estaba), con la fecha y la cuenta del movimiento
      if (marcar) {
        const [rH2, rD] = await Promise.all([leer(`${marcar.hoja}!1:1`), leer(`${marcar.hoja}!A${marcar.fila}:Z${marcar.fila}`)])
        const cab = (rH2.data.values?.[0] || []).map(txt), dest = rD.data.values?.[0] || []
        const d = n => txt(dest[cab.indexOf(n)])
        if (!dest.length) return res.status(404).json({ error: 'No encontré lo que elegiste. Actualizá la página y volvé a intentar.' })
        if (marcar.hoja === 'GASTOS_FIJOS') {
          const unico = /[uú]nico/i.test(d('Frecuencia'))
          const f = fecha.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
          const mesKey = txt(marcar.mesKey) || (f ? `${+f[2]}/${f[3]}` : '')
          const lista = d('Meses pagados').split(',').map(s => s.trim()).filter(Boolean)
          const yaPagado = unico ? si(d('Pagado')) : lista.includes(mesKey)
          if (!yaPagado) {
            if (mesKey && !lista.includes(mesKey)) lista.push(mesKey)
            poner(marcar.hoja, marcar.fila, cab, 'Meses pagados', `'${lista.join(', ')}`)
            poner(marcar.hoja, marcar.fila, cab, 'Pagado', 'SI'); poner(marcar.hoja, marcar.fila, cab, 'Fecha pago', fecha); poner(marcar.hoja, marcar.fila, cab, 'Cuenta pago', cuenta)
            marcado = `${d('Concepto')}${unico ? '' : ` (${mesKey})`}`
          }
        } else if (!si(d('Pagado'))) {
          poner(marcar.hoja, marcar.fila, cab, 'Pagado', 'SI'); poner(marcar.hoja, marcar.fila, cab, 'Fecha pago', fecha); poner(marcar.hoja, marcar.fila, cab, 'Cuenta pago', cuenta)
          if (marcar.hoja === 'TARJETAS') poner(marcar.hoja, marcar.fila, cab, 'Monto pagado', monto)
          marcado = marcar.hoja === 'PRESTAMOS' ? `Préstamo ${d('Prestamo')} ${d('Cuota nro')}` : `${d('Tarjeta')} ${d('Mes')}/${d('Año')}`
        }
      }
      poner(HOJA, fila, H, 'Qué es', texto(queEs)); poner(HOJA, fila, H, 'Estado', 'Clasificado a mano')
      poner(HOJA, fila, H, 'Hoja', txt(hoja)); poner(HOJA, fila, H, 'Ref', texto(ref))
      if (txt(tipo)) poner(HOJA, fila, H, 'Tipo', txt(tipo))
    }
    await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates } }))

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, accion === 'reabrir' ? 'extracto-reabrir' : 'extracto-clasificar', HOJA, String(fila), `${val('Cuenta')} ${val('Fecha')} ${val('Entró') || '-' + val('Salió')} → ${accion === 'reabrir' ? 'vuelve a Para revisar' : txt(queEs)}${hoja ? ` (${hoja} ${ref})` : ''}${marcado ? ` · marcado pagado: ${marcado}` : ''}`.slice(0, 900)]] },
      })
    } catch (e) {}

    res.json({ ok: true, marcado })
  } catch (e) {
    console.error('extracto-clasificar:', e)
    const status = e.code || e.response?.status
    if (status === 429) return res.status(429).json({ error: 'Google está limitando los pedidos. Esperá 30 segundos y volvé a intentar.' })
    res.status(500).json({ error: e.message })
  }
}
