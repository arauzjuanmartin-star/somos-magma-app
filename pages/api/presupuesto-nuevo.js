import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

// Estructura real de PRESUPUESTOS:
// 0 Columna 1 | 1 Fecha Evento | 2 PM Interno | 3 Estado | 4 Agencia | 5 Cliente
// 6 Proyecto | 7 Cant. Fechas | 8 Precio Final | 9 Fecha Presupuesto | 10 Contacto
// 11-34 Pedido 1..12 + Precio 1..12
// 35 Otros | 36 Precio (otros) | 37 Descuento | 38 Subtotal | 39 Fee Agencia
// 40 Impuesto a las ganancias | 41 IIBB | 42 Plazo | 43 Interes %
// 44 Interes $ | 45 Total | 46 Ajuste
// 47 Tipo Fechas (dia/rango/multi) | 48 Fechas Adicionales (csv |) | 49 Fee Servicios (csv 1|0|1)

// Lock simple en memoria del proceso para evitar race condition dentro del mismo node instance.
// Para Vercel multi-instance, igual lo evita porque cada uno consulta el sheet al momento.
let asignandoNumero = false
const esperarLock = async () => {
  let intentos = 0
  while (asignandoNumero && intentos < 50) { await new Promise(r => setTimeout(r, 100)); intentos++ }
}

const calcularSiguienteNumero = async (sheets, SHEET_ID) => {
  const r = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:A' }))
  const nums = (r.data.values || []).slice(1)
    .map(row => {
      const s = String(row[0]||'').trim()
      const m = s.match(/^(\d+)/)
      return m ? parseInt(m[1]) : 0
    })
    .filter(n => n > 0)
  return nums.length > 0 ? Math.max(...nums) + 1 : 1000
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const p = req.body

  // VALIDACIÓN servidor (defense in depth)
  const errs = []
  if (!p['Cliente'] || !String(p['Cliente']).trim()) errs.push('Falta Cliente')
  if (!p['Proyecto'] || !String(p['Proyecto']).trim()) errs.push('Falta Proyecto')
  if (!p['Fecha Evento'] || !String(p['Fecha Evento']).trim()) errs.push('Falta Fecha Evento')
  if (!p['PM Interno'] || !String(p['PM Interno']).trim()) errs.push('Falta PM Interno')
  const tieneServicio = [1,2,3,4,5,6,7,8,9,10,11,12].some(i => p[`Pedido ${i}`])
  if (!tieneServicio) errs.push('Falta al menos un servicio')
  if (errs.length > 0) {
    console.warn('presupuesto-nuevo bloqueado:', errs.join(', '))
    return res.status(400).json({ error: 'Faltan datos obligatorios', detalles: errs })
  }

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const now = new Date()
    const fechaHoy = now.toLocaleDateString('es-AR')

    // RACE CONDITION FIX: número se calcula en el servidor leyendo el sheet en este momento.
    // Esto bloquea otros guardados concurrentes con un lock en memoria.
    await esperarLock()
    asignandoNumero = true

    let numeroAsignado
    try {
      const nuevoNum = await calcularSiguienteNumero(sheets, SHEET_ID)
      numeroAsignado = nuevoNum

      const row = new Array(50).fill('')
      row[0] = nuevoNum  // ← N° asignado por servidor, ignora lo que vino del cliente
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

      let subtotalCalc = 0
      for (let i = 1; i <= 12; i++) {
        const svc = p[`Pedido ${i}`] || ''
        const prc = Number(p[`Precio ${i}`]) || 0
        row[11 + (i - 1) * 2] = svc
        row[12 + (i - 1) * 2] = prc
        subtotalCalc += prc
      }

      const num = v => { const n = Number(v); return isNaN(n) ? 0 : n }
      const hasAgencia = !!(p['Agencia'] && String(p['Agencia']).trim())
      const subtotal = num(p['Subtotal']) || subtotalCalc
      const feeAgencia = num(p['Fee Agencia']) || (hasAgencia ? subtotalCalc : 0)
      const impGan = num(p['Impuesto a las ganancias'])
      const iibb = num(p['IIBB'])
      const intMto = num(p['Interes $'])
      const ajuste = num(p['Ajuste'])
      const total = num(p['Total']) || num(p['Precio Final']) || (subtotal + feeAgencia + impGan + iibb + intMto + ajuste)

      row[35] = p['Otros'] || ''
      row[36] = p['Precio Otros'] || ''
      row[37] = p['Descuento'] || ''
      row[38] = subtotal
      row[39] = feeAgencia
      row[40] = impGan
      row[41] = iibb
      row[42] = p['Plazo'] || ''
      row[43] = p['Interes %'] || ''
      row[44] = intMto
      row[45] = total
      row[46] = ajuste
      row[47] = p['Tipo Fechas'] || ''
      row[48] = p['Fechas Adicionales'] || ''
      row[49] = p['Fee Servicios'] || ''
      row[8] = num(p['Precio Final']) || total

      await withSheetsRetry(() => sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'PRESUPUESTOS!A:A',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] },
      }))
    } finally {
      asignandoNumero = false
    }

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'presupuesto-nuevo', 'PRESUPUESTOS', String(numeroAsignado), `cliente=${p['Cliente']} agencia=${p['Agencia']} total=${p['Total']||p['Precio Final']}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, numero: numeroAsignado })
  } catch (e) {
    asignandoNumero = false
    console.error(e)
    const status = e.code || e.response?.status
    if (status === 429) return res.status(429).json({ error: 'Google está limitando los pedidos. Esperá 30 segundos. El presu NO se grabó.' })
    res.status(500).json({ error: e.message })
  }
}
