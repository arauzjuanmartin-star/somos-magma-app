import { getSheets } from '../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

export const config = { api: { bodyParser: { sizeLimit: '5mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

  const { tarjeta, mes, anio, movimientos } = req.body
  if (!tarjeta || !mes || !anio || !Array.isArray(movimientos)) return res.status(400).json({ error: 'Faltan campos' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const filas = movimientos.map(m => [
      tarjeta, mes, anio,
      m.fecha || '',
      m.descripcion || '',
      m.comercio || '',
      m.moneda || 'ARS',
      Number(m.monto) || 0,
      m.categoria || 'Otros',
      m.subcategoria || '',
      mail,
      m.notas || '',
    ])

    if (filas.length === 0) return res.status(400).json({ error: 'Sin movimientos para guardar' })

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'MOVIMIENTOS_TARJETA!A:L',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: filas },
    })

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'tarjeta-guardar', 'MOVIMIENTOS_TARJETA', tarjeta, `${filas.length} movs · ${mes}/${anio}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, guardados: filas.length })
  } catch(e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
