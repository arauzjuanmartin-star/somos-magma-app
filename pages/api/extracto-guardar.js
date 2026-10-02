// Guarda un extracto del banco: cada renglón queda en MOVIMIENTOS_BANCO ya cruzado con la app, y lo que
// coincide con algo que figuraba sin pagar o sin cobrar se marca con la fecha del banco.
//
// El cruce se hace ACÁ, con los datos del sheet leídos en este momento (lib/extracto.mjs, el mismo cálculo que
// usa la pantalla para mostrar el resumen): lo que manda el navegador son solo los renglones del banco y cuáles
// de las coincidencias la persona destildó. Así no se marca nada con datos viejos.
//
// NO suma ni resta en los saldos: la plata ya se movió en el banco. Si el extracto es de estos días, el saldo
// de la cuenta se pisa con el que trae el extracto (y queda anotado en "Hist saldos", como al cargarlo a mano).
import { getSheets, getAllData, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { cruzarExtracto, conClave } from '../../lib/extracto.mjs'

const HOJA = 'MOVIMIENTOS_BANCO'
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const num = v => parseFloat(String(v ?? '').replace(/[$,\s]/g, '')) || 0
const txt = v => String(v ?? '').trim()
// Un texto que empieza con = + - @ el sheet lo toma como fórmula y deja #ERROR!.
const texto = v => { const s = txt(v); return /^[=+\-@]/.test(s) ? `'${s}` : s }
const dmy = d => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
const TIPOS = { cobro: 'Cobro', transferencia: 'Transferencia', afip: 'AFIP', prestamo: 'Cuota de préstamo', tarjeta: 'Pago de tarjeta', sueldos: 'Sueldos', inversion: 'Inversión' }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { cuenta, movs = [], noMarcar = [], saldo, usarSaldo = false } = req.body || {}
  if (!txt(cuenta)) return res.status(400).json({ error: 'Falta la cuenta' })
  if (!Array.isArray(movs) || !movs.length) return res.status(400).json({ error: 'El extracto no trae movimientos' })
  if (movs.length > 2000) return res.status(400).json({ error: 'Son demasiados movimientos para una sola carga (máximo 2000). Subí un período más corto.' })

  // Los renglones del banco, tal como los leyó la pantalla: fecha (año-mes-día), concepto, código, detalle y monto con signo.
  const leidos = []
  for (const m of movs) {
    const f = txt(m.f).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/), monto = Number(m.m)
    if (!f || !txt(m.c) || !Number.isFinite(monto) || monto === 0) return res.status(400).json({ error: 'Hay un renglón del extracto que no se pudo leer. No guardé nada.' })
    leidos.push({ fecha: new Date(+f[1], +f[2] - 1, +f[3]), concepto: txt(m.c), codigo: txt(m.k), detalle: txt(m.d), monto })
  }

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const data = await getAllData()
    const laCuenta = (data.cuentas || []).find(c => txt(c['Nombre']).toLowerCase() === txt(cuenta).toLowerCase())
    if (!laCuenta) return res.status(400).json({ error: `No existe la cuenta "${cuenta}"` })
    const nombreCuenta = txt(laCuenta['Nombre'])

    // La solapa tiene que estar: si no hay dónde anotar los movimientos, no se marca nada (regla de oro: todo queda en el sheet).
    let headers = []
    try { headers = ((await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${HOJA}!1:1` }))).data.values?.[0] || []).map(txt) } catch (e) { /* no existe */ }
    const faltan = ['Cuenta', 'Fecha', 'Concepto', 'Entró', 'Salió', 'Estado', 'Clave'].filter(c => !headers.includes(c))
    if (faltan.length) return res.status(400).json({ error: `Falta la solapa ${HOJA} (o sus columnas ${faltan.join(', ')}). Hay que crearla con scripts/movimientos-banco-setup.mjs antes de subir extractos.` })

    const yaCargadas = new Set((data.movimientosBanco || []).filter(r => txt(r['Cuenta']) === nombreCuenta).map(r => txt(r['Clave'])))
    const { filas } = cruzarExtracto(conClave(leidos), data, { cuenta: nombreCuenta, yaCargadas })
    const destildadas = new Set((Array.isArray(noMarcar) ? noMarcar : []).map(txt))
    const aMarcar = filas.filter(x => x.estado === 'marcar' && x.ref && !destildadas.has(x.clave))

    // ---------- 1. Lo que se marca pagado o cobrado, con la fecha del banco. Un solo batchUpdate.
    const cab = {}
    for (const hoja of [...new Set(aMarcar.map(x => x.ref.hoja))]) cab[hoja] = ((await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${hoja}!1:1` }))).data.values?.[0] || []).map(txt)
    const updates = [], cobrosNuevos = [], marcados = []
    const poner = (hoja, fila, campo, valor) => { const i = cab[hoja].indexOf(campo); if (i >= 0) updates.push({ range: `${hoja}!${colLetra(i)}${fila}`, values: [[valor]] }) }
    const mesesDe = {}   // dos renglones del extracto pueden pagar dos meses del mismo gasto: se acumulan
    for (const x of aMarcar) {
      const { hoja, fila } = x.ref, fecha = dmy(x.fecha)
      if (hoja === 'GASTOS_FIJOS') {
        const g = (data.gastosFijos || []).find(r => r.__row === fila); if (!g) continue
        const mesKey = x.ref.mesKey || `${x.fecha.getMonth() + 1}/${x.fecha.getFullYear()}`
        const lista = mesesDe[fila] || txt(g['Meses pagados']).split(',').map(s => s.trim()).filter(Boolean)
        if (!lista.includes(mesKey)) lista.push(mesKey)
        mesesDe[fila] = lista
        poner(hoja, fila, 'Meses pagados', `'${lista.join(', ')}`)
        poner(hoja, fila, 'Pagado', 'SI'); poner(hoja, fila, 'Fecha pago', fecha); poner(hoja, fila, 'Cuenta pago', nombreCuenta)
      } else if (hoja === 'PRESTAMOS') {
        poner(hoja, fila, 'Pagado', 'SI'); poner(hoja, fila, 'Fecha pago', fecha); poner(hoja, fila, 'Cuenta pago', nombreCuenta)
      } else if (hoja === 'TARJETAS') {
        poner(hoja, fila, 'Pagado', 'SI'); poner(hoja, fila, 'Fecha pago', fecha); poner(hoja, fila, 'Cuenta pago', nombreCuenta); poner(hoja, fila, 'Monto pagado', Math.abs(x.monto))
      } else if (hoja === 'FACTURACION') {
        const f = (data.facturacion || []).find(r => r.__row === fila); if (!f) continue
        const final = num(f['Precio FINAL']), previo = num(f['Monto cobrado'])
        poner(hoja, fila, 'Cobrado', true); poner(hoja, fila, 'Fecha cobro', fecha); poner(hoja, fila, 'Monto cobrado', final)
        poner(hoja, fila, 'Cuenta destino', nombreCuenta); poner(hoja, fila, 'Forma de pago', 'Transferencia')
        cobrosNuevos.push([new Date().toISOString(), txt(f['N° Presupuesto']), texto(f['Cliente']), 'total', Math.max(0, final - previo), nombreCuenta, 'Transferencia', 0, 0, 0, 0, `Desde el extracto del banco (${fecha})`])
      } else continue
      marcados.push({ clave: x.clave, que: x.que, monto: x.monto, hoja })
    }

    // ---------- 2. El saldo de la cuenta pasa a ser el del extracto (misma forma que cuenta-saldo-update)
    let saldoNuevo = null
    if (usarSaldo && Number.isFinite(Number(saldo))) {
      const rows = (await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CUENTAS!A:N' }))).data.values || []
      const ch = (rows[0] || []).map(txt), i = rows.findIndex((r, k) => k > 0 && txt(r[ch.indexOf('Nombre')]) === nombreCuenta)
      if (i > 0) {
        const ar = new Date(Date.now() - 3 * 3600e3)   // hora de Argentina (el servidor corre en UTC)
        const hoy = `${ar.getUTCDate()}/${ar.getUTCMonth() + 1}/${ar.getUTCFullYear()}`, hora = `${String(ar.getUTCHours()).padStart(2, '0')}:${String(ar.getUTCMinutes()).padStart(2, '0')}`
        saldoNuevo = Number(saldo)
        updates.push({ range: `CUENTAS!${colLetra(ch.indexOf('Saldo actual'))}${i + 1}`, values: [[saldoNuevo]] })
        updates.push({ range: `CUENTAS!${colLetra(ch.indexOf('Última actualización'))}${i + 1}`, values: [[`${hoy} ${hora}`]] })
        const iH = ch.indexOf('Hist saldos')
        if (iH >= 0) { const prev = rows[i][iH] || ''; updates.push({ range: `CUENTAS!${colLetra(iH)}${i + 1}`, values: [[(prev + (prev ? '\n' : '') + `${hoy} ${hora} [${mail.split('@')[0]}]: $${saldoNuevo.toLocaleString('es-AR')} (extracto)`).split('\n').slice(-15).join('\n')]] }) }
      }
    }
    if (updates.length) await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates } }))

    // ---------- 3. Los renglones nuevos, cada dato en la columna que lleva su título
    const cuando = (() => { const ar = new Date(Date.now() - 3 * 3600e3); return `${ar.getUTCDate()}/${ar.getUTCMonth() + 1}/${ar.getUTCFullYear()}` })()
    const fueMarcado = new Set(marcados.map(m => m.clave))
    const nuevas = filas.filter(x => !x.yaCargada)
    const filaSheet = x => {
      const estado = x.estado === 'banco' ? 'Cargo del banco' : x.estado === 'ok' ? 'Coincide' : fueMarcado.has(x.clave) ? 'Marcado desde el extracto' : 'Para revisar'
      const queEs = x.estado === 'revisar' && x.candidatos.length ? `¿${x.candidatos.join(' o ')}?` : x.estado === 'banco' ? x.clase : x.que
      const dato = {
        'Cuenta': nombreCuenta, 'Fecha': dmy(x.fecha), 'Mes': `${x.fecha.getFullYear()}-${String(x.fecha.getMonth() + 1).padStart(2, '0')}`,
        'Concepto': texto(x.concepto), 'Detalle': texto([x.detalle, x.quien && !x.detalle.toLowerCase().includes(x.quien.toLowerCase()) ? x.quien : ''].filter(Boolean).join(' · ')),
        'Entró': x.monto > 0 ? x.monto : '', 'Salió': x.monto < 0 ? -x.monto : '', 'Qué es': texto(queEs), 'Estado': estado,
        'Tipo': x.estado === 'banco' ? x.clase : (TIPOS[x.tipo] || ''), 'Hoja': x.ref?.hoja && estado !== 'Para revisar' ? x.ref.hoja : '', 'Ref': x.ref && estado !== 'Para revisar' ? String(x.ref.nro || x.ref.fila || x.ref.persona || '') : '',
        'Cargado por': texto(mail), 'Cargado el': cuando, 'Clave': x.clave,
      }
      return headers.map(h => (h in dato ? dato[h] : ''))
    }
    let aviso = ''
    if (nuevas.length) {
      try {
        await withSheetsRetry(() => sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID, range: `${HOJA}!A:${colLetra(headers.length - 1)}`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
          requestBody: { values: nuevas.slice().sort((a, b) => a.fecha - b.fecha).map(filaSheet) },
        }))
      } catch (e) { console.error('extracto-guardar (movimientos):', e); aviso = `Marqué lo que coincidía, pero no pude anotar los movimientos en ${HOJA}: ${e.message}. Volvé a subir el mismo archivo.` }
    }
    if (cobrosNuevos.length) { try { await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'COBROS!A:L', valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: cobrosNuevos } }) } catch (e) { console.error('extracto-guardar (cobros):', e) } }

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'extracto-guardar', HOJA, nombreCuenta, `${filas.length} renglones (${nuevas.length} nuevos${aviso ? ' SIN ANOTAR' : ''}) · marcados ${marcados.length}: ${marcados.map(m => m.que).join(' | ')}${saldoNuevo !== null ? ` · saldo ${saldoNuevo}` : ''}`.slice(0, 900)]] },
      })
    } catch (e) {}

    res.json({ ok: true, total: filas.length, nuevas: aviso ? 0 : nuevas.length, repetidas: filas.length - nuevas.length, marcados, saldo: saldoNuevo, aviso })
  } catch (e) {
    console.error('extracto-guardar:', e)
    const status = e.code || e.response?.status
    if (status === 429) return res.status(429).json({ error: 'Google está limitando los pedidos. Esperá 30 segundos y volvé a subir el extracto.' })
    res.status(500).json({ error: e.message })
  }
}
