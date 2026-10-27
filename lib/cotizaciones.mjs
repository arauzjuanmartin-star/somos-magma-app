/**
 * COTIZACIONES: el dólar y la inflación mes a mes, para leer el Histórico sin que la inflación lo engañe.
 * Juan, 27/10/2026: "más allá del precio tendría que ver la inflación o tendría que estar en dólares".
 *
 * Una fila por mes en la solapa COTIZACIONES del Master: el promedio del dólar (venta) de cada día del mes y la
 * inflación del mes (IPC del INDEC). Fuente: api.argentinadatos.com (datos públicos, sin clave).
 *   · se carga entera con `node scripts/cotizaciones.mjs --escribir` (preview por default)
 *   · y se mantiene sola: el cron de la mañana (pages/api/cron/diaria) reescribe los últimos meses cada día.
 *
 * El Histórico convierte cada trabajo con el mes de su evento:
 *   · dólares      = pesos ÷ dólar blue promedio de ese mes
 *   · pesos de hoy = pesos × la inflación acumulada desde ese mes hasta el último IPC publicado
 */
export const HOJA_COTIZACIONES = 'COTIZACIONES'
export const HEADERS_COTIZACIONES = ['Mes', 'Dólar blue', 'Dólar oficial', 'Dólar MEP', 'Inflación del mes %', 'Actualizado']
export const DESDE = '2023-01'
const API = 'https://api.argentinadatos.com/v1'

const txt = v => String(v ?? '').trim()
// El Master muestra los números en formato US ("1,474.35"); por las dudas acepta también el argentino ("1.474,35"):
// el separador que aparece último es el decimal.
const num = v => { if (typeof v === 'number') return v; let t = txt(v).replace(/[^\d,.-]/g, ''); const p = Math.max(t.lastIndexOf('.'), t.lastIndexOf(',')); if (p >= 0 && t.length - p - 1 !== 3) t = t.slice(0, p).replace(/[.,]/g, '') + '.' + t.slice(p + 1); else t = t.replace(/[.,]/g, ''); const n = parseFloat(t); return isNaN(n) ? 0 : n }
const dd = n => String(n).padStart(2, '0')
export const claveMes = d => `${d.getFullYear()}-${dd(d.getMonth() + 1)}`

async function json(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' } })
  if (!r.ok) throw new Error(`${url} contestó ${r.status}`)
  return r.json()
}
const promedioPorMes = filas => {
  const m = {}
  for (const f of filas || []) { const k = txt(f.fecha).slice(0, 7), v = Number(f.venta); if (!k || !(v > 0)) continue; (m[k] = m[k] || []).push(v) }
  return Object.fromEntries(Object.entries(m).map(([k, vs]) => [k, Math.round(vs.reduce((s, v) => s + v, 0) / vs.length * 100) / 100]))
}

/** Trae de la API las filas de cada mes desde DESDE hasta el mes en curso. */
export async function traerCotizaciones(hoy = new Date()) {
  const [blue, oficial, mep, ipc] = await Promise.all([
    json(`${API}/cotizaciones/dolares/blue`), json(`${API}/cotizaciones/dolares/oficial`),
    json(`${API}/cotizaciones/dolares/bolsa`), json(`${API}/finanzas/indices/inflacion`),
  ])
  const pB = promedioPorMes(blue), pO = promedioPorMes(oficial), pM = promedioPorMes(mep)
  const inf = Object.fromEntries((ipc || []).map(x => [txt(x.fecha).slice(0, 7), Number(x.valor)]))
  const filas = []
  for (let d = new Date(+DESDE.slice(0, 4), +DESDE.slice(5) - 1, 1); d <= hoy; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const k = claveMes(d)
    filas.push({ mes: k, blue: pB[k] || '', oficial: pO[k] || '', mep: pM[k] || '', ipc: inf[k] ?? '' })
  }
  return filas
}

/**
 * Deja la solapa al día: la crea si no existe, agrega los meses que faltan y reescribe los que cambiaron (el mes en
 * curso cambia todos los días; el IPC de un mes aparece a mediados del siguiente). Nunca borra filas.
 */
export async function sincronizarCotizaciones({ sheets, SHEET_ID, dry = false, hoy = new Date(), retry = f => f() }) {
  const filas = await traerCotizaciones(hoy)
  const meta = await retry(() => sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' }))
  let hoja = meta.data.sheets.find(s => s.properties.title === HOJA_COTIZACIONES)
  if (!hoja && dry) return { ok: true, dry, crear: true, meses: filas.length, ultimo: filas[filas.length - 1] }
  if (!hoja) {
    const r = await retry(() => sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: HOJA_COTIZACIONES, gridProperties: { frozenRowCount: 1 } } } }] } }))
    hoja = { properties: r.data.replies[0].addSheet.properties }
    await retry(() => sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${HOJA_COTIZACIONES}!A1`, valueInputOption: 'RAW', requestBody: { values: [HEADERS_COTIZACIONES] } }))
    const id = hoja.properties.sheetId
    // Presentable para el que la abre en el sheet: título en negrita, montos con separador de miles, filtro.
    await retry(() => sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [
      { repeatCell: { range: { sheetId: id, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.95, green: 0.94, blue: 0.92 } } }, fields: 'userEnteredFormat(textFormat,backgroundColor)' } },
      { repeatCell: { range: { sheetId: id, startRowIndex: 1, startColumnIndex: 1, endColumnIndex: 4 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0.00' } } }, fields: 'userEnteredFormat.numberFormat' } },
      { repeatCell: { range: { sheetId: id, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0.0' } } }, fields: 'userEnteredFormat.numberFormat' } },
      { setBasicFilter: { filter: { range: { sheetId: id, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: HEADERS_COTIZACIONES.length } } } },
      { updateDimensionProperties: { range: { sheetId: id, dimension: 'COLUMNS', startIndex: 0, endIndex: HEADERS_COTIZACIONES.length }, properties: { pixelSize: 130 }, fields: 'pixelSize' } },
    ] } }))
  }
  const actual = (await retry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${HOJA_COTIZACIONES}!A:F` }))).data.values || []
  const H = (actual[0] || []).map(txt), c = n => H.indexOf(n)
  if (HEADERS_COTIZACIONES.some(h => c(h) < 0)) throw new Error(`A la solapa ${HOJA_COTIZACIONES} le faltan columnas`)
  const filaDe = {}; actual.forEach((r, i) => { if (i > 0 && txt(r[c('Mes')])) filaDe[txt(r[c('Mes')]).replace(/^'/, '')] = { i: i + 1, r } })
  const sello = `${dd(hoy.getDate())}/${dd(hoy.getMonth() + 1)}/${hoy.getFullYear()}`
  const valores = f => [`'${f.mes}`, f.blue, f.oficial, f.mep, f.ipc, sello]
  const iguales = (r, f) => [['Dólar blue', f.blue], ['Dólar oficial', f.oficial], ['Dólar MEP', f.mep], ['Inflación del mes %', f.ipc]].every(([h, v]) => num(r[c(h)]) === num(v))
  const updates = [], nuevas = []
  for (const f of filas) {
    const ya = filaDe[f.mes]
    if (!ya) nuevas.push(valores(f))
    else if (!iguales(ya.r, f)) updates.push({ range: `${HOJA_COTIZACIONES}!A${ya.i}:F${ya.i}`, values: [valores(f)] })
  }
  if (dry) return { ok: true, dry, nuevas: nuevas.length, cambian: updates.length, ultimo: filas[filas.length - 1] }
  if (updates.length) await retry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates } }))
  if (nuevas.length) await retry(() => sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: `${HOJA_COTIZACIONES}!A:F`, valueInputOption: 'USER_ENTERED', requestBody: { values: nuevas } }))
  return { ok: true, nuevas: nuevas.length, cambian: updates.length, ultimo: filas[filas.length - 1] }
}

/** Para la app: la solapa leída (filas como objetos) → tabla por mes con los factores ya calculados. */
export function tablaCotizaciones(rows) {
  const t = {}
  for (const r of rows || []) {
    const mes = txt(r['Mes']).replace(/^'/, ''); if (!/^\d{4}-\d{2}$/.test(mes)) continue
    t[mes] = { blue: num(r['Dólar blue']), oficial: num(r['Dólar oficial']), mep: num(r['Dólar MEP']), ipc: txt(r['Inflación del mes %']) === '' ? null : num(r['Inflación del mes %']) }
  }
  const meses = Object.keys(t).sort()
  // Pesos de hoy: cuánto vale hoy $1 de ese mes = la inflación de los meses SIGUIENTES, hasta el último IPC publicado.
  let acum = 1
  for (let i = meses.length - 1; i >= 0; i--) { t[meses[i]].aHoy = acum; const ipc = t[meses[i]].ipc; if (ipc !== null) acum *= 1 + ipc / 100 }
  const conIpc = meses.filter(m => t[m].ipc !== null)
  return { t, meses, ultimoIpc: conIpc[conIpc.length - 1] || '', ultimoMes: meses[meses.length - 1] || '' }
}
/** Un monto en pesos de una fecha, en la vista pedida: 'usd' (blue del mes), 'hoy' (pesos de hoy) o 'pesos' (tal cual). */
export function convertir(monto, fecha, tabla, vista) {
  if (vista === 'pesos' || !fecha || !tabla) return monto
  // Un mes que todavía no tiene cotización (un trabajo de noviembre aprobado en octubre) usa la última que hay.
  const k = claveMes(fecha), x = tabla.t[k] || (k > tabla.ultimoMes ? tabla.t[tabla.ultimoMes] : null)
  if (vista === 'usd') return x && x.blue > 0 ? monto / x.blue : null
  if (vista === 'hoy') return x ? monto * x.aHoy : null
  return monto
}
