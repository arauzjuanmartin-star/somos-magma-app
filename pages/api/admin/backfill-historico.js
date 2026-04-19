import { getSheets } from '../../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

// Fuentes de datos historicas
const FUENTES = {
  '2024': {
    sheetId: '1eu6oeHNrv0XmQN__lbiDpFmJ_YWXiO8kdxAYRH4TGoc', // ADMIN MAGMA
    tab: '2024',
    target: 'HISTORICO_2024',
  },
  '2025': {
    sheetId: '1eu6oeHNrv0XmQN__lbiDpFmJ_YWXiO8kdxAYRH4TGoc',
    tab: '2025',
    target: 'HISTORICO_2025',
  },
  '2023': {
    sheetId: '1PYEnxLfbOSQ6KPNX1yEHxaAq4o6u1ja238WLW9pg-w0', // ADMIN MAGMA Back up
    tab: '2023',
    target: 'HISTORICO_2023',
  },
}

const MESES_TXT = {enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12}

const num = v => {
  if (v === undefined || v === null || v === '') return 0
  const cleaned = String(v).replace(/[$\s,]/g, '').replace(/\./g, '').replace(/,/g, '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}
const text = v => (v === undefined || v === null) ? '' : String(v).trim()
const isCobrado = v => {
  const s = String(v||'').toLowerCase().trim()
  return s === 'ok' || s === 'sí' || s === 'si' || s === 'true' || s === 'cobrado' || v === true
}
const tipoFcToEntidad = (tipo, año) => {
  const t = String(tipo||'').toUpperCase().trim()
  if (t === 'A') return año < 2026 ? 'Sofia RI' : 'Somos Magma SRL'
  if (t === 'C') return 'Lucia Monotributo'
  if (t.includes('EFECTIVO')) return 'Efectivo'
  return ''
}

// Mapper generico que usa los headers del source para encontrar cada campo
function makeRow(sourceHeaders, sourceRow, año) {
  const hMap = {}
  sourceHeaders.forEach((h, i) => { hMap[String(h||'').trim().toLowerCase()] = i })
  const getH = (...keys) => {
    for (const k of keys) {
      const idx = hMap[k.toLowerCase()]
      if (idx !== undefined) return sourceRow[idx]
    }
    return ''
  }

  // Fecha: col "Fecha de realización" o similar — LA USAMOS PRIMERO para el mes
  const fecha = text(getH('fecha de realización','fecha realización','fecha','fecha evento','fecha realizacion'))
  let mesNum = 0
  if (fecha) {
    const p = fecha.split('/')
    if (p.length >= 2) mesNum = parseInt(p[1]) || 0
  }
  // Fallback: busca col "Mes" o "de" si no hay fecha o no pudimos parsear
  if (!mesNum) {
    const mesStr = text(getH('mes','de','month'))
    mesNum = MESES_TXT[mesStr.toLowerCase()] || 0
  }

  const nro = text(getH('nro de proyecto','nro','n° proyecto','n° presupuesto'))
  const cliente = text(getH('cliente'))
  const agencia = text(getH('agencia'))
  const proyecto = text(getH('proyecto','trabajo','descripcion'))
  const presupuesto = num(getH('presupuesto','total sin iva','neto','total'))
  const cobrado = isCobrado(getH('cobrado'))
  const viaticos = num(getH('viáticos','viaticos'))
  const magma = num(getH('magma','ganancia magma'))
  const impuestos = num(getH('impuestos'))
  const iva = num(getH('iva'))
  const total = num(getH('total','facturado'))

  // Staff + Pago (hasta 4 pares en histórico)
  // Fuentes tipo ADMIN MAGMA: "Cámara 1" / "Pago 1" / "Cámara 2" / "Pago 2" / "Otros" / "Pago 3" / "Edición" / "Pago 4"
  // Fuentes tipo ADMIN MAGMA Backup: "Camara 1" / "Camara 2" / "Edicion" (sin Pago explícito, cada col tiene el nombre)
  const staff1 = text(getH('cámara 1','camara 1','staff 1'))
  const pago1 = num(getH('pago 1','precio 1'))
  const staff2 = text(getH('cámara 2','camara 2','staff 2'))
  const pago2 = num(getH('pago 2','precio 2'))
  const staff3 = text(getH('otros','staff 3','camara 3'))
  const pago3 = num(getH('pago 3','precio 3'))
  const staff4 = text(getH('edición','edicion','staff 4'))
  const pago4 = num(getH('pago 4','precio 4'))

  const tipoFC = text(getH('tipo fc','tipo','factura'))
  const nroFC = text(getH('nro fc','n° factura','nro factura','factura'))
  const entidad = tipoFcToEntidad(tipoFC, año)
  const notas = text(getH('notas','observaciones','obs'))

  return [
    año, mesNum||'', fecha, nro, cliente, agencia, proyecto,
    presupuesto, cobrado?'SÍ':'NO', viaticos, magma, impuestos, iva, total,
    staff1, pago1, staff2, pago2, staff3, pago3, staff4, pago4,
    tipoFC, nroFC, entidad, notas,
  ]
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

  const { año, dryRun = true, replaceExisting = false } = req.body || {}
  if (!año || !FUENTES[año]) return res.status(400).json({ error: 'Año invalido. Usar 2023/2024/2025' })
  const fuente = FUENTES[año]

  try {
    const { sheets, SHEET_ID } = await getSheets()

    // 1. Leer source sheet
    const src = await sheets.spreadsheets.values.get({ spreadsheetId: fuente.sheetId, range: `${fuente.tab}!A:AZ` })
    const srcRows = src.data.values || []
    if (srcRows.length < 2) return res.json({ ok: true, inserted: 0, preview: [], msg: 'Sin datos en la fuente' })

    // Detectar fila de headers — busca una con combinación fuerte de headers esperados
    let headerRowIdx = 0
    let bestScore = 0
    const markers = ['cliente','proyecto','fecha','cobrado','total','cámara','camara','edición','edicion','pago','viáticos','viaticos','magma','factura','presupuesto','trabajo']
    for (let i = 0; i < Math.min(20, srcRows.length); i++) {
      const joined = srcRows[i].map(c => String(c||'').toLowerCase().trim()).join('|')
      let score = 0
      markers.forEach(m => { if (joined.includes(m)) score++ })
      if (score > bestScore) { bestScore = score; headerRowIdx = i }
    }
    const headers = srcRows[headerRowIdx]
    const dataRows = srcRows.slice(headerRowIdx + 1).filter(r => r.some(c => c !== ''))

    // 2. Convertir a filas unificadas
    const mapped = dataRows
      .map(r => makeRow(headers, r, Number(año)))
      .filter(r => r[4] || r[6]) // require cliente o proyecto

    if (dryRun) {
      // Estadisticas rapidas
      const conCliente = mapped.filter(r => r[4]).length
      const conTotal = mapped.filter(r => Number(r[7])>0 || Number(r[13])>0).length
      const conMes = mapped.filter(r => Number(r[1])>0).length
      // 3 ejemplos parseados
      const ejemplos = mapped.slice(0, 3).map(r => ({
        mes: r[1], fecha: r[2], nro: r[3], cliente: r[4], agencia: r[5], proyecto: r[6],
        presupuesto: r[7], cobrado: r[8], magma: r[10], total: r[13],
        staff1: r[14], pago1: r[15],
      }))
      return res.json({
        ok: true,
        dryRun: true,
        año,
        fuenteSheet: fuente.sheetId,
        fuenteTab: fuente.tab,
        target: fuente.target,
        headerRowDetected: headerRowIdx,
        headerScore: bestScore,
        headers: headers,
        totalRowsEnFuente: dataRows.length,
        totalMapeadas: mapped.length,
        conCliente, conTotal, conMes,
        ejemplos,
      })
    }

    // 3. Escribir a HISTORICO_YYYY
    if (replaceExisting) {
      // Borrar todo desde fila 2 en el target
      await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${fuente.target}!A2:Z` })
    }
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${fuente.target}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: mapped },
    })

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'backfill-historico', fuente.target, año, `${mapped.length} filas insertadas`]] },
      })
    } catch (e) {}

    res.json({ ok: true, año, inserted: mapped.length, target: fuente.target })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
