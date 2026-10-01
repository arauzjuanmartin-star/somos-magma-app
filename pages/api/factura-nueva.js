import { getSheets, withSheetsRetry as withRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail
  const {
    entidad, tipo, nroFactura, fechaEmision, fechaVenc, plazo,
    conIVA, neto, iva, total, presupuestoNum, proyecto, agencia, cliente,
    forzar, // permite saltar validación de duplicado
    otros,  // los demás trabajos que cubre ESTA MISMA factura: [{presupuestoNum, proyecto, agencia, cliente, neto, iva, total}]
  } = req.body

  // Una factura puede cubrir VARIOS trabajos. Caso Austral: se les manda la lista de trabajos, ellos
  // arman una orden de compra con todo y contra esa orden sale una sola factura. En el sheet es una
  // fila por trabajo, todas con el mismo N° de factura. Antes había que cargar el formulario una vez
  // por trabajo y aceptar el aviso de "N° duplicado" cada vez. Ahora entran todas juntas, en un solo
  // append: o se guardan todas o ninguna.
  const trabajos = [{ presupuestoNum, proyecto, agencia, cliente, neto, iva, total }, ...(Array.isArray(otros) ? otros : []).filter(t => t && typeof t === 'object')]
  const nrosT = trabajos.map(t => String(t.presupuestoNum ?? '').trim())
  if (trabajos.length > 1 && nrosT.some(n => !n)) return res.status(400).json({ error: 'Falta el N° de presupuesto de un trabajo' })
  if (new Set(nrosT).size !== nrosT.length) return res.status(400).json({ error: 'Hay un trabajo repetido en la misma factura' })
  if (trabajos.length > 40) return res.status(400).json({ error: 'Son demasiados trabajos para una sola factura (máximo 40)' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const hoy = new Date()
    const mesStr = String(hoy.getMonth()+1).padStart(2,'0') + ' - ' + MESES[hoy.getMonth()]

    // Fecha Evento (col G): hasta el 24/09/2026 quedaba vacía y "Atrasadas +30d del evento" daba siempre $0 en la
    // diaria (las 42 facturas por cobrar de ese día no tenían fecha). Se busca por N° en PROYECTOS y, si no, en PRESUPUESTOS.
    const fechaEventoDe = {}
    try {
      const ev = await withRetry(() => sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEET_ID, ranges: ['PROYECTOS!C:D', 'PRESUPUESTOS!A:B'], valueRenderOption: 'FORMATTED_VALUE' }))
      const [PRO, PRE] = ev.data.valueRanges.map(v => v.values || [])
      for (const nro of nrosT) {
        const enPro = PRO.find(r => String(r[0] ?? '').trim() === nro), enPre = PRE.find(r => String(r[0] ?? '').trim() === nro)
        fechaEventoDe[nro] = String((enPro && enPro[1]) || (enPre && enPre[1]) || '').trim()
      }
    } catch (e) { /* sin fecha es como estaba antes: la diaria la busca en PROYECTOS igual */ }

    // Validar duplicados si no se forzó
    if (!forzar) {
      try {
        const check = await withRetry(() => sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: 'FACTURACION!B:O',
        }))
        const headers = check.data.values?.[0] || []
        const idxN = headers.indexOf('Nro de Factura')
        const idxPresu = 0  // col B = N° Presupuesto (porque empezamos desde B)
        const idxCliente = headers.indexOf('Cliente')
        const idxFinal = headers.indexOf('Precio FINAL')
        const num = v => parseFloat(String(v||'').replace(/[^\d.-]/g,'')) || 0
        const datos = check.data.values.slice(1)
        // a) mismo N° de factura ya cargado
        if (nroFactura && idxN !== -1) {
          const dup = datos.find(row => String(row[idxN]||'').trim() === String(nroFactura).trim() && !String(row[idxN]||'').toUpperCase().startsWith('ANULADA'))
          if (dup) return res.status(409).json({ error: 'N° de factura ya existe', mensaje: `Ya hay una factura con N° "${nroFactura}" cargada (presupuesto #${dup[idxPresu]} — ${dup[idxCliente]}). ¿Crear igual?` })
        }
        // b) MISMO proyecto + MISMO monto (atrapa duplicados sin número)
        if (idxFinal !== -1) {
          for (const t of trabajos) {
            const dup2 = datos.find(row => String(row[idxPresu]||'').trim() === String(t.presupuestoNum).trim() && Math.abs(num(row[idxFinal]) - num(t.total)) < 1)
            if (dup2) return res.status(409).json({ error: 'Posible duplicado', mensaje: `Ya hay una factura de este proyecto (#${t.presupuestoNum}) por ${'$'+Math.round(num(t.total)).toLocaleString('es-AR')}. Parece un duplicado. ¿Crear igual?` })
          }
        }
      } catch (e) {
        console.warn('Validación de duplicado falló (sigo igual):', e.message)
      }
    }

    // APPEND con retry. Si falla todo, devuelve error claro.
    // CRÍTICO 2026-06-09: sin insertDataOption Google usa OVERWRITE en filas "vacías" y pisaba data
    // (3 facturas de Flor se perdieron por este bug — Santander 1894, Mondelez 1933, Clinica 1948)
    const appendResult = await withRetry(() => sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'FACTURACION!A:Y',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',   // ← fuerza nueva fila en vez de overwrite
      includeValuesInResponse: true,
      requestBody: { values: trabajos.map(t => [
        mesStr, t.presupuestoNum, false, false, false, '', fechaEventoDe[String(t.presupuestoNum ?? '').trim()] || '',
        t.agencia||'', t.cliente||'', t.proyecto||'',
        t.neto, t.iva, t.total,
        'Factura '+tipo, nroFactura||'',
        // Fc Enviada va en FALSE: cargar la factura NO es mandarla. La marca (y la
        // "Fecha enviada") las estampa factura-enviar cuando el mail sale de verdad.
        // Antes iba en true y toda factura figuraba como enviada al cliente sin serlo.
        fechaEmision||'', false, plazo||'', 0, fechaVenc||'',
        0, '', '', '', ''
      ]) }
    }))

    // VERIFICACIÓN POST-GUARDADO (defensa contra bug de pérdida silenciosa):
    // releemos la fila escrita y confirmamos que existe el presupuestoNum + total esperado
    let filaVerificada = null
    // Fila donde quedó esta factura. La devolvemos SIEMPRE (aunque la verificación falle):
    // el PDF y el mail que vienen después tienen que apuntar a ESTA factura y no a
    // "la primera del proyecto" — con adelanto + saldo hay más de una.
    let filaCreada = null
    let filasCreadas = []
    try {
      const updatedRange = appendResult?.data?.updates?.updatedRange  // ej: 'FACTURACION!A140:Y140'
      if (updatedRange) {
        const m = updatedRange.match(/!\D+(\d+)/)
        const filaNum = m ? parseInt(m[1]) : null
        filaCreada = filaNum || null
        if (filaNum) {
          // Con varios trabajos: la fila de cada uno, en el mismo orden en que vinieron.
          filasCreadas = trabajos.map((t, k) => ({ fila: filaNum + k, presupuestoNum: String(t.presupuestoNum ?? '').trim() }))
          const check = await withRetry(() => sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID, range: `FACTURACION!B${filaNum}:M${filaNum + trabajos.length - 1}`
          }))
          for (let k = 0; k < trabajos.length; k++) {
            const t = trabajos[k], fila = check.data.values?.[k] || []
            const presuLeido = String(fila[0]||'').trim()
            const totalLeido = parseFloat(String(fila[11]||'').replace(/[^\d.-]/g,''))
            if (!(presuLeido === String(t.presupuestoNum).trim() && Math.abs(totalLeido - t.total) < 1)) {
              // La fila se "escribió" pero no contiene lo esperado → falla loud
              return res.status(500).json({
                error: 'La factura no se guardó correctamente en el sheet (verificación falló).',
                detalle: `Fila ${filaNum + k}: presu esperado ${t.presupuestoNum}, leído "${presuLeido}". Total esperado ${t.total}, leído ${totalLeido}.`,
                reintentar: true,
              })
            }
          }
          filaVerificada = filaNum
        }
      }
    } catch (verifyErr) {
      console.warn('Verificación post-guardado falló:', verifyErr.message)
      // No bloqueamos si solo falla la verificación
    }

    // LOG solo después de confirmar append exitoso
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: trabajos.map((t, k) => [new Date().toISOString(), mail, 'factura-nueva', 'FACTURACION', String(t.presupuestoNum), `nro=${nroFactura||'-'} ${entidad}-${tipo} $${t.total} cliente=${t.cliente||''}${filaVerificada?' fila='+(filaVerificada+k):' (sin verificar)'}${trabajos.length>1?` · factura de ${trabajos.length} trabajos`:''}`]) },
      })
    } catch (e) {}

    res.json({ ok: true, filaVerificada, fila: filaCreada, filas: filasCreadas })
  } catch(e) {
    console.error('Error factura-nueva:', e)
    const status = e.code || e.response?.status
    if (status === 429) {
      return res.status(429).json({ error: 'Google está limitando los pedidos. Esperá 30 segundos y volvé a intentar.' })
    }
    res.status(500).json({ error: e.message })
  }
}
