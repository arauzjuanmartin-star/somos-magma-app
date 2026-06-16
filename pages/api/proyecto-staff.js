import { google } from 'googleapis'
import { requireAuth } from '../../lib/auth-helpers'

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

function colToLetter(col) {
  let s = ''; col++
  while (col > 0) { col--; s = String.fromCharCode(65 + (col % 26)) + s; col = Math.floor(col / 26) }
  return s
}

const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
const mesDeFecha = s => {
  const m = String(s||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return ''
  const mNum = parseInt(m[2])
  if (mNum < 1 || mNum > 12) return ''
  return String(mNum).padStart(2,'0') + ' - ' + MESES[mNum-1]
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail
  const { num, staffData } = req.body
  if (!num) return res.status(400).json({ error: 'Falta num' })

  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // 1. Leer PROYECTOS para encontrar la fila + headers
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:CZ' })
    const rows = r.data.values
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Hoja vacía' })
    const headers = rows[0]
    const colNum = headers.indexOf('N° presupuesto')
    let rowIndex = -1, projRow = null
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][colNum]) === String(num)) { rowIndex = i + 1; projRow = rows[i]; break }
    }
    if (rowIndex === -1) return res.status(404).json({ error: 'Proyecto no encontrado' })

    // 2. Detectar las posiciones de Staff 1..20 y Precio 1..20 (renumerando los duplicados Staff/Precio sin número)
    const staffCols = [], precioCols = [], pedidoCols = []
    let staffN = 0, precioN = 0, pedidoN = 0
    headers.forEach((h, i) => {
      const ht = String(h||'').trim()
      if (ht === 'Staff') { staffN++; staffCols[staffN-1] = i }
      else if (/^Staff (\d+)$/.test(ht)) staffCols[parseInt(RegExp.$1)-1] = i
      else if (ht === 'Precio') { precioN++; precioCols[precioN-1] = i }
      else if (/^Precio (\d+)$/.test(ht)) precioCols[parseInt(RegExp.$1)-1] = i
      else if (ht === 'Pedido') { pedidoN++; pedidoCols[pedidoN-1] = i }
      else if (/^Pedido ?(\d+)$/.test(ht)) pedidoCols[parseInt(RegExp.$1)-1] = i
    })
    const maxSlots = staffCols.length
    if (staffData.length > maxSlots) {
      return res.status(400).json({ error: `El proyecto soporta hasta ${maxSlots} slots de staff. Llegaron ${staffData.length}. Pedile a Juan que amplíe el sheet.` })
    }

    // 3. Actualizar columnas Staff/Precio/Pedido por slot
    const updates = []
    const colCarga = headers.indexOf('Carga Staff')
    if (colCarga >= 0) updates.push({ range: `PROYECTOS!${colToLetter(colCarga)}${rowIndex}`, values: [[true]] })

    // Limpiar todos los slots primero (para que si elimina alguno se borre)
    for (let i = 0; i < maxSlots; i++) {
      if (staffCols[i] !== undefined) updates.push({ range: `PROYECTOS!${colToLetter(staffCols[i])}${rowIndex}`, values: [['']] })
      if (precioCols[i] !== undefined) updates.push({ range: `PROYECTOS!${colToLetter(precioCols[i])}${rowIndex}`, values: [['']] })
      if (pedidoCols[i] !== undefined) updates.push({ range: `PROYECTOS!${colToLetter(pedidoCols[i])}${rowIndex}`, values: [['']] })
    }
    // Escribir los nuevos
    staffData.forEach((s, idx) => {
      if (staffCols[idx] !== undefined && s.nombre) updates.push({ range: `PROYECTOS!${colToLetter(staffCols[idx])}${rowIndex}`, values: [[s.nombre]] })
      if (precioCols[idx] !== undefined && s.monto) updates.push({ range: `PROYECTOS!${colToLetter(precioCols[idx])}${rowIndex}`, values: [[s.monto]] })
      if (pedidoCols[idx] !== undefined && s.pedido) updates.push({ range: `PROYECTOS!${colToLetter(pedidoCols[idx])}${rowIndex}`, values: [[s.pedido]] })
    })

    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates } })

    // 4. Unificar con PAGOS_STAFF: upsert por (N° Presupuesto + Freelancer + Servicio)
    const proyName = projRow[headers.indexOf('Proyecto')] || ''
    const fechaEvento = projRow[headers.indexOf('Fecha Evento')] || ''
    const mesRef = mesDeFecha(fechaEvento)

    const ps = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PAGOS_STAFF!A:L' })
    const psRows = ps.data.values || []
    const psHeaders = psRows[0] || []
    const psIdx = {
      fechaPago: psHeaders.indexOf('Fecha Pago'),
      freelancer: psHeaders.indexOf('Freelancer'),
      mesRef: psHeaders.indexOf('Mes Referencia'),
      nro: psHeaders.indexOf('N° Presupuesto'),
      proy: psHeaders.indexOf('Proyecto'),
      servicio: psHeaders.indexOf('Servicio'),
      adeudado: psHeaders.indexOf('Monto Adeudado'),
      pagado: psHeaders.indexOf('Monto Pagado'),
      tipo: psHeaders.indexOf('Tipo'),
      cuenta: psHeaders.indexOf('Cuenta'),
      estado: psHeaders.indexOf('Estado'),
      notas: psHeaders.indexOf('Notas'),
    }

    // Identificar líneas pre-existentes de este proyecto
    const filasExistentes = []
    psRows.forEach((row, i) => {
      if (i === 0) return
      if (String(row[psIdx.nro]||'').trim() === String(num).trim()) filasExistentes.push({ fila: i+1, freelancer: String(row[psIdx.freelancer]||'').trim(), servicio: String(row[psIdx.servicio]||'').trim(), pagado: row[psIdx.pagado] })
    })

    // Lo que queremos: una entrada por staff real (no Somos Magma) con monto > 0
    const target = staffData
      .filter(s => s.nombre && s.nombre !== 'Somos Magma' && Number(s.monto) > 0)
      .map(s => ({ freelancer: s.nombre, servicio: s.pedido || '', monto: Number(s.monto)||0 }))

    const psUpdates = []
    const psNuevas = []
    const filasABorrar = []

    // Update existentes que aún están en target; crear nuevas; marcar para borrar las que ya no están
    const consumidas = new Set()
    for (const exist of filasExistentes) {
      const match = target.find((t,ti) => !consumidas.has(ti) && t.freelancer === exist.freelancer && t.servicio === exist.servicio)
      if (match) {
        consumidas.add(target.indexOf(match))
        // Update monto adeudado si cambió
        psUpdates.push({ range: `PAGOS_STAFF!${colToLetter(psIdx.adeudado)}${exist.fila}`, values: [[match.monto]] })
      } else {
        // Si la fila existente NO está pagada todavía, la podemos borrar (cambio antes de pagar)
        const ya = Number(String(exist.pagado||'').replace(/[^\d.-]/g,'')) || 0
        if (ya === 0) filasABorrar.push(exist.fila)
        // Si está pagada total/parcial, NO la borramos — dejamos como histórico
      }
    }
    // Las nuevas (target que no estaban en existentes)
    target.forEach((t,ti) => {
      if (consumidas.has(ti)) return
      const row = new Array(12).fill('')
      row[psIdx.fechaPago] = ''
      row[psIdx.freelancer] = t.freelancer
      row[psIdx.mesRef] = mesRef
      row[psIdx.nro] = String(num)
      row[psIdx.proy] = proyName
      row[psIdx.servicio] = t.servicio
      row[psIdx.adeudado] = t.monto
      row[psIdx.pagado] = ''
      row[psIdx.tipo] = ''
      row[psIdx.cuenta] = ''
      row[psIdx.estado] = 'Pendiente'
      row[psIdx.notas] = ''
      psNuevas.push(row)
    })

    if (psUpdates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: psUpdates } })
    }
    if (psNuevas.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'PAGOS_STAFF!A:L',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: psNuevas }
      })
    }
    // Borrar filas sobrantes (no pagadas que se eliminaron del staff)
    if (filasABorrar.length > 0) {
      filasABorrar.sort((a,b) => b - a)
      const metaPS = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties)' })
      const psSheet = metaPS.data.sheets.find(s => /^pagos_staff$/i.test(s.properties.title))
      if (!psSheet) throw new Error('No encuentro la solapa PAGOS_STAFF')
      const psSheetId = psSheet.properties.sheetId
      const requests = filasABorrar.map(f => ({ deleteDimension: { range: { sheetId: psSheetId, dimension: 'ROWS', startIndex: f-1, endIndex: f } } }))
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } })
    }

    // 5. Log
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'proyecto-staff', 'PROYECTOS+PAGOS_STAFF', String(num), `staff=${staffData.length} pagos_creados=${psNuevas.length} pagos_actualizados=${psUpdates.length} borradas=${filasABorrar.length}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, pagosNuevos: psNuevas.length, pagosActualizados: psUpdates.length, pagosBorrados: filasABorrar.length })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
