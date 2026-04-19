import { getSheets } from '../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

// Estructura real de PRESUPUESTOS:
// 0 Columna 1 | 1 Fecha Evento | 2 PM Interno | 3 Estado | 4 Agencia | 5 Cliente
// 6 Proyecto | 7 Cant. Fechas | 8 Precio Final | 9 Fecha Presupuesto | 10 Contacto
// 11-34 Pedido 1..12 + Precio 1..12
// 35 Otros | 36 Precio (otros) | 37 Descuento | 38 Subtotal | 39 Fee Agencia
// 40 Impuesto a las ganancias | 41 IIBB | 42 Plazo | 43 Interes %
// 44 Interes $ | 45 Total | 46 Ajuste

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  if (mail && !MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

  const p = req.body
  try {
    const { sheets, SHEET_ID } = await getSheets()
    const now = new Date()
    const fechaHoy = now.toLocaleDateString('es-AR')

    const row = new Array(47).fill('')
    row[0] = p['Columna 1'] || ''
    row[1] = p['Fecha Evento'] || ''
    row[2] = p['PM Interno'] || ''
    row[3] = p['Estado'] || 'EN ESPERA'
    row[4] = p['Agencia'] || ''
    row[5] = p['Cliente'] || ''
    row[6] = p['Proyecto'] || ''
    row[7] = p['Cant. Fechas'] || p['Cantidad de fechas'] || ''
    row[8] = p['Precio Final'] || 0
    row[9] = p['Fecha Presupuesto'] || fechaHoy
    row[10] = p['Contacto'] || ''

    for (let i = 1; i <= 12; i++) {
      row[11 + (i - 1) * 2] = p[`Pedido ${i}`] || ''
      row[12 + (i - 1) * 2] = p[`Precio ${i}`] || ''
    }

    row[35] = p['Otros'] || ''
    row[36] = p['Precio Otros'] || ''
    row[37] = p['Descuento'] || ''
    row[38] = p['Subtotal'] || 0
    row[39] = p['Fee Agencia'] || 0
    row[40] = p['Impuesto a las ganancias'] || 0
    row[41] = p['IIBB'] || 0
    row[42] = p['Plazo'] || ''
    row[43] = p['Interes %'] || ''
    row[44] = p['Interes $'] || 0
    row[45] = p['Total'] || p['Precio Final'] || 0
    row[46] = p['Ajuste'] || 0

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'PRESUPUESTOS!A:A',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    })

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'presupuesto-nuevo', 'PRESUPUESTOS', String(row[0]), `cliente=${row[5]} agencia=${row[4]} total=${row[45]}`]] },
      })
    } catch (e) {}

    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
