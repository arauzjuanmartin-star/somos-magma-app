import { google } from 'googleapis'

const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { num, staffData } = req.body
  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:BZ' })
    const rows = r.data.values
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Hoja vacía' })
    const headers = rows[0]
    const colNum = headers.indexOf('N° presupuesto')
    let rowIndex = -1
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][colNum]) === String(num)) { rowIndex = i + 1; break }
    }
    if (rowIndex === -1) return res.status(404).json({ error: 'Proyecto no encontrado' })
    const data = []
    const colCarga = headers.indexOf('Carga Staff')
    if (colCarga >= 0) data.push({ range: 'PROYECTOS!' + colToLetter(colCarga) + rowIndex, values: [[true]] })
    staffData.forEach((s, idx) => {
      const staffKey = idx === 0 ? 'Staff' : 'Staff ' + (idx + 1)
      const precioKey = idx === 0 ? 'Precio' : 'Precio ' + (idx + 1)
      const colStaff = headers.indexOf(staffKey)
      const colPrecio = headers.indexOf(precioKey)
      if (colStaff >= 0 && s.nombre) data.push({ range: 'PROYECTOS!' + colToLetter(colStaff) + rowIndex, values: [[s.nombre]] })
      if (colPrecio >= 0 && s.monto) data.push({ range: 'PROYECTOS!' + colToLetter(colPrecio) + rowIndex, values: [[s.monto]] })
    })
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data } })
    res.json({ ok: true })
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }) }
}
function colToLetter(col) {
  let s = ''; col++
  while (col > 0) { col--; s = String.fromCharCode(65 + (col % 26)) + s; col = Math.floor(col / 26) }
  return s
}
