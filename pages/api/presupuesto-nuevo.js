import { getSheets } from '../../lib/sheets'

const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const p = req.body
  try {
    const { sheets, SHEET_ID } = await getSheets()
    const now = new Date()
    const mesActual = `${String(now.getMonth()+1).padStart(2,'0')} - ${MESES[now.getMonth()]}`

    const row = [
      p['Columna 1'] || '',
      p['Fecha Evento'] || '',
      p['PM Interno'] || '',
      p['Estado'] || 'EN ESPERA',
      p['Agencia'] || '',
      p['Cliente'] || '',
      p['Proyecto'] || '',
      '',
      p['Precio Final'] || 0,
      now.toLocaleDateString('es-AR'),
      p['Contacto'] || '',
    ]

    // Agregar pedidos (hasta 12)
    for (let i = 1; i <= 12; i++) {
      row.push(p[`Pedido ${i}`] || '')
      row.push(p[`Precio ${i}`] || '')
    }

    row.push(p['PM Interno'] || '')

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'PRESUPUESTOS!A:A',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] }
    })

    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
