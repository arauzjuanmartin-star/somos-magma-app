/**
 * ASOCIACIONES × SOMOS MAGMA — cruza los padrones de AOFREP y AOCA contra la base real
 * de clientes (PROYECTOS 2026 + HISTORICO 2025/2024/2023) para saber a quién ya le vendimos
 * y quién es territorio nuevo. Solo lectura.
 * Uso: node scripts/asociaciones-cruce.mjs <aofrep.json> <aoca.json>
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

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

const txt = v => { const s = String(v ?? '').trim(); return /^#(ERROR|REF|N\/A|VALUE|NAME|DIV|NUM|NULL)/.test(s) ? '' : s }
const num = v => {                                   // el sheet guarda formato US ($1,250,000.00)
  let s = txt(v).replace(/[$\s]/g, ''); if (!s) return 0
  if (/^-?[\d.]+,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  const n = parseFloat(s.replace(/[^\d.-]/g, '')); return isNaN(n) ? 0 : n
}
const fecha = v => {
  const m = txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (!m) return null
  let y = +m[3]; if (y < 100) y += 2000
  if (y < 2020 || y > 2027) return null
  const d = new Date(y, +m[2] - 1, +m[1]); return isNaN(d) ? null : d
}
const money = n => '$' + Math.round(n).toLocaleString('es-AR')
const dd = d => d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '—'
const norm = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&amp;/g, ' ')
  .replace(/\b(s\.?a\.?s?|s\.?r\.?l\.?|sas|srl|sa)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
// solo palabras que identifican de verdad — sin esto "eventos" matchea con todo
const STOP = new Set('eventos evento fiestas producciones produccion organizacion organizador organizadora profesional planner planners argentina buenos aires corporativos corporativo sociales grupo agencia asociados asoc consulting group experiencias congresos convenciones ferias exposiciones'.split(' '))
const tokens = s => norm(s).split(' ').filter(t => t.length > 3 && !STOP.has(t))

const R = await sheets.spreadsheets.values.batchGet({
  spreadsheetId: ID,
  ranges: ['PROYECTOS', 'HISTORICO_2025', 'HISTORICO_2024', 'HISTORICO_2023'],
  valueRenderOption: 'FORMATTED_VALUE',
})
const [proy, h25, h24, h23] = R.data.valueRanges.map(v => v.values || [])
const trabajos = []
{
  const H = (proy[0] || []).map(h => txt(h).toLowerCase())
  const [iAg, iCli, iProy, iFe, iTot, iNoFact] = ['agencia', 'cliente', 'proyecto', 'fecha evento', 'total', 'no facturable'].map(k => H.indexOf(k))
  for (const row of proy.slice(1)) {
    if (['TRUE', 'SI'].includes(txt(row[iNoFact]).toUpperCase())) continue
    const monto = num(row[iTot]), ag = txt(row[iAg]), cli = txt(row[iCli])
    if (!txt(row[iProy]) && !monto) continue
    trabajos.push({ anio: 2026, fecha: fecha(row[iFe]), contratante: ag || cli || '(sin nombre)', monto })
  }
}
for (const [anio, rows] of [[2025, h25], [2024, h24], [2023, h23]]) {
  const H = (rows[0] || []).map(h => txt(h).toLowerCase())
  const [iCli, iAg, iFe, iMes, iPres] = ['cliente', 'agencia', 'fecha', 'mes', 'presupuesto'].map(k => H.indexOf(k))
  for (const row of rows.slice(1)) {
    const monto = num(row[iPres]), cli = txt(row[iCli]), ag = txt(row[iAg])
    if (!cli && !ag && !monto) continue
    let f = fecha(row[iFe])
    if (!f) { const m = parseInt(txt(row[iMes]), 10); if (m >= 1 && m <= 12) f = new Date(anio, m - 1, 15) }
    trabajos.push({ anio, fecha: f, contratante: ag || cli || '(sin nombre)', monto })
  }
}
const C = {}
for (const t of trabajos) {
  const k = norm(t.contratante); if (!k) continue
  const c = C[k] = C[k] || { nombre: t.contratante, total: 0, n: 0, ultima: null }
  if (t.contratante.length > c.nombre.length) c.nombre = t.contratante
  c.total += t.monto; c.n++
  if (t.fecha && (!c.ultima || t.fecha > c.ultima)) c.ultima = t.fecha
}
const clientes = Object.values(C)

// match estricto: nombre igual · el nombre del cliente aparece entero como palabra en el del socio
// (así "ADN" cae en "ADN COMUNICACIÓN" pero no en "adnexo") · o 2 tokens propios en común
const palabraCompleta = (aguja, pajar) => new RegExp(`(^| )${aguja.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(pajar)
const buscar = nombre => {
  const nk = norm(nombre), tk = tokens(nombre)
  for (const c of clientes) {
    const ck = norm(c.nombre); if (!ck) continue
    if (ck === nk) return { c, por: 'nombre exacto' }
    if (ck.length >= 3 && !STOP.has(ck) && palabraCompleta(ck, nk)) return { c, por: `"${c.nombre}" dentro del nombre` }
    if (nk.length >= 6 && palabraCompleta(nk, ck)) return { c, por: 'contenido' }
    const comunes = tk.filter(t => tokens(c.nombre).includes(t))
    if (comunes.length >= 2) return { c, por: `tokens: ${comunes.join('+')}` }
  }
  return null
}

const L = console.log
const ETIQ = process.env.ETIQUETAS ? process.env.ETIQUETAS.split(',') : ['AOFREP', 'AOCA', 'AGENCIAS ARGENTINAS']
for (const [archivo, etiqueta] of process.argv.slice(2).map((a, i) => [a, ETIQ[i] || `LISTA ${i + 1}`])) {
  if (!archivo) continue
  const lista = JSON.parse(readFileSync(archivo, 'utf8'))
  const nombres = lista.map(x => x.nombre).filter(Boolean)
  const hits = nombres.map(n => ({ n, h: buscar(n) })).filter(x => x.h)
  L(`\n═══ ${etiqueta} · ${nombres.length} socios ═══`)
  if (!hits.length) L(`  Ninguno fue nunca cliente de Magma. Territorio 100% nuevo.`)
  for (const { n, h } of hits) L(`  ✔ ${n.slice(0, 40).padEnd(42)} → "${h.c.nombre}" · ${money(h.c.total)} · ${h.c.n} trab · últ ${dd(h.c.ultima)}  [${h.por}]`)
}
L(`\n  Base cruzada: ${clientes.length} clientes distintos, ${trabajos.length} trabajos, 2023 a hoy.\n`)
