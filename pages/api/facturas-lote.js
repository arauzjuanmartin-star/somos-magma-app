import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { ubicarFilaFactura } from '../../lib/factura-fila'

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

// Lo que se puede cambiar de a varias facturas juntas. Lista cerrada a propósito: por acá
// no se tocan montos ni cobros, solo el seguimiento (si salió, y qué prometió el cliente).
const CAMPOS = ['Fc Enviada', 'Fecha enviada', 'Prometió pagar', 'Nota cobranza']

/**
 * Cambia el mismo dato en varias facturas de una sola vez.
 * Casos: marcar como enviadas las que salieron por fuera de la app, y anotar la fecha
 * que prometió una agencia para todo lo que debe.
 *
 * Body: { filas: [{ fila, presupuestoNum, cambios? }], cambios: {campo: valor}, accion }
 * `cambios` de cada fila pisa al general (ej: la fecha de envío de cada factura).
 * Es todo o nada: si una fila no se puede ubicar, no se escribe ninguna.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { filas, cambios = {}, accion = 'lote' } = req.body || {}
  if (!Array.isArray(filas) || filas.length === 0) return res.status(400).json({ error: 'No hay facturas para cambiar' })
  if (filas.length > 80) return res.status(400).json({ error: 'Son demasiadas facturas juntas (máximo 80)' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AJ' }))
    const rows = r.data.values || []
    const headers = rows[0] || []

    const updates = []
    const nros = []
    for (const it of filas) {
      const ubic = ubicarFilaFactura({ rows, fila: it.fila, presupuestoNum: it.presupuestoNum })
      if (ubic.error) return res.status(ubic.ambigua ? 409 : 404).json({ error: ubic.error })
      const todos = { ...cambios, ...(it.cambios || {}) }
      for (const [campo, valor] of Object.entries(todos)) {
        if (!CAMPOS.includes(campo)) return res.status(400).json({ error: `"${campo}" no se puede cambiar de a varias facturas` })
        const idx = headers.indexOf(campo)
        // Sin la columna el dato no quedaría en el sheet: mejor frenar que hacer como que se guardó.
        if (idx === -1) return res.status(400).json({ error: `FACTURACION no tiene la columna "${campo}". Hay que agregarla antes de usar esto.` })
        // Una nota que empieza con = + - @ el sheet la toma como fórmula y deja #ERROR! (ya pasó con el "+"
        // de los teléfonos). Con el apóstrofo adelante queda como texto.
        const esTexto = campo === 'Nota cobranza' && /^[=+\-@]/.test(String(valor))
        updates.push({ range: `FACTURACION!${colLetra(idx)}${ubic.fila}`, values: [[esTexto ? `'${valor}` : valor]] })
      }
      nros.push(String(it.presupuestoNum || ubic.fila))
    }
    if (updates.length === 0) return res.json({ ok: true, filas: 0, msg: 'Nada para cambiar' })

    await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
    }))

    try {
      const campos = [...new Set(filas.flatMap(it => Object.keys({ ...cambios, ...(it.cambios || {}) })))]
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'facturas-lote', 'FACTURACION', String(accion).slice(0, 60), `${filas.length} facturas (#${nros.join(', #')}) campos=${campos.join(',')}`.slice(0, 900)]] },
      })
    } catch (e) {}

    res.json({ ok: true, filas: filas.length })
  } catch (e) {
    console.error('Error facturas-lote:', e)
    const status = e.code || e.response?.status
    if (status === 429) return res.status(429).json({ error: 'Google está limitando los pedidos. Esperá 30 segundos y volvé a intentar.' })
    res.status(500).json({ error: e.message })
  }
}
