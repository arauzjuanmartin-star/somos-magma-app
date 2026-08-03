import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

// Registra un movimiento entre un socio y Magma en SOCIOS_MOVIMIENTOS.
// Es la forma correcta de anotar que un socio sacó o puso plata: NO hay que
// editar el "Sueldo X" de GASTOS_FIJOS, que es el compromiso mensual y si se
// pisa con lo que se pagó, la estructura fija queda mal.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return

  const { socio, tipo, monto, concepto, fecha, moneda } = req.body
  if (!socio || !tipo || !monto) return res.status(400).json({ error: 'Faltan socio, tipo o monto' })
  const n = Number(monto)
  if (!isFinite(n) || n <= 0) return res.status(400).json({ error: 'El monto tiene que ser un número mayor a cero' })
  // "sacó" = Magma le dio plata al socio · "puso" = el socio le dio plata a Magma
  const dir = tipo === 'saco' ? 'Magma→Socio' : 'Socio→Magma'

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const cur = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SOCIOS_MOVIMIENTOS!A:J' })).data.values || []
    const h = cur[0] || []
    const fila = new Array(Math.max(h.length, 10)).fill('')
    const put = (nombre, valor, idx) => { const i = h.indexOf(nombre); fila[i !== -1 ? i : idx] = valor }
    const hoy = new Date()
    const f = fecha || `${hoy.getDate()}/${hoy.getMonth()+1}/${hoy.getFullYear()}`
    put('Fecha', f, 0)
    put('Socio', socio, 1)
    put('Dirección', dir, 2)
    put('Concepto', concepto || (tipo === 'saco' ? 'Retiro' : 'Aporte a Magma'), 3)
    put('Monto', n, 4)
    put('Fuente', `Cargado desde la app por ${auth.mail}`, 8)
    put('Moneda', (moneda || 'ARS').toUpperCase(), 9)
    await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'SOCIOS_MOVIMIENTOS!A:J',
      valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: [fila] } })

    try {
      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), auth.mail, 'socio-movimiento', 'SOCIOS_MOVIMIENTOS', socio, `${dir} ${n} · ${concepto || ''}`]] } })
    } catch (e) {}

    res.json({ ok: true })
  } catch (e) {
    console.error('socio-movimiento', e)
    res.status(500).json({ error: e.message })
  }
}
