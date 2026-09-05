/**
 * BRIEF COMERCIAL — la base de datos real para salir a buscar clientes.
 * Responde: qué vendemos y a qué precio · quiénes son los clientes de los últimos 2 años
 * (recurrentes vs one-shot) · quiénes se perdieron y cuánta plata eran · con qué marcas
 * finales trabajamos · a quién hay que escribirle (contactos).
 * Fuentes: PROYECTOS (2026) + HISTORICO_2025/2024/2023 + Contactos/agencias. Solo lectura.
 * Salida: consola + JSON en scratchpad para armar el documento.
 */
import { google } from 'googleapis'
import { readFileSync, writeFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('/Users/dronjuan/somos-magma-app/.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('='); let v = l.slice(i + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    return [l.slice(0, i).trim(), v]
  })
)
const auth = new google.auth.GoogleAuth({
  credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
})
const sheets = google.sheets({ version: 'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const OUT = process.argv[2] || '/private/tmp/claude-501/-Users-dronjuan-somos-magma-app/88a6b4cf-8806-42ec-8c72-326301b9c666/scratchpad/brief-comercial.json'

const txt = v => { const s = String(v ?? '').trim(); return /^#(ERROR|REF|N\/A|VALUE|NAME|DIV|NUM|NULL)/.test(s) ? '' : s }
// El sheet guarda montos en formato US ($1,250,000.00) pero el histórico los tiene planos (955418.5)
const num = v => {
  let s = txt(v).replace(/[$\s]/g, '')
  if (!s) return 0
  if (/^-?[\d.]+,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.') // por si aparece formato AR
  else s = s.replace(/,/g, '')
  const n = parseFloat(s.replace(/[^\d.-]/g, ''))
  return isNaN(n) ? 0 : n
}
const fecha = v => {
  const m = txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (!m) return null
  let y = +m[3]; if (y < 100) y += 2000
  if (y < 2020 || y > 2027) return null            // typos del sheet (ej: 08/09/2924)
  const d = new Date(y, +m[2] - 1, +m[1]); return isNaN(d) ? null : d
}
const money = n => '$' + Math.round(n).toLocaleString('es-AR')
const HOY = new Date('2026-08-13T00:00:00'); HOY.setHours(0, 0, 0, 0)
const dd = d => d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '—'
const norm = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
const mediana = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

const R = await sheets.spreadsheets.values.batchGet({
  spreadsheetId: ID,
  ranges: ['PROYECTOS', 'HISTORICO_2025', 'HISTORICO_2024', 'HISTORICO_2023', 'Contactos/agencias', 'AGENCIAS', 'CLIENTES'],
  valueRenderOption: 'FORMATTED_VALUE',
})
const [proy, h25, h24, h23, contactos, agencias, clientesTab] = R.data.valueRanges.map(v => v.values || [])

// ───────────────────────── universo de trabajos ─────────────────────────
// Cada trabajo: {anio, fecha, contratante, esAgencia, marca, proyecto, monto, pedidos:[]}
const trabajos = []

// 2026 — PROYECTOS
{
  const H = (proy[0] || []).map(h => txt(h).toLowerCase())
  const iAg = H.indexOf('agencia'), iCli = H.indexOf('cliente'), iProy = H.indexOf('proyecto')
  const iFe = H.indexOf('fecha evento'), iTot = H.indexOf('total'), iNro = H.indexOf('n° presupuesto')
  const iNoFact = H.indexOf('no facturable')
  const PEDIDOS = [11, 14, 17, 20, 23, 26, 29, 32, 35, 38, 41, 44, 60, 63, 66, 69, 72, 75, 78, 81]
  for (const row of proy.slice(1)) {
    if (txt(row[iNoFact]).toUpperCase() === 'TRUE' || txt(row[iNoFact]).toUpperCase() === 'SI') continue
    const monto = num(row[iTot])
    const nombreProy = txt(row[iProy])
    if (!nombreProy && !monto) continue
    const ag = txt(row[iAg]), cli = txt(row[iCli])
    trabajos.push({
      anio: 2026, fecha: fecha(row[iFe]), nro: txt(row[iNro]),
      contratante: ag || cli || '(sin nombre)',
      esAgencia: !!ag && norm(ag) !== norm(cli),   // si Agencia == Cliente es venta directa, no canal
      marca: cli || ag, proyecto: nombreProy, monto,
      pedidos: PEDIDOS.map(i => txt(row[i])).filter(Boolean),
    })
  }
}

// 2025 y 2024 — HISTORICO (col 4 = quien contrata, col 5 = agencia si aplica, col 6 = nombre del trabajo)
for (const [anio, rows] of [[2025, h25], [2024, h24], [2023, h23]]) {
  const H = (rows[0] || []).map(h => txt(h).toLowerCase())
  const iCli = H.indexOf('cliente'), iAg = H.indexOf('agencia'), iProy = H.indexOf('proyecto')
  const iFe = H.indexOf('fecha'), iMes = H.indexOf('mes'), iPres = H.indexOf('presupuesto')
  for (const row of rows.slice(1)) {
    const monto = num(row[iPres])
    const cli = txt(row[iCli]), ag = txt(row[iAg]), nombreProy = txt(row[iProy])
    if (!cli && !ag && !monto) continue
    let f = fecha(row[iFe])
    if (!f) { const m = parseInt(txt(row[iMes]), 10); if (m >= 1 && m <= 12) f = new Date(anio, m - 1, 15) }
    trabajos.push({
      anio, fecha: f, nro: '',
      contratante: ag || cli || '(sin nombre)', esAgencia: !!ag,
      marca: nombreProy || cli, proyecto: nombreProy, monto, pedidos: [],
    })
  }
}

// ───────────────────────── A. qué se vende y a qué precio (2026) ─────────────────────────
// normalización de pedidos → recurso real (misma lógica que scripts/pareto-proyectos.mjs:
// el emoji y el tipo foto/video/film no cambian el recurso — es una persona con una cámara)
const recurso = p => {
  const s = txt(p).replace(/[^\p{L}\p{N}\s½/+-]/gu, '').trim().toLowerCase()
  if (!s) return null
  if (/^(viaticos|comision|otros|servicio)/.test(s)) return null
  if (/edit/.test(s)) return 'Edición'
  if (/asist/.test(s)) return 'Asistente'
  if (/produ/.test(s)) return 'Producción'
  if (/drone|fpv/.test(s)) return 'Drone'
  if (/vivo/.test(s)) return 'Vivo/streaming'
  if (/motion/.test(s)) return 'Motion'
  if (/makeup|model/.test(s)) return 'Maquillaje/modelo'
  if (/sonido|locu/.test(s)) return 'Sonido/locución'
  if (/dirfoto|colorista/.test(s)) return 'Dir. foto/color'
  if (/rental/.test(s)) return 'Rental'
  if (/crudos/.test(s)) return 'Entrega de crudos'
  if (/12hs/.test(s)) return 'Jornada larga (12hs)'
  if (/(foto|video|film|fotos)\s*(½|1\/2)/.test(s)) return '½ jornada'
  if (/(foto|video|film|fotos)\s*1?$/.test(s)) return '1 jornada'
  return 'Otros'
}
const t2026 = trabajos.filter(t => t.anio === 2026)
const porNro = {}
for (const t of t2026) {
  const k = t.nro || `${t.contratante}|${t.proyecto}|${t.fecha && t.fecha.getTime()}`
  const g = porNro[k] = porNro[k] || { monto: 0, recursos: [], contratante: t.contratante, proyecto: t.proyecto, marca: t.marca }
  g.monto = Math.max(g.monto, t.monto)  // el mismo N° repetido en varias filas trae el mismo total
  for (const p of t.pedidos) { const r = recurso(p); if (r) g.recursos.push(r) }
}
const recetas = {}
for (const g of Object.values(porNro)) {
  const cnt = {}
  for (const r of g.recursos) cnt[r] = (cnt[r] || 0) + 1
  const receta = Object.entries(cnt).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([r, c]) => c > 1 ? `${r} ×${c}` : r).join(' + ') || '(sin pedidos cargados)'
  const x = recetas[receta] = recetas[receta] || { n: 0, monto: 0, tickets: [] }
  x.n++; x.monto += g.monto; x.tickets.push(g.monto)
}
const recetasTop = Object.entries(recetas).map(([r, v]) => ({ receta: r, ...v, ticket: v.monto / v.n, medi: mediana(v.tickets) }))
  .sort((a, b) => b.monto - a.monto)

const montos2026 = Object.values(porNro).map(g => g.monto).filter(m => m > 0)

// ───────────────────────── B. clientes (contratantes) ─────────────────────────
const C = {}
for (const t of trabajos) {
  const key = norm(t.contratante) || '(sin nombre)'
  const c = C[key] = C[key] || {
    nombre: t.contratante, esAgencia: t.esAgencia,
    y: { 2023: 0, 2024: 0, 2025: 0, 2026: 0 }, n: { 2023: 0, 2024: 0, 2025: 0, 2026: 0 },
    primera: null, ultima: null, proximo: null, marcas: new Set(), tickets: [],
  }
  if (t.contratante.length > c.nombre.length) c.nombre = t.contratante // el nombre más completo
  c.esAgencia = c.esAgencia || t.esAgencia
  c.y[t.anio] += t.monto; c.n[t.anio]++
  if (t.monto > 0) c.tickets.push(t.monto)
  if (t.marca && norm(t.marca) !== key) c.marcas.add(t.marca)
  if (t.fecha) {
    if (!c.primera || t.fecha < c.primera) c.primera = t.fecha
    if (t.fecha <= HOY) { if (!c.ultima || t.fecha > c.ultima) c.ultima = t.fecha }       // último trabajo hecho
    else if (!c.proximo || t.fecha < c.proximo) c.proximo = t.fecha                        // evento ya agendado
  }
}
const clientes = Object.values(C).map(c => {
  const total = c.y[2023] + c.y[2024] + c.y[2025] + c.y[2026]
  const nTotal = c.n[2023] + c.n[2024] + c.n[2025] + c.n[2026]
  const dias = c.ultima ? Math.round((HOY - c.ultima) / 86400000) : null
  const anios = [2023, 2024, 2025, 2026].filter(a => c.n[a] > 0).length
  let estado
  if (c.proximo) estado = 'ACTIVO'                                       // tiene evento agendado a futuro
  else if (c.n[2026] > 0 && dias !== null && dias <= 60) estado = 'ACTIVO'
  else if (c.n[2026] > 0 && dias !== null && dias <= 150) estado = 'ENFRIÁNDOSE'
  else if (c.n[2026] > 0) estado = 'DORMIDO'
  else estado = 'PERDIDO'
  const recurrente = anios >= 2 || nTotal >= 3
  return {
    nombre: c.nombre, esAgencia: c.esAgencia, y: c.y, n: c.n, total, nTotal,
    primera: c.primera, ultima: c.ultima, proximo: c.proximo, dias, estado, recurrente, anios,
    ticket: nTotal ? total / nTotal : 0, medi: mediana(c.tickets),
    marcas: [...c.marcas].slice(0, 12),
  }
}).filter(c => c.total > 0 || c.nTotal > 0)
clientes.sort((a, b) => b.total - a.total)

// ───────────────────────── C. contactos ─────────────────────────
const contactosPorAgencia = {}
{
  const H = (contactos[0] || []).map(h => txt(h).toLowerCase())
  const iN = H.indexOf('nombre'), iM = H.indexOf('mail'), iA = H.indexOf('agencia'), iC = H.indexOf('cargo'), iT = H.indexOf('teléfono') >= 0 ? H.indexOf('teléfono') : H.indexOf('telefono')
  for (const row of contactos.slice(1)) {
    const ag = txt(row[iA]); if (!ag) continue
    const k = norm(ag)
      ; (contactosPorAgencia[k] = contactosPorAgencia[k] || []).push({
        nombre: txt(row[iN]), mail: txt(row[iM]), cargo: txt(row[iC]), tel: txt(row[iT]).replace(/[‪-‮⁦-⁩]/g, ''), agencia: ag,
      })
  }
}
for (const c of clientes) c.contactos = contactosPorAgencia[norm(c.nombre)] || []

// ───────────────────────── salida a consola ─────────────────────────
const L = s => console.log(s)
const tot = a => clientes.reduce((s, c) => s + c.y[a], 0)
L(`\n${'█'.repeat(78)}\n  BRIEF COMERCIAL SOMOS MAGMA — data real al ${dd(HOY)}\n${'█'.repeat(78)}`)
L(`\n  Facturado (sin IVA):  2023 ${money(tot(2023))} · 2024 ${money(tot(2024))} · 2025 ${money(tot(2025))} · 2026 ${money(tot(2026))} (año en curso, incluye eventos ya agendados)`)
L(`  Trabajos:             2023 ${clientes.reduce((s, c) => s + c.n[2023], 0)} · 2024 ${clientes.reduce((s, c) => s + c.n[2024], 0)} · 2025 ${clientes.reduce((s, c) => s + c.n[2025], 0)} · 2026 ${clientes.reduce((s, c) => s + c.n[2026], 0)}`)
L(`  Proyectos 2026 (agrupados por N° presu): ${montos2026.length} · ticket promedio ${money(montos2026.reduce((a, b) => a + b, 0) / montos2026.length)} · mediana ${money(mediana(montos2026))}`)
const viaAg = t2026.filter(t => t.esAgencia).reduce((s, t) => s + t.monto, 0)
L(`  Vía agencia 2026: ${money(viaAg)} (${Math.round(viaAg / tot(2026) * 100)}%) · directo: ${money(tot(2026) - viaAg)}`)

L(`\n\n═══ A · QUÉ SE VENDE Y A QUÉ PRECIO (2026, top 12 recetas) ═══\n`)
L(`  ${'RECETA'.padEnd(38)}${'PROY'.padStart(6)}${'FACTURADO'.padStart(16)}${'TICKET PROM'.padStart(14)}${'MEDIANA'.padStart(14)}`)
L(`  ${'─'.repeat(88)}`)
for (const r of recetasTop.slice(0, 12)) {
  L(`  ${r.receta.slice(0, 37).padEnd(38)}${String(r.n).padStart(6)}${money(r.monto).padStart(16)}${money(r.ticket).padStart(14)}${money(r.medi).padStart(14)}`)
}

L(`\n\n═══ B · TOP 25 CLIENTES POR PLATA (3 años) ═══\n`)
L(`  ${'CLIENTE'.padEnd(24)}${'2023'.padStart(12)}${'2024'.padStart(13)}${'2025'.padStart(13)}${'2026'.padStart(13)}${'TRAB'.padStart(6)} ${'DESDE'.padEnd(11)} ESTADO`)
L(`  ${'─'.repeat(95)}`)
for (const c of clientes.slice(0, 25)) {
  L(`  ${c.nombre.slice(0, 23).padEnd(24)}${money(c.y[2023]).padStart(12)}${money(c.y[2024]).padStart(13)}${money(c.y[2025]).padStart(13)}${money(c.y[2026]).padStart(13)}${String(c.nTotal).padStart(6)} ${dd(c.primera).padEnd(11)} ${c.estado}${c.recurrente ? ' · recurrente' : ' · one-shot'}`)
}

const perdidos = clientes.filter(c => c.estado === 'PERDIDO' && (c.y[2025] + c.y[2024]) > 0).sort((a, b) => (b.y[2025] + b.y[2024]) - (a.y[2025] + a.y[2024]))
L(`\n\n═══ C · PERDIDOS — facturaron en 2024/2025, CERO en 2026 (${perdidos.length} clientes, ${money(perdidos.reduce((s, c) => s + c.y[2024] + c.y[2025], 0))} de los dos años) ═══\n`)
L(`  ${'CLIENTE'.padEnd(26)}${'2024+2025'.padStart(14)}${'TRAB'.padStart(6)}  ${'ÚLTIMA VEZ'.padEnd(12)}  CONTACTO`)
L(`  ${'─'.repeat(95)}`)
for (const c of perdidos.slice(0, 25)) {
  const ct = c.contactos[0] ? `${c.contactos[0].nombre} · ${c.contactos[0].mail}` : '— sin contacto cargado —'
  L(`  ${c.nombre.slice(0, 25).padEnd(26)}${money(c.y[2024] + c.y[2025]).padStart(14)}${String(c.nTotal).padStart(6)}  ${dd(c.ultima).padEnd(12)}  ${ct.slice(0, 45)}`)
}

const oneShot = clientes.filter(c => !c.recurrente && c.total > 0).sort((a, b) => b.total - a.total)
L(`\n\n═══ D · ONE-SHOT (vinieron una vez y no volvieron) — ${oneShot.length} de ${clientes.length} clientes, ${money(oneShot.reduce((s, c) => s + c.total, 0))} ═══\n`)
for (const c of oneShot.slice(0, 15)) L(`  ${c.nombre.slice(0, 30).padEnd(32)}${money(c.total).padStart(14)}   ${dd(c.ultima)}`)

const recur = clientes.filter(c => c.recurrente)
L(`\n\n  RESUMEN: ${clientes.length} clientes en 3 años · ${recur.length} recurrentes (${money(recur.reduce((s, c) => s + c.total, 0))}) · ${oneShot.length} one-shot`)
L(`  Concentración: top 5 = ${Math.round(clientes.slice(0, 5).reduce((s, c) => s + c.total, 0) / clientes.reduce((s, c) => s + c.total, 0) * 100)}% de todo lo facturado en 3 años`)

// ───────────── E · marcas finales (credenciales: "con estas marcas ya trabajamos") ─────────────
const marcasMap = {}
for (const t of trabajos) {
  const m = txt(t.marca); if (!m) continue
  const k = norm(m); if (!k) continue
  const x = marcasMap[k] = marcasMap[k] || { nombre: m, monto: 0, n: 0, via: new Set(), ultimo: null }
  if (m.length > x.nombre.length) x.nombre = m
  x.monto += t.monto; x.n++
  if (t.esAgencia) x.via.add(t.contratante)
  if (t.fecha && t.fecha <= HOY && (!x.ultimo || t.fecha > x.ultimo)) x.ultimo = t.fecha
}
const marcasTop = Object.values(marcasMap).sort((a, b) => b.monto - a.monto)
L(`\n\n═══ E · MARCAS FINALES CON LAS QUE MAGMA YA TRABAJÓ (top 30 por plata, 3 años) ═══\n`)
L(`  ${'MARCA'.padEnd(28)}${'FACTURADO'.padStart(14)}${'TRAB'.padStart(6)}  VÍA`)
L(`  ${'─'.repeat(88)}`)
for (const m of marcasTop.slice(0, 30)) {
  L(`  ${m.nombre.slice(0, 27).padEnd(28)}${money(m.monto).padStart(14)}${String(m.n).padStart(6)}  ${[...m.via].join(', ').slice(0, 38) || '(directo)'}`)
}
L(`\n  Marcas finales distintas registradas: ${marcasTop.length}`)

// ───────────── F · agujeros de datos: a quién NO le podemos escribir ─────────────
const sinContacto = clientes.filter(c => c.contactos.length === 0 && c.total > 1_000_000)
L(`\n\n═══ F · CLIENTES DE +$1M SIN NINGÚN CONTACTO CARGADO (${sinContacto.length}) ═══\n`)
L(`  ${sinContacto.map(c => c.nombre).join(' · ')}`)
const conContacto = clientes.filter(c => c.contactos.length > 0)
L(`\n  Contactos cargados en el sheet: ${contactos.length - 1} personas · cubren ${conContacto.length} de ${clientes.length} clientes`)

// ───────────── G · cuánto vale un cliente nuevo (el número que justifica prospectar) ─────────────
const porCliente = {}
for (const t of trabajos) { const k = norm(t.contratante) || '(sin nombre)'; (porCliente[k] = porCliente[k] || []).push(t) }
const valorPrimerAnio = []
for (const c of clientes) {
  const ts = (porCliente[norm(c.nombre)] || []).filter(t => t.fecha)
  if (!ts.length || !c.primera) continue
  if (c.primera.getFullYear() < 2025) continue                  // pesos de 2023/24 no son comparables (inflación)
  const corte = new Date(c.primera); corte.setFullYear(corte.getFullYear() + 1)
  if (corte > HOY) continue                                     // todavía no cumplió un año: no comparable
  const monto = ts.filter(t => t.fecha < corte).reduce((s, t) => s + t.monto, 0)
  const n = ts.filter(t => t.fecha < corte).length
  if (monto > 0) valorPrimerAnio.push({ nombre: c.nombre, monto, n, recurrente: c.recurrente })
}
valorPrimerAnio.sort((a, b) => b.monto - a.monto)
const vpaMontos = valorPrimerAnio.map(v => v.monto)
L(`\n\n═══ G · CUÁNTO VALE UN CLIENTE NUEVO EN SU PRIMER AÑO (n=${valorPrimerAnio.length}) ═══\n`)
L(`  Mediana:  ${money(mediana(vpaMontos))}   ·   Promedio: ${money(vpaMontos.reduce((a, b) => a + b, 0) / vpaMontos.length)}`)
L(`  Mejor decil (top 10%): ${money(mediana(vpaMontos.slice(0, Math.max(1, Math.round(vpaMontos.length * 0.1)))))}`)
const grandes = valorPrimerAnio.filter(v => v.monto >= 5_000_000)
L(`  Clientes que en su primer año dejaron +$5M: ${grandes.length} de ${valorPrimerAnio.length} (${Math.round(grandes.length / valorPrimerAnio.length * 100)}%)`)
L(`  → ${grandes.slice(0, 12).map(g => `${g.nombre} ${money(g.monto)}`).join(' · ')}`)

// tasa de repetición: de los que debutaron en 2025, ¿cuántos volvieron en 2026?
const debut2025 = clientes.filter(c => c.primera && c.primera.getFullYear() === 2025)
const volvieron = debut2025.filter(c => c.n[2026] > 0)
L(`\n  Clientes nuevos que debutaron en 2025: ${debut2025.length} · volvieron en 2026: ${volvieron.length} (${Math.round(volvieron.length / debut2025.length * 100)}%)`)
L(`  Los que volvieron: ${volvieron.sort((a, b) => b.y[2026] - a.y[2026]).slice(0, 10).map(c => `${c.nombre} (${money(c.y[2026])} en 2026)`).join(' · ')}`)

writeFileSync(OUT, JSON.stringify({
  generado: dd(HOY),
  totales: { 2023: tot(2023), 2024: tot(2024), 2025: tot(2025), 2026: tot(2026), viaAgencia2026: viaAg },
  proyectos2026: { cantidad: montos2026.length, promedio: montos2026.reduce((a, b) => a + b, 0) / montos2026.length, mediana: mediana(montos2026) },
  recetas: recetasTop,
  clientes: clientes.map(c => ({ ...c, primera: dd(c.primera), ultima: dd(c.ultima), proximo: dd(c.proximo) })),
  marcas: marcasTop.map(m => ({ nombre: m.nombre, monto: m.monto, n: m.n, via: [...m.via], ultimo: dd(m.ultimo) })),
}, null, 2))
L(`\n  → JSON: ${OUT}\n`)
