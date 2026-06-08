import { getSheets } from '../../../lib/sheets'
import { requireAuth } from '../../../lib/auth-helpers'

const FUENTES = {
  '2024': { sheetId: '1eu6oeHNrv0XmQN__lbiDpFmJ_YWXiO8kdxAYRH4TGoc', tab: '2024', target: 'HISTORICO_2024' },
  '2025': { sheetId: '1eu6oeHNrv0XmQN__lbiDpFmJ_YWXiO8kdxAYRH4TGoc', tab: '2025', target: 'HISTORICO_2025' },
  '2023': { sheetId: '1PYEnxLfbOSQ6KPNX1yEHxaAq4o6u1ja238WLW9pg-w0', tab: '2023', target: 'HISTORICO_2023' },
}

const MESES_TXT = {enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12,ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,oct:10,nov:11,dic:12}

// Parser argentino: . = separador de miles, , = decimal
// $1.156.055,78 -> 1156055.78 · $232.400 -> 232400 · $232,50 -> 232.5
const num = v => {
  if (v === undefined || v === null || v === '') return 0
  let s = String(v).replace(/[$\s]/g, '').trim()
  if (!s) return 0
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) s = s.replace(/\./g, '').replace(',', '.')
  else if (hasComma) s = s.replace(',', '.')
  else if (hasDot) s = s.replace(/\./g, '')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}
const text = v => (v === undefined || v === null) ? '' : String(v).trim()
const isCobrado = v => {
  const s = String(v||'').toLowerCase().trim()
  return s === 'ok' || s === 'sí' || s === 'si' || s === 'true' || s === 'cobrado' || v === true
}
const tipoFcToEntidad = (tipo, año) => {
  const t = String(tipo||'').toUpperCase().trim()
  if (t === 'A') return 'Sofia RI'
  if (t === 'C') return 'Lucia Monotributo'
  if (t.includes('EFECTIVO') || t === 'E') return 'Efectivo'
  return ''
}
const mesFromFecha = fechaStr => {
  if (!fechaStr) return 0
  const p = String(fechaStr).split('/')
  if (p.length >= 2) return parseInt(p[1]) || 0
  return 0
}

// ============ PARSER 2024/2025 ============
// Posiciones (ADMIN MAGMA sheets 2024 y 2025):
// A(0) de/mes, B(1) Fecha realización, C(2) Nro proyecto, D(3) Cliente, E(4) Proyecto,
// F(5) Cobrado, G(6) Total sin IVA, H(7) Viáticos,
// I(8) Cámara 1, J(9) Pago 1, L(11) Cámara 2, M(12) Pago 2, O(14) Otros, P(15) Pago 3, S(18) Edición, T(19) Pago 4,
// U(20) Magma, V(21) Impuestos, W(22) IVA, X(23) Extra M, Y(24) Total, Z(25) Tipo FC, AA(26) Nro FC,
// AE(30) Otros 2, AF(31) Pago 5, AH(33) Otros 3, AI(34) Pago 6
function parseRow2024_2025(row, año) {
  const mesTxt = text(row[0]).toLowerCase()
  const fecha = text(row[1])
  let mesNum = MESES_TXT[mesTxt] || 0
  if (!mesNum) mesNum = mesFromFecha(fecha)
  const nro = text(row[2])
  const cliente = text(row[3])
  const proyecto = text(row[4])
  const cobrado = isCobrado(row[5])
  const presupuesto = num(row[6])
  const viaticos = num(row[7])
  const staff1 = text(row[8]); const pago1 = num(row[9])
  const staff2 = text(row[11]); const pago2 = num(row[12])
  const staff3 = text(row[14]); const pago3 = num(row[15])
  const staff4 = text(row[18]); const pago4 = num(row[19])
  const magma = num(row[20])
  const impuestos = num(row[21])
  const iva = num(row[22])
  const extraM = num(row[23])
  const total = num(row[24])
  const tipoFC = text(row[25])
  const nroFC = text(row[26])
  const staff5 = text(row[30]); const pago5 = num(row[31])
  const staff6 = text(row[33]); const pago6 = num(row[34])
  const entidad = tipoFcToEntidad(tipoFC, año)

  return [
    año, mesNum||'', fecha, nro, cliente, '', proyecto,
    presupuesto, cobrado?'SÍ':'NO',
    viaticos, magma, impuestos, extraM, iva, total,
    staff1, pago1, staff2, pago2, staff3, pago3, staff4, pago4,
    staff5, pago5, staff6, pago6,
    tipoFC, nroFC, entidad, '',
  ]
}

// ============ PARSER 2023 ============
// Posiciones (ADMIN MAGMA Back up, tab 2023):
// A(0) Mes, B(1) Cliente, C(2) Trabajo, D(3) Presu USD, E(4) Presupuesto, F(5) IVA,
// G(6) Seña, H(7) Total (balance, puede ser negativo), I(8) Viáticos/Varios,
// K(10) Cámara1 importe, L(11) Cámara1 nombre,
// M(12) Cámara2 importe, N(13) Cámara2 nombre,
// O(14) Edición importe, P(15) Edición nombre,
// Q(16) Ganancia (Magma), R(17) Inversión, S(18) Sofi, T(19) Juan,
// U(20) Fecha grabación, V(21) Fecha facturación, W(22) Nro Factura,
// X(23) Quien Factura (Sofi/Lulu/...), Y(24) Fecha de pago (cobrado si no vacía)
function parseRow2023(row, año) {
  const mesTxt = text(row[0]).toLowerCase()
  const fecha = text(row[20])
  let mesNum = MESES_TXT[mesTxt] || 0
  if (!mesNum) mesNum = mesFromFecha(fecha)
  const cliente = text(row[1])
  const proyecto = text(row[2])
  const presupuesto = num(row[4])
  const iva = num(row[5])
  const seña = num(row[6])
  const viaticos = num(row[8])
  const pago1 = num(row[10]);  const staff1 = text(row[11])
  const pago2 = num(row[12]);  const staff2 = text(row[13])
  const pago3 = num(row[14]);  const staff3 = text(row[15])
  const gananciaBruta = num(row[16])
  const inversion = text(row[17])
  const sofi = num(row[18])
  const juan = num(row[19])
  // En 2023 la "Ganancia" del sheet incluía lo que Sofi y Juan cobraban por su trabajo
  // → los tratamos como staff y la ganancia real de Magma es la diferencia
  const magma = gananciaBruta - sofi - juan
  const nroFC = text(row[22])
  const quienFactura = text(row[23]).toLowerCase()
  const fechaPago = text(row[24])
  const cobrado = fechaPago ? 'SÍ' : 'NO'

  let entidad = ''
  if (quienFactura.includes('sofi')) entidad = 'Sofia RI'
  else if (quienFactura.includes('lulu') || quienFactura.includes('lucia')) entidad = 'Lucia Monotributo'
  else if (quienFactura.includes('magma') || quienFactura.includes('srl')) entidad = 'Magma SRL'

  const notasParts = []
  if (seña) notasParts.push(`Seña $${seña}`)
  if (inversion) notasParts.push(`Inversión ${inversion}`)
  const notas = notasParts.join(' · ')

  // Staff filter: si nombre es "-" o vacío, limpiar ambos (es placeholder)
  const clean = (nombre, pago) => {
    const n = nombre.replace(/^-+$/, '').trim()
    return [n, n ? pago : 0]
  }
  const [s1, p1] = clean(staff1, pago1)
  const [s2, p2] = clean(staff2, pago2)
  const [s3, p3] = clean(staff3, pago3)

  return [
    año, mesNum||'', fecha, '', cliente, '', proyecto,
    presupuesto, cobrado,
    viaticos, magma, 0, 0, iva, presupuesto + iva,
    s1, p1, s2, p2, s3, p3,
    sofi ? 'Sofia' : '', sofi,
    juan ? 'Juan' : '', juan,
    '', '',
    '', nroFC, entidad, notas,
  ]
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { año, dryRun = true, replaceExisting = false } = req.body || {}
  if (!año || !FUENTES[año]) return res.status(400).json({ error: 'Año invalido. Usar 2023/2024/2025' })
  const fuente = FUENTES[año]

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const src = await sheets.spreadsheets.values.get({ spreadsheetId: fuente.sheetId, range: `${fuente.tab}!A:AZ` })
    const srcRows = src.data.values || []
    if (srcRows.length < 2) return res.json({ ok: true, inserted: 0, preview: [], msg: 'Sin datos en la fuente' })

    // Detectar header row: escanea 20 filas y elige la que tenga mas markers
    let headerRowIdx = 0, bestScore = 0
    const markers = ['cliente','proyecto','fecha','cobrado','total','cámara','camara','edición','edicion','pago','viáticos','viaticos','magma','trabajo','mes']
    for (let i = 0; i < Math.min(20, srcRows.length); i++) {
      const joined = srcRows[i].map(c => String(c||'').toLowerCase().trim()).join('|')
      let score = 0
      markers.forEach(m => { if (joined.includes(m)) score++ })
      if (score > bestScore) { bestScore = score; headerRowIdx = i }
    }
    const dataRows = srcRows.slice(headerRowIdx + 1).filter(r => r.some(c => c !== ''))

    // Parser segun año
    const parser = año === '2023' ? parseRow2023 : parseRow2024_2025
    const mapped = dataRows
      .map(r => parser(r, Number(año)))
      .filter(r => r[4] || r[6]) // require cliente o proyecto

    if (dryRun) {
      const conCliente = mapped.filter(r => r[4]).length
      const conMes = mapped.filter(r => Number(r[1])>0).length
      const conTotal = mapped.filter(r => Number(r[7])>0).length
      const conMagma = mapped.filter(r => Number(r[10])>0 || Number(r[9])>0 || Number(r[11])>0 || Number(r[12])>0).length
      const ejemplos = mapped.slice(0, 3).map(r => ({
        mes: r[1], fecha: r[2], cliente: r[4], proyecto: r[6], presupuesto: r[7], cobrado: r[8],
        viaticos: r[9], magma: r[10], impuestos: r[11], extraM: r[12], iva: r[13], total: r[14],
        staff1: r[15], pago1: r[16], staff2: r[17], pago2: r[18],
        tipoFC: r[27], entidad: r[29],
      }))
      return res.json({
        ok: true, dryRun: true, año, target: fuente.target,
        headerRowDetected: headerRowIdx, headerScore: bestScore,
        totalRowsEnFuente: dataRows.length, totalMapeadas: mapped.length,
        conCliente, conMes, conTotal, conMagma,
        ejemplos,
      })
    }

    if (replaceExisting) {
      await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${fuente.target}!A2:AE` })
    }
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${fuente.target}!A:AE`,
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
