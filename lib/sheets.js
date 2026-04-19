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
  const ranges = ['PRESUPUESTOS!A:AV','PROYECTOS!A:AQ','CARGAR STAFF!A:Z','FACTURACION!A:Z','RRHH!A:Z','Contactos/agencias!A:Z','PAGOS_STAFF!A:L','SUELDOS!A:J','LOG!A:F','COSTOS_PROYECTO!A:H','CUENTAS!A:H','RESERVAS!A:I','HISTORICO_2023!A:Z','HISTORICO_2024!A:Z','HISTORICO_2025!A:Z']
  const fetchRange = async r => {
    try { return await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: r }) }
    catch (e) { if (String(e?.message || '').includes('Unable to parse range')) return { data: { values: [] } }; throw e }
  }
  const results = await Promise.all(ranges.map(fetchRange))
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

  // Para PRESUPUESTOS: Pedido y/o Precio pueden estar repetidos bare (sin número)
  // Renumeramos ambos por posición si están duplicados
  const toPresupuestos = (values) => {
    if (!values || values.length < 2) return []
    const headers = values[0].map(h => String(h||''))
    // Detectar si Pedido o Precio están repetidos
    const pedidoCount = headers.filter(h => h.trim() === 'Pedido').length
    const precioCount = headers.filter(h => h.trim() === 'Precio').length
    return values.slice(1).filter(row => row.some(c => c !== '')).map(row => {
      const obj = {}
      let pedN = 0, prcN = 0
      headers.forEach((h, i) => {
        const ht = h.trim()
        if (ht === 'Pedido' && pedidoCount > 1) { pedN++; obj['Pedido '+pedN] = row[i] || '' }
        else if (ht === 'Precio' && precioCount > 1) { prcN++; obj['Precio '+prcN] = row[i] || '' }
        else { obj[h] = row[i] || '' }
      })
      return obj
    })
  }

  return {
    presupuestos: toPresupuestos(results[0].data.values),
    proyectos: toProyectos(results[1].data.values),
    staff: toObjects(results[2].data.values),
    facturacion: toObjects(results[3].data.values),
    rrhh: toObjects(results[4].data.values),
    contactos: toObjects(results[5].data.values),
    pagosStaff: toObjects(results[6].data.values),
    sueldos: toObjects(results[7].data.values),
    log: toObjects(results[8].data.values),
    costosProyecto: toObjects(results[9].data.values),
    cuentas: toObjects(results[10].data.values),
    reservas: toObjects(results[11].data.values),
    historico2023: toObjects(results[12].data.values),
    historico2024: toObjects(results[13].data.values),
    historico2025: toObjects(results[14].data.values),
  }
}

export async function getSheets() {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  return { sheets, SHEET_ID }
}
