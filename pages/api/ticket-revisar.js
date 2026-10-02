// Administración revisa un ticket que cargó un freelancer desde Mi Magma (solapa TICKETS, ver lib/tickets.mjs).
//
//   aprobar   → el monto se SUMA a los viáticos de ese trabajo en PAGOS_STAFF (columna "Viáticos"), en la fila de esa
//               persona + mes + N° + servicio, y el ticket queda "Aprobado". Se le paga el 15 con sus trabajos.
//               Si ese trabajo ya se le pagó, NO se toca Pagos Staff: se avisa para pagarle el ticket aparte.
//   rechazar  → queda "Rechazado" con el motivo (la persona lo ve en Mi Magma).
//   aparte    → "Pagado aparte": se le transfirió por fuera del pago del 15 (se anota con "¿Pagaste algo?").
//
// Un ticket se revisa una sola vez: si ya no está "Pendiente" no se hace nada. Y el ID del ticket queda escrito en las
// Notas de la fila de Pagos Staff: si un reintento llega dos veces, no se suma dos veces.
// No toca saldos de cuentas: la plata sale cuando se paga el 15 (o cuando se anota el pago aparte).
import { getSheets, getAllData, withSheetsRetry } from '../../lib/sheets'
import { lineasDeProyecto } from '../../lib/jornadas'
import { requireAuth } from '../../lib/auth-helpers'
import { canonStaff, canonKey } from '../../lib/staff'
import { HOJA_TICKETS } from '../../lib/tickets.mjs'

const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const txt = v => String(v ?? '').trim()
const num = v => parseFloat(String(v ?? '').replace(/[$,\s]/g, '')) || 0
const norm = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const texto = v => { const s = txt(v); return s ? `'${s}` : '' }
const PAGADO = x => ['PAGADO', 'SÍ', 'SI', 'TRUE'].includes(txt(x).toUpperCase())

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { id, accion, monto, motivo = '' } = req.body || {}
  if (!txt(id)) return res.status(400).json({ error: 'Falta el ticket' })
  if (!['aprobar', 'rechazar', 'aparte'].includes(accion)) return res.status(400).json({ error: 'Acción inválida' })
  if (accion === 'rechazar' && !txt(motivo)) return res.status(400).json({ error: 'Escribí por qué no se aprueba: la persona lo va a leer' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const leer = rango => withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: rango }))
    const tRows = (await leer(`${HOJA_TICKETS}!A:P`)).data.values || [], TH = (tRows[0] || []).map(txt)
    const tc = n => TH.indexOf(n)
    const faltan = ['ID', 'Persona', 'N° trabajo', 'Servicio', 'Mes Referencia', 'Monto', 'Estado', 'Revisó', 'Revisado el', 'Motivo'].filter(c => tc(c) < 0)
    if (faltan.length) return res.status(400).json({ error: `A la solapa ${HOJA_TICKETS} le faltan columnas: ${faltan.join(', ')}` })
    const iT = tRows.findIndex((r, i) => i > 0 && txt(r[tc('ID')]) === txt(id))
    if (iT < 0) return res.status(404).json({ error: 'No encontré ese ticket. Actualizá la página.' })
    const t = tRows[iT], filaT = iT + 1, val = n => txt(t[tc(n)])
    if (val('Estado') && !/^pendiente$/i.test(val('Estado'))) return res.status(409).json({ error: `Ese ticket ya figura como "${val('Estado')}". Actualizá la página.` })

    const ar = new Date(Date.now() - 3 * 3600e3)   // hora de Argentina
    const cuando = `${ar.getUTCDate()}/${ar.getUTCMonth() + 1}/${ar.getUTCFullYear()}`
    const updates = []
    const ponerT = (campo, valor) => updates.push({ range: `${HOJA_TICKETS}!${colLetra(tc(campo))}${filaT}`, values: [[valor]] })
    const persona = val('Persona'), nro = val('N° trabajo'), servicio = val('Servicio'), mes = val('Mes Referencia')
    const m = Math.round(num(monto) > 0 ? num(monto) : num(val('Monto')))
    let detalle = ''

    if (accion === 'rechazar') {
      ponerT('Estado', 'Rechazado'); ponerT('Motivo', texto(motivo))
    } else if (accion === 'aparte') {
      ponerT('Estado', 'Pagado aparte'); if (m !== Math.round(num(val('Monto')))) ponerT('Monto', m)
    } else {
      if (!(m > 0)) return res.status(400).json({ error: 'El ticket no tiene monto' })
      // ---- La fila de Pagos Staff de ese trabajo: misma llave que usa toda la app (persona + mes + N° + servicio)
      const rows = (await leer('PAGOS_STAFF!A:Z')).data.values || [], PH = (rows[0] || []).map(txt)
      const find = (...names) => { for (const n of names) { const i = PH.findIndex(h => h.toLowerCase() === n.toLowerCase()); if (i >= 0) return i } return -1 }
      const iPersona = find('Freelancer', 'Persona'), iMes = find('Mes Referencia', 'Mes'), iNro = find('N° Presupuesto', 'N° Proyecto'), iProy = find('Proyecto'), iPedido = find('Servicio', 'Pedido')
      const iAdeudado = find('Monto Adeudado'), iEstado = find('Estado'), iViaticos = find('Viáticos', 'Viaticos'), iNotas = find('Notas'), iPeriodo = find('Período', 'Periodo')
      if ([iPersona, iMes, iNro, iPedido, iEstado, iViaticos, iNotas].some(i => i < 0)) return res.status(400).json({ error: 'PAGOS_STAFF no tiene las columnas esperadas (Freelancer, Mes Referencia, N° Presupuesto, Servicio, Estado, Viáticos, Notas)' })
      const mismaPersona = x => canonKey(canonStaff(x)) === canonKey(canonStaff(persona))
      const suyas = rows.map((row, i) => ({ row, i })).filter(({ row, i }) => i > 0 && mismaPersona(row[iPersona]) && norm(row[iMes]) === norm(mes) && txt(row[iNro]) === nro && norm(row[iPedido]) === norm(servicio))
      // ¿Ya se sumó este ticket? (un reintento después de un corte)
      const yaSumado = suyas.find(x => txt(x.row[iNotas]).includes(txt(id)))
      const target = yaSumado || suyas.find(x => !PAGADO(x.row[iEstado]))
      if (!yaSumado && !target && suyas.length) {
        // Ese trabajo ya se le pagó: sumarle viáticos a una fila pagada no le paga nada. Hay que pagarle el ticket aparte.
        return res.status(409).json({ yaPagado: true, error: `A ${persona} ya se le pagó ese trabajo (${mes}). Transferile el ticket aparte, anotalo con "¿Pagaste algo?" poniendo el trabajo #${nro}, y después tocá "Lo pagué aparte".` })
      }
      const notaTicket = `Ticket ${val('Qué fue') || ''} $${m.toLocaleString('es-AR')} (${txt(id)})`.replace(/\s+/g, ' ')
      if (target && !yaSumado) {
        const fila = target.i + 1, previo = num(target.row[iViaticos])
        updates.push({ range: `PAGOS_STAFF!${colLetra(iViaticos)}${fila}`, values: [[previo + m]] })
        updates.push({ range: `PAGOS_STAFF!${colLetra(iNotas)}${fila}`, values: [[texto([txt(target.row[iNotas]), notaTicket].filter(Boolean).join(' · '))]] })
        detalle = `viáticos ${previo} → ${previo + m} en la fila ${fila} de PAGOS_STAFF`
      } else if (!yaSumado) {
        // Todavía no hay fila de ese trabajo en Pagos Staff: se crea Pendiente, con lo que se le debe por el trabajo.
        const data = await getAllData()
        const p = (data.proyectos || []).find(x => txt(x['N° presupuesto']) === nro)
        const linea = p ? lineasDeProyecto(p).find(l => mismaPersona(l.nombre) && norm(l.pedido) === norm(servicio)) : null
        if (!linea) return res.status(409).json({ error: `Ese trabajo (#${nro}) ya no figura a nombre de ${persona} en Proyectos. Revisalo antes de aprobar.` })
        // Dentro de las columnas de datos y sin INSERT_ROWS: "Período" tiene fórmula por fila (mismo criterio que pago-staff-viaticos).
        const ancho = iPeriodo > 0 ? iPeriodo : PH.length
        const nueva = new Array(ancho).fill('')
        nueva[iPersona] = texto(linea.nombre); nueva[iMes] = texto(mes); nueva[iNro] = texto(nro); if (iProy >= 0) nueva[iProy] = texto(linea.proyecto); nueva[iPedido] = texto(linea.pedido)
        if (iAdeudado >= 0) nueva[iAdeudado] = linea.precio || ''
        nueva[iEstado] = 'Pendiente'; nueva[iViaticos] = m; nueva[iNotas] = texto(notaTicket)
        await withSheetsRetry(() => sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: `PAGOS_STAFF!A:${colLetra(ancho - 1)}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [nueva] } }))
        detalle = `fila nueva en PAGOS_STAFF con viáticos ${m}`
      } else detalle = 'ya estaba sumado en PAGOS_STAFF (reintento)'
      ponerT('Estado', 'Aprobado'); if (m !== Math.round(num(val('Monto')))) ponerT('Monto', m)
    }
    ponerT('Revisó', texto(mail)); ponerT('Revisado el', cuando)
    // Justo antes de escribir se vuelve a mirar el ticket: si otra persona lo revisó en el medio, no se hace nada
    // (dos aprobaciones a la vez sumarían los viáticos dos veces).
    const ahora = txt(((await leer(`${HOJA_TICKETS}!${colLetra(tc('Estado'))}${filaT}`)).data.values || [[]])[0]?.[0])
    if (ahora && !/^pendiente$/i.test(ahora)) return res.status(409).json({ error: `Ese ticket ya figura como "${ahora}". Actualizá la página.` })
    // El ticket y los viáticos, en un solo pedido: o quedan los dos o ninguno.
    await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates } }))

    try { await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, `ticket-${accion}`, HOJA_TICKETS, txt(id), `${persona} #${nro} ${val('Qué fue')} $${m}${detalle ? ` · ${detalle}` : ''}${txt(motivo) ? ` · motivo: ${txt(motivo)}` : ''}`.slice(0, 900)]] } }) } catch (e) { /* el log no frena */ }

    res.json({ ok: true, accion, monto: m, detalle })
  } catch (e) {
    console.error('ticket-revisar:', e)
    const status = e.code || e.response?.status
    if (status === 429) return res.status(429).json({ error: 'Google está limitando los pedidos. Esperá 30 segundos y volvé a intentar.' })
    res.status(500).json({ error: e.message })
  }
}
