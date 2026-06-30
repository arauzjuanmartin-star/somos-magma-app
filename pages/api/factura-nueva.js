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
  } = req.body

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const hoy = new Date()
    const mesStr = String(hoy.getMonth()+1).padStart(2,'0') + ' - ' + MESES[hoy.getMonth()]

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
          const dup2 = datos.find(row => String(row[idxPresu]||'').trim() === String(presupuestoNum).trim() && Math.abs(num(row[idxFinal]) - num(total)) < 1)
          if (dup2) return res.status(409).json({ error: 'Posible duplicado', mensaje: `Ya hay una factura de este proyecto (#${presupuestoNum}) por ${'$'+Math.round(num(total)).toLocaleString('es-AR')}. Parece un duplicado. ¿Crear igual?` })
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
      requestBody: { values: [[
        mesStr, presupuestoNum, false, false, false, '', '',
        agencia||'', cliente||'', proyecto||'',
        neto, iva, total,
        'Factura '+tipo, nroFactura||'',
        fechaEmision||'', true, plazo||'', 0, fechaVenc||'',
        0, '', '', '', ''
      ]] }
    }))

    // VERIFICACIÓN POST-GUARDADO (defensa contra bug de pérdida silenciosa):
    // releemos la fila escrita y confirmamos que existe el presupuestoNum + total esperado
    let filaVerificada = null
    try {
      const updatedRange = appendResult?.data?.updates?.updatedRange  // ej: 'FACTURACION!A140:Y140'
      if (updatedRange) {
        const m = updatedRange.match(/!\D+(\d+)/)
        const filaNum = m ? parseInt(m[1]) : null
        if (filaNum) {
          const check = await withRetry(() => sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID, range: `FACTURACION!B${filaNum}:M${filaNum}`
          }))
          const fila = check.data.values?.[0] || []
          const presuLeido = String(fila[0]||'').trim()
          const totalLeido = parseFloat(String(fila[11]||'').replace(/[^\d.-]/g,''))
          if (presuLeido === String(presupuestoNum).trim() && Math.abs(totalLeido - total) < 1) {
            filaVerificada = filaNum
          } else {
            // La fila se "escribió" pero no contiene lo esperado → falla loud
            return res.status(500).json({
              error: 'La factura no se guardó correctamente en el sheet (verificación falló).',
              detalle: `Fila ${filaNum}: presu esperado ${presupuestoNum}, leído "${presuLeido}". Total esperado ${total}, leído ${totalLeido}.`,
              reintentar: true,
            })
          }
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
        requestBody: { values: [[new Date().toISOString(), mail, 'factura-nueva', 'FACTURACION', String(presupuestoNum), `nro=${nroFactura||'-'} ${entidad}-${tipo} $${total} cliente=${cliente||''}${filaVerificada?' fila='+filaVerificada:' (sin verificar)'}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, filaVerificada })
  } catch(e) {
    console.error('Error factura-nueva:', e)
    const status = e.code || e.response?.status
    if (status === 429) {
      return res.status(429).json({ error: 'Google está limitando los pedidos. Esperá 30 segundos y volvé a intentar.' })
    }
    res.status(500).json({ error: e.message })
  }
}
