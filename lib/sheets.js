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

// Retry centralizado para todas las llamadas a Sheets/Drive.
// Maneja 429 (rate limit) y 503 (servicio sobrecargado) con backoff exponencial + jitter.
// Tras 5 intentos rinde, lanza error.
export async function withSheetsRetry(fn, intentos = 5) {
  let ultErr
  for (let i = 0; i < intentos; i++) {
    try { return await fn() }
    catch (e) {
      ultErr = e
      const status = e.code || e.response?.status
      const reintentable = status === 429 || status === 503 || status === 502 || status === 500
      if (reintentable && i < intentos - 1) {
        // Backoff exponencial: 500ms, 1s, 2s, 4s, con jitter random
        const base = 500 * Math.pow(2, i)
        const jitter = Math.random() * 300
        await new Promise(r => setTimeout(r, base + jitter))
        continue
      }
      throw e
    }
  }
  throw ultErr
}

export async function getAllData() {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  // PROYECTOS: rango AMPLIADO de A:AQ (42) a A:BH (60) porque cortaba en Pedido 11 y se perdía Staff 11/12 + financieros (PM, Subtotal, IIBB, Total, Ajuste)
  // Bug encontrado en #1905 Microsoft Minecraft: Ivan Aranda (Staff 11, col AR) y Sebastián Guttman (Staff 12, col AU) no se leían
  const ranges = ['PRESUPUESTOS!A:BE','PROYECTOS!A:BH','CARGAR STAFF!A:Z','FACTURACION!A:AG','RRHH!A:Z','Contactos/agencias!A:Z','PAGOS_STAFF!A:L','SUELDOS!A:J','LOG!A:F','COSTOS_PROYECTO!A:H','CUENTAS!A:H','RESERVAS!A:I','HISTORICO_2023!A:AE','HISTORICO_2024!A:AE','HISTORICO_2025!A:AE','COBROS!A:L','GASTOS_FIJOS!A:L','TARJETAS!A:N','PRESTAMOS!A:K','MOVIMIENTOS_TARJETA!A:N','AGENCIAS!A:L','CLIENTES!A:J','listado!A:K']
  const fetchRange = async r => {
    try { return await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: r })) }
    catch (e) { if (String(e?.message || '').includes('Unable to parse range')) return { data: { values: [] } }; throw e }
  }
  // Procesar en batches de 5 en vez de 22 al mismo tiempo (reduce burst de reads)
  const results = []
  const BATCH = 5
  for (let i = 0; i < ranges.length; i += BATCH) {
    const batch = await Promise.all(ranges.slice(i, i+BATCH).map(fetchRange))
    results.push(...batch)
  }
  const toObjects = values => {
    if (!values || values.length < 2) return []
    const headers = values[0]
    // Adjuntamos __row (nro de fila real en el sheet, 1-based) para poder editar/borrar esa fila.
    return values.slice(1)
      .map((row, i) => ({ row, sheetRow: i + 2 }))
      .filter(({ row }) => row.some(c => c !== ''))
      .map(({ row, sheetRow }) => {
        const obj = {}
        headers.forEach((h, i) => { obj[h] = row[i] || '' })
        obj.__row = sheetRow
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
    cobros: toObjects(results[15].data.values),
    gastosFijos: toObjects(results[16].data.values),
    tarjetas: toObjects(results[17].data.values),
    prestamos: toObjects(results[18].data.values),
    movimientosTarjeta: toObjects(results[19].data.values),
    agencias: toObjects(results[20].data.values),
    clientes: toObjects(results[21].data.values),
    listado: (() => {
      const vals = results[22].data.values || []
      const uniq = arr => [...new Set(arr.map(v => String(v||'').trim()).filter(Boolean))].sort()
      return {
        staff:     uniq(vals.slice(1).map(r => r[0])),
        agencias:  uniq(vals.slice(1).map(r => r[2])),
        clientes:  uniq(vals.slice(1).map(r => r[4])),
        servicios: uniq(vals.slice(1).map(r => r[7])),
      }
    })(),
  }
}

export async function getSheets() {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  return { sheets, SHEET_ID }
}
