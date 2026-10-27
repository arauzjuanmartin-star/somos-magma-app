import { getSheets, withSheetsRetry, COL_PAQUETE, HEADERS_PAQUETE } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

// Paquete de eventos (Juan, 27/10/2026): varios presupuestos del mismo cliente que se mandan
// en un solo PDF, con el precio de cada evento y un descuento si cierra todos. Cada evento
// sigue siendo su propio presupuesto; acá solo se escriben las columnas EA-EC (lib/slots.js).
//
// Acciones:
//   armar     { nros:[…], pct, codigo? }  agrupa esos N° (código = "P-<el menor>" si no viene)
//   pct       { codigo, pct }             cambia el % del paquete
//   sacar     { nro }                     saca un evento del paquete (si tenía el descuento, lo devuelve)
//   cerrar    { codigo }                  el cliente cerró todo: baja el Precio Final de cada evento ese %
//   deshacer  { codigo }                  vuelve cada evento a su precio de lista
//
// El descuento mueve SOLO el Ajuste (misma cuenta que /api/presupuesto-precio): sale del margen
// Magma, nunca de lo que se le paga al staff, y Subtotal+Fee+Gan+IIBB+Interés+Ajuste sigue
// dando el Precio Final. Si el evento ya está aprobado, se espeja a PROYECTOS.

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
// Los montos del sheet vienen en formato US (" $1,234,567.00")
const num = v => { const s=String(v||'').replace(/[\s$]/g,''); if(!s) return 0; return Number(s.replace(/,/g,'')) || 0 }
const P = { nro:0, estado:3, precioFinal:8, subtotal:38, fee:39, gan:40, iibb:41, interes:44, total:45, ajuste:46 }
const PR = { nro:2, total:7, totalBG:58, ajuste:59 }
const [COL_COD, COL_PCT, COL_LISTA] = [COL_PAQUETE, COL_PAQUETE + 1, COL_PAQUETE + 2]
const VIVOS = ['EN ESPERA', 'APROBADO', 'EN CURSO', 'ENTREGADO']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const { accion } = req.body || {}
  const pctIn = Math.min(50, Math.max(0, Number(String(req.body?.pct ?? '').replace(',', '.')) || 0))

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const rows = (await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `PRESUPUESTOS!A:${colLetra(COL_LISTA)}` }))).data.values || []
    const h = rows[0] || []
    if (HEADERS_PAQUETE.some((t, i) => h[COL_PAQUETE + i] !== t))
      return res.status(409).json({ error: 'Faltan las columnas del paquete en PRESUPUESTOS (node scripts/presupuestos-columnas-paquete.mjs --escribir).' })

    const filaDe = nro => { for (let i = 1; i < rows.length; i++) if (String(rows[i][P.nro]||'').trim() === String(nro).trim()) return i; return -1 }
    const delPaquete = codigo => rows.map((r, i) => ({ r, i })).filter(({ r, i }) => i > 0 && String(r[COL_COD]||'').trim() === String(codigo||'').trim() && codigo)
    const data = [], espejo = []   // espejo: {nro, precio, ajuste} para PROYECTOS
    const set = (i, col, v) => data.push({ range: `PRESUPUESTOS!${colLetra(col)}${i + 1}`, values: [[v]] })
    // Fija el precio de un evento moviendo solo el Ajuste
    const fijarPrecio = (i, nuevo) => {
      const r = rows[i]
      const partes = num(r[P.subtotal]) + num(r[P.fee]) + num(r[P.gan]) + num(r[P.iibb]) + num(r[P.interes])
      const ajuste = Math.round(nuevo - partes)
      set(i, P.precioFinal, nuevo); set(i, P.total, nuevo); set(i, P.ajuste, ajuste)
      if (String(r[P.estado]||'').toUpperCase() !== 'EN ESPERA') espejo.push({ nro: String(r[P.nro]).trim(), precio: nuevo, ajuste })
    }
    let detalle = '', codigo = String(req.body?.codigo || '').trim()

    if (accion === 'armar') {
      const nros = [...new Set((req.body.nros || []).map(n => String(n).trim()).filter(Boolean))]
      if (nros.length < 2) return res.status(400).json({ error: 'Un paquete necesita al menos 2 eventos' })
      const filas = nros.map(filaDe)
      const falta = nros.filter((_, k) => filas[k] < 0)
      if (falta.length) return res.status(404).json({ error: `No encontré: #${falta.join(', #')}` })
      const otro = filas.find(i => { const c = String(rows[i][COL_COD]||'').trim(); return c && c !== codigo })
      if (otro !== undefined) return res.status(409).json({ error: `#${rows[otro][P.nro]} ya está en el paquete ${rows[otro][COL_COD]}. Sacalo de ahí primero.` })
      if (!codigo) codigo = 'P-' + Math.min(...nros.map(n => parseInt(n) || Infinity))
      // El % vale para todo el paquete: también para los eventos que ya estaban adentro
      const todas = [...new Set([...filas, ...delPaquete(codigo).map(x => x.i)])]
      todas.forEach(i => { set(i, COL_COD, codigo); set(i, COL_PCT, pctIn || '') })
      detalle = `armar ${codigo}: #${todas.map(i => rows[i][P.nro]).join(', #')} · ${pctIn}%`
    } else if (accion === 'pct') {
      const ev = delPaquete(codigo)
      if (!ev.length) return res.status(404).json({ error: `No encontré el paquete ${codigo}` })
      if (ev.some(x => num(x.r[COL_LISTA]) > 0)) return res.status(409).json({ error: 'El descuento ya está aplicado. Deshacelo primero para cambiar el %.' })
      ev.forEach(({ i }) => set(i, COL_PCT, pctIn || ''))
      detalle = `${codigo} → ${pctIn}%`
    } else if (accion === 'sacar') {
      const i = filaDe(req.body.nro)
      if (i < 0) return res.status(404).json({ error: `No encontré #${req.body.nro}` })
      codigo = String(rows[i][COL_COD]||'').trim()
      const lista = num(rows[i][COL_LISTA])
      if (lista > 0) fijarPrecio(i, lista)
      set(i, COL_COD, ''); set(i, COL_PCT, ''); set(i, COL_LISTA, '')
      // Un paquete de uno no es un paquete: si queda uno solo, se desarma
      const quedan = delPaquete(codigo).filter(x => x.i !== i)
      if (quedan.length === 1) { const q = quedan[0]; const l = num(q.r[COL_LISTA]); if (l > 0) fijarPrecio(q.i, l); set(q.i, COL_COD, ''); set(q.i, COL_PCT, ''); set(q.i, COL_LISTA, '') }
      detalle = `sacar #${req.body.nro} de ${codigo}${quedan.length === 1 ? ' (se desarmó)' : ''}${lista > 0 ? ` · vuelve a ${lista}` : ''}`
    } else if (accion === 'cerrar') {
      const ev = delPaquete(codigo).filter(x => VIVOS.includes(String(x.r[P.estado]||'').toUpperCase()))
      if (ev.length < 2) return res.status(400).json({ error: 'El paquete tiene menos de 2 eventos vivos' })
      const pct = num(ev[0].r[COL_PCT])
      if (!(pct > 0)) return res.status(400).json({ error: 'El paquete no tiene descuento cargado' })
      if (ev.some(x => num(x.r[COL_LISTA]) > 0)) return res.status(409).json({ error: 'El descuento ya está aplicado' })
      // Redondeo a los $1.000: al cliente no le mandamos $2.159.640
      ev.forEach(({ r, i }) => { const lista = num(r[P.precioFinal]); set(i, COL_LISTA, lista); fijarPrecio(i, Math.round(lista * (1 - pct / 100) / 1000) * 1000) })
      detalle = `cerrar ${codigo} −${pct}%: ` + ev.map(({ r, i }) => `#${r[P.nro]} ${num(r[P.precioFinal])}→${data.find(d => d.range === `PRESUPUESTOS!${colLetra(P.precioFinal)}${i + 1}`).values[0][0]}`).join(', ')
    } else if (accion === 'deshacer') {
      const ev = delPaquete(codigo).filter(x => num(x.r[COL_LISTA]) > 0)
      if (!ev.length) return res.status(400).json({ error: 'No hay descuento aplicado para deshacer' })
      ev.forEach(({ r, i }) => { fijarPrecio(i, num(r[COL_LISTA])); set(i, COL_LISTA, '') })
      detalle = `deshacer ${codigo}: ` + ev.map(({ r }) => `#${r[P.nro]} → ${num(r[COL_LISTA])}`).join(', ')
    } else return res.status(400).json({ error: 'Acción desconocida' })

    await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data } }))

    // Espejo a PROYECTOS de los eventos que ya estaban aprobados
    if (espejo.length) {
      try {
        const pRows = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:C' })).data.values || []
        const dp = []
        espejo.forEach(e => {
          const k = pRows.findIndex((r, j) => j > 0 && String(r[PR.nro]||'').trim() === e.nro)
          if (k > 0) [[PR.total, e.precio], [PR.totalBG, e.precio], [PR.ajuste, e.ajuste]].forEach(([c, v]) => dp.push({ range: `PROYECTOS!${colLetra(c)}${k + 1}`, values: [[v]] }))
        })
        if (dp.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: dp } })
      } catch (e) { console.warn('paquete: espejo a PROYECTOS falló', e.message) }
    }

    try {
      await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), auth.mail, 'paquete-' + accion, 'PRESUPUESTOS', codigo, detalle]] } })
    } catch (e) {}

    res.json({ ok: true, codigo, detalle })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
