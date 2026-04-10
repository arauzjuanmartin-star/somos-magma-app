import { google } from 'googleapis'

const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/drive'],
  })
}

export async function getAllData() {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const ranges = ['PRESUPUESTOS!A:Z','PROYECTOS!A:AQ','CARGAR STAFF!A:Z','FACTURACION!A:Z','RRHH!A:Z','Contactos/agencias!A:Z']
  const results = await Promise.all(ranges.map(r => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: r })))
  const toObjects = values => {
    if (!values || values.length < 2) return []
    const headers = values[0]
    return values.slice(1).filter(row => row.some(c => c !== '')).map(row => {
      const obj = {}
      headers.forEach((h, i) => { obj[h] = row[i] || '' })
      return obj
    })
  }
  // Para PROYECTOS: Staff/Precio se repiten 12 veces como headers
  // toObjects normal los aplana -> usar mapeo con contador
  const toProyectos = (values) => {
    if (!values || values.length < 2) return []
    const headers = values[0]
    return values.slice(1).filter(row => row.some(c => c !== '')).map(row => {
      const obj = {}
      let staffN = 0, precioN = 0
      headers.forEach((h, i) => {
        if (h === 'Staff') { staffN++; obj['Staff '+staffN] = row[i] || '' }
        else if (h === 'Precio') { precioN++; obj['Precio '+precioN] = row[i] || '' }
        else { obj[h] = row[i] || '' }
      })
      return obj
    })
  }

  return {
    presupuestos: toObjects(results[0].data.values),
    proyectos: toProyectos(results[1].data.values),
    staff: toObjects(results[2].data.values),
    facturacion: toObjects(results[3].data.values),
    rrhh: toObjects(results[4].data.values),
    contactos: toObjects(results[5].data.values),
  }
}

export async function getSheets() {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  return { sheets, SHEET_ID }
}
