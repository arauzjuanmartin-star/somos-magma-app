import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const colLetra = col => { let s='',c=col+1; while(c>0){c--;s=String.fromCharCode(65+(c%26))+s;c=Math.floor(c/26);} return s }

// Guarda los viáticos de UN trabajo en la columna "Viáticos" de PAGOS_STAFF.
// La llave es la misma con la que se reconoce el pago: persona + mes + N° + servicio.
// Si el trabajo todavía no tiene fila (staff cargado antes de que existiera el upsert),
// la crea Pendiente con el monto adeudado, así el viático no queda flotando en la app.
// Vacío = 0: al poner 0 se limpia la celda.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { mes, persona, nroProyecto, proyecto, pedido, montoAdeudado, viaticos } = req.body || {}
  if (!mes || !persona) return res.status(400).json({ error: 'Faltan mes o persona' })
  const v = Math.round(Number(viaticos) || 0)
  if (v < 0) return res.status(400).json({ error: 'Los viáticos no pueden ser negativos' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PAGOS_STAFF!A:Z' })
    const rows = r.data.values || []
    const headers = rows[0] || []
    const find = (names, def) => { for (const n of names) { const i = headers.findIndex(h => String(h||'').toLowerCase().trim() === n.toLowerCase()); if (i >= 0) return i }; return def }
    const iPersona  = find(['Freelancer','Persona','Nombre','Staff'], 1)
    const iMes      = find(['Mes Referencia','Mes'], 2)
    const iNro      = find(['N° Presupuesto','N° Proyecto','Nro'], 3)
    const iProy     = find(['Proyecto','Descripción'], 4)
    const iPedido   = find(['Servicio','Pedido'], 5)
    const iAdeudado = find(['Monto Adeudado','Monto','Total'], 6)
    const iEstado   = find(['Estado','Pagado'], 10)
    const iViaticos = find(['Viáticos','Viaticos'], -1)
    if (iViaticos === -1) return res.status(400).json({ error: 'Falta la columna "Viáticos" en PAGOS_STAFF. Corré: node scripts/pagos-staff-columna-viaticos.mjs --escribir' })

    const eq = (a,b) => String(a||'').trim().toLowerCase() === String(b||'').trim().toLowerCase()
    const PAG = x => ['PAGADO','SÍ','SI','TRUE'].includes(String(x||'').toUpperCase())
    const matches = rows.map((row,i)=>({row,i})).filter(({row,i}) => i > 0 &&
      eq(row[iMes], mes) && eq(row[iPersona], persona) &&
      (!nroProyecto || eq(row[iNro], nroProyecto)) && (!pedido || eq(row[iPedido], pedido))
    )
    // Primero una fila pendiente (es la que se va a pagar); si no hay, la que exista.
    const target = matches.find(m => !PAG(m.row[iEstado])) || matches[0] || null

    if (target) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID, range: `PAGOS_STAFF!${colLetra(iViaticos)}${target.i + 1}`,
        valueInputOption: 'USER_ENTERED', requestBody: { values: [[v || '']] },
      })
    } else if (v > 0) {
      const maxCol = Math.max(iPersona, iMes, iNro, iProy, iPedido, iAdeudado, iEstado, iViaticos) + 1
      const newRow = new Array(maxCol).fill('')
      newRow[iPersona]  = persona
      newRow[iMes]      = mes
      if (nroProyecto) newRow[iNro] = nroProyecto
      if (proyecto)    newRow[iProy] = proyecto
      if (pedido)      newRow[iPedido] = pedido
      newRow[iAdeudado] = Number(montoAdeudado) || ''
      newRow[iEstado]   = 'Pendiente'
      newRow[iViaticos] = v
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'PAGOS_STAFF!A:Z',
        valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [newRow] },
      })
    } else {
      return res.json({ ok: true, noop: true, viaticos: 0 })
    }

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'pago-staff-viaticos', 'PAGOS_STAFF', `${mes} ${persona} #${nroProyecto||'?'} ${pedido||''}`, `viaticos=${v}${target?'':' (fila nueva)'}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, viaticos: v, creada: !target })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
