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
  // Rangos AMPLIADOS a MAX_SLOTS (40) servicios: PRESUPUESTOS A:DJ (DI=Precio 40 + DJ=Desglosar), PROYECTOS A:ET
  // (ER es el último slot; ES/ET son los links de Drive Crudo y Drive Entrega).
  // Antes PRESUPUESTOS cortaba en 12 y PROYECTOS en 20 → los servicios de más se guardaban
  // en la app pero NUNCA llegaban al sheet (6 presus perdieron $5.932.000 de costo).
  // Ver SLOT_PRESU / SLOT_PROY abajo: el tope vive ahí, no repartido por el código.
  // PRESUPUESTOS llega hasta DT: DQ-DS son las 3 columnas del seguimiento comercial y DT es
  // el PDF guardado ("PDF Config", JSON) — las dos cosas viven en lib/slots.js.
  const ranges = ['PRESUPUESTOS!A:DT','PROYECTOS!A:EW','CARGAR STAFF!A:Z','FACTURACION!A:AJ','RRHH!A:Z','Contactos/agencias!A:Z','PAGOS_STAFF!A:Z','SUELDOS!A:J','LOG!A:F','COSTOS_PROYECTO!A:H','CUENTAS!A:N','RESERVAS!A:I','HISTORICO_2023!A:AE','HISTORICO_2024!A:AE','HISTORICO_2025!A:AE','COBROS!A:L','GASTOS_FIJOS!A:W','TARJETAS!A:N','PRESTAMOS!A:T','MOVIMIENTOS_TARJETA!A:P','AGENCIAS!A:N','CLIENTES!A:M','listado!A:K','CUOTAS!A:K','MOVIMIENTOS!A:N','EDICION!A:AM','ACUERDOS!A:U','HORAS_EXTRA!A:M']
  // UNA sola lectura para todas las solapas (batchGet) → 1 request en vez de ~23.
  // Clave para no reventar la cuota "Read requests per minute" de Sheets.
  const batch = await withSheetsRetry(() => sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEET_ID, ranges }))
  const vr = batch.data.valueRanges || []
  // OC_PEDIDOS se lee APARTE y con red: si un rango del batchGet apunta a una solapa que no existe
  // (alguien la renombra o la borra), falla la lectura entera y la app queda sin datos. Esta solapa
  // es un registro auxiliar: si no está, la app sigue andando y los pedidos vienen vacíos.
  let ocPedidosVals = []
  try { ocPedidosVals = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'OC_PEDIDOS!A:L' })).data.values || [] } catch (e) { ocPedidosVals = [] }
  // MOVIMIENTOS_BANCO = los renglones de los extractos que ya se subieron (para no cargarlos dos veces y saber hasta
  // qué día está cargada cada cuenta). También aparte y con red: si la solapa no existe, viene vacía.
  let movBancoVals = []
  try { movBancoVals = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'MOVIMIENTOS_BANCO!A:O' })).data.values || [] } catch (e) { movBancoVals = [] }
  // IMPUESTOS = los VEP que manda el contador, uno por fila, con su monto, su vencimiento y si se pagó (lib/impuestos.mjs).
  // También aparte y con red: si la solapa no existe, viene vacía y Caja sigue usando lo cargado en gastos fijos.
  // TICKETS = los gastos que adelantan los chicos en un trabajo y cargan desde Mi Magma (lib/tickets.mjs). Aparte y con red.
  let ticketsVals = []
  try { ticketsVals = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'TICKETS!A:P' })).data.values || [] } catch (e) { ticketsVals = [] }
  let impuestosVals = []
  try { impuestosVals = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'IMPUESTOS!A:O' })).data.values || [] } catch (e) { impuestosVals = [] }
  // RUBROS = la lista ÚNICA de rubros y subrubros de gastos ("Producción · Rental de equipos", "Oficina"…), con lo que
  // incluye cada uno. La usa la carga de gastos para sugerir el rubro según lo que se escribe. También aparte y con red.
  // La solapa tiene un título en la fila 1 y los encabezados (RUBRO | SUBRUBRO | Qué incluye) en la 2.
  let rubros = []
  try {
    const rv = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'RUBROS!A:C' })).data.values || []
    const ih = rv.findIndex(r => String(r[0] || '').trim().toUpperCase() === 'RUBRO')
    rubros = rv.slice(ih + 1).filter(r => String(r[0] || '').trim()).map(r => ({ rubro: String(r[0]).trim(), subrubro: /^[—\-]?$/.test(String(r[1] || '').trim()) ? '' : String(r[1]).trim(), incluye: String(r[2] || '').trim() }))
  } catch (e) { rubros = [] }
  const results = ranges.map((_, i) => ({ data: { values: vr[i]?.values || [] } }))
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
    // __row = fila real en el sheet. Hace falta porque hay N° de presupuesto repetidos
    // (#1833 aparece 4 veces): buscar por número borraría/editaría la fila equivocada.
    return values.slice(1)
      .map((row, i) => ({ row, sheetRow: i + 2 }))
      .filter(({ row }) => row.some(c => c !== ''))
      .map(({ row, sheetRow }) => {
        const obj = {}
        let pedN = 0, prcN = 0
        headers.forEach((h, i) => {
          const ht = h.trim()
          if (ht === 'Pedido' && pedidoCount > 1) { pedN++; obj['Pedido '+pedN] = row[i] || '' }
          else if (ht === 'Precio' && precioCount > 1) { prcN++; obj['Precio '+prcN] = row[i] || '' }
          else { obj[h] = row[i] || '' }
        })
        obj.__row = sheetRow
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
      // servicios con su precio (col H = nombre, col I = precio). El nombre puede
      // traer emoji adelante; se guarda tal cual porque así queda escrito en el sheet.
      const svcs = []
      vals.slice(1).forEach(r => {
        const n = String(r[7]||'').trim()
        if(!n || n.toLowerCase()==='servicio') return
        const p = parseFloat(String(r[8]||'').replace(/[^\d.-]/g,'')) || 0
        // col J = "Descripción PDF": cómo se llama el servicio cuando lo ve el cliente.
        // La lee el generador de PDF (lib/servicios-pdf.js); vacía → usa la del código.
        if(!svcs.some(s => s.n === n)) svcs.push({ n, p, desc: String(r[9]||'').trim() })
      })
      return {
        staff:     uniq(vals.slice(1).map(r => r[0])),
        agencias:  uniq(vals.slice(1).map(r => r[2])),
        clientes:  uniq(vals.slice(1).map(r => r[4])),
        servicios: uniq(vals.slice(1).map(r => r[7])),
        serviciosFull: svcs,
      }
    })(),
    cuotas: toObjects(results[23].data.values),
    movimientos: toObjects(results[24].data.values),
    // Post-producción: una fila por entregable. Si la solapa todavía no existe
    // (sheet viejo), viene vacía y el módulo Edición muestra el cartel de setup.
    edicion: toObjects(results[25].data.values),
    // Condiciones vigentes de cada acuerdo (Lucho, Juani). La app las lee de acá para
    // avisar el conteo de jornadas y autocompletar la tarifa — nada hardcodeado.
    acuerdos: toObjects(results[26].data.values),
    horasExtra: toObjects(results[27].data.values),
    // Pedidos de orden de compra (el mail con la lista de trabajos que se le manda a Austral para
    // que los cargue en su sistema). Una fila por trabajo pedido: la app muestra desde cuándo espera.
    ocPedidos: toObjects(ocPedidosVals),
    movimientosBanco: toObjects(movBancoVals),
    impuestos: toObjects(impuestosVals),
    tickets: toObjects(ticketsVals),
    rubros,
  }
}

export async function getSheets() {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  return { sheets, SHEET_ID }
}

// Los slots viven en lib/slots.js (sin googleapis, para que el front también los use)
export { MAX_SLOTS, SLOT_PRESU, SLOT_PROY, ANCHO_PRESU, ANCHO_PROY, COL_DESGLOSAR, ANCHO_PRESU_FILA, COL_BRIEF_ED, HEADERS_BRIEF_ED, COL_SEGUIMIENTO, HEADERS_SEGUIMIENTO, ANCHO_PRESU_TOTAL, DIAS_SEGUIMIENTO, COL_PDF, HEADER_PDF, ANCHO_PRESU_CON_PDF } from './slots.js'
