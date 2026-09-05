/**
 * VERIFICADOR del brief comercial (el documento que se le pasa a Tom).
 * Recalcula desde el sheet, con lógica propia e independiente de brief-comercial.mjs,
 * cada número publicado en el documento. Si algo no coincide lo marca en rojo.
 * Correr SIEMPRE antes de mandar el link:  node scripts/verificar-brief-comercial.mjs
 * Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env = Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
const sheets = google.sheets({ version: 'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

const txt = v => { const s = String(v ?? '').trim(); return /^#(ERROR|REF|N\/A)/.test(s) ? '' : s }
const num = v => { const s = txt(v).replace(/[$\s,]/g, ''); const n = parseFloat(s); return isNaN(n) ? 0 : n }
const fecha = v => { const m = txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (!m) return null; let y = +m[3]; if (y < 100) y += 2000; if (y < 2020 || y > 2027) return null; return new Date(y, +m[2] - 1, +m[1]) }
const M = n => '$' + Math.round(n).toLocaleString('es-AR')
const med = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const key = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

const checks = []
const check = (etiqueta, publicado, real, tol = 0.5) => checks.push({ etiqueta, publicado, real, ok: Math.abs(publicado - real) <= tol })

const R = await sheets.spreadsheets.values.batchGet({ spreadsheetId: ID, ranges: ['PROYECTOS', 'HISTORICO_2025', 'HISTORICO_2024', 'HISTORICO_2023'], valueRenderOption: 'FORMATTED_VALUE' })
const [PRO, H25, H24, H23] = R.data.valueRanges.map(v => v.values || [])

// ── PROYECTOS 2026 (fila = proyecto; se descartan los marcados no facturables) ──
const HP = PRO[0].map(h => txt(h))
const cTot = HP.indexOf('Total'), cFe = HP.indexOf('Fecha Evento'), cAg = HP.indexOf('Agencia')
const cCli = HP.indexOf('Cliente'), cNF = HP.indexOf('No facturable')
let tot26 = 0, n26 = 0, viaAg = 0
const tick = []
const porCli26 = {}
for (const r of PRO.slice(1)) {
  if (/^(true|si)$/i.test(txt(r[cNF]))) continue
  const f = fecha(r[cFe]); if (!f || f.getFullYear() !== 2026) continue
  const t = num(r[cTot]); if (!t && !txt(r[6])) continue
  tot26 += t; n26++; if (t > 0) tick.push(t)
  const ag = txt(r[cAg]), cli = txt(r[cCli])
  if (ag && key(ag) !== key(cli)) viaAg += t
  const k = key(ag || cli); if (k) porCli26[k] = (porCli26[k] || 0) + t
}
check('2026 · facturado', 273_504_391, tot26, 1)
check('2026 · cantidad de proyectos', 252, n26, 0)
check('2026 · ticket promedio', 1_085_335, tot26 / n26, 1)
check('2026 · ticket mediano', 525_000, med(tick), 1)
check('2026 · % vía agencia', 81, Math.round(viaAg / tot26 * 100), 0)

// ── históricos ──
const totalHist = rows => {
  const H = rows[0].map(h => txt(h).toLowerCase())
  const iP = H.indexOf('presupuesto'), iC = H.indexOf('cliente'), iA = H.indexOf('agencia')
  let s = 0, n = 0
  for (const r of rows.slice(1)) { const p = num(r[iP]); if (!p && !txt(r[iC]) && !txt(r[iA])) continue; s += p; n++ }
  return { s, n }
}
const t25 = totalHist(H25), t24 = totalHist(H24), t23 = totalHist(H23)
check('2025 · facturado', 325_148_627, t25.s, 1)
check('2025 · trabajos', 458, t25.n, 0)
check('2024 · facturado', 185_863_052, t24.s, 1)
check('2024 · trabajos', 331, t24.n, 0)
check('2023 · facturado', 28_652_940, t23.s, 1)
check('2023 · trabajos', 138, t23.n, 0)

// ── clientes publicados en la tabla "activos" (2026) ──
const publicados26 = {
  'Ostara': 62_440_000, 'Austral': 27_300_000, 'ADN': 26_494_221, 'Stadium': 24_671_000,
  'CMQ': 22_765_960, 'Infinity Midia': 11_960_000, 'Oir Comunicaciones': 10_800_000,
  'Meikin': 10_678_020, 'Minita': 6_342_970, 'The Bloom': 4_700_000, 'Velvet': 4_250_000,
  'Pop Up': 3_970_000, 'Grupo Ng': 3_450_001, 'Mercuria': 3_050_000, 'Atacama': 3_000_000,
  'Nodus': 8_973_964, 'Reina Batata': 8_280_000, 'SPA': 3_491_486, 'KLM': 3_300_000, 'Pocho': 2_050_000,
}
for (const [nombre, val] of Object.entries(publicados26)) check(`2026 · ${nombre}`, val, porCli26[key(nombre)] || 0, 1)

// ── perdidos: facturaron 24/25, cero en 2026 ──
const hist = {}
for (const [anio, rows] of [[2025, H25], [2024, H24]]) {
  const H = rows[0].map(h => txt(h).toLowerCase())
  const iP = H.indexOf('presupuesto'), iC = H.indexOf('cliente'), iA = H.indexOf('agencia')
  for (const r of rows.slice(1)) {
    const k = key(txt(r[iA]) || txt(r[iC])); if (!k) continue
    hist[k] = (hist[k] || 0) + num(r[iP])
  }
}
const perdidos = Object.entries(hist).filter(([k, v]) => v > 0 && !(porCli26[k] > 0))
check('Perdidos · cantidad', 49, perdidos.length, 0)
check('Perdidos · plata 24+25', 99_245_690, perdidos.reduce((s, [, v]) => s + v, 0), 1)
check('Perdidos · Azcuy', 19_630_000, hist[key('Azcuy')] || 0, 1)
check('Perdidos · Grupo Roca', 14_100_000, hist[key('Grupo Roca')] || 0, 1)

// ── recetas del catálogo (2026) ──
const recurso = p => {
  const s = txt(p).replace(/[^\p{L}\p{N}\s½/+-]/gu, '').trim().toLowerCase()
  if (!s) return null
  if (/^(viaticos|comision|otros|servicio)/.test(s)) return null
  if (/edit/.test(s)) return 'Edición'
  if (/asist/.test(s)) return 'Asistente'
  if (/produ/.test(s)) return 'Producción'
  if (/drone|fpv/.test(s)) return 'Drone'
  if (/vivo/.test(s)) return 'Vivo'
  if (/motion/.test(s)) return 'Motion'
  if (/makeup|model/.test(s)) return 'Maquillaje'
  if (/sonido|locu/.test(s)) return 'Sonido'
  if (/dirfoto|colorista/.test(s)) return 'DirFoto'
  if (/rental/.test(s)) return 'Rental'
  if (/crudos/.test(s)) return 'Crudos'
  if (/12hs/.test(s)) return 'Larga'
  if (/(foto|video|film|fotos)\s*(½|1\/2)/.test(s)) return '½'
  if (/(foto|video|film|fotos)\s*1?$/.test(s)) return '1'
  return 'Otros'
}
const PED = [11, 14, 17, 20, 23, 26, 29, 32, 35, 38, 41, 44, 60, 63, 66, 69, 72, 75, 78, 81]
const rec = {}
for (const r of PRO.slice(1)) {
  if (/^(true|si)$/i.test(txt(r[cNF]))) continue
  const f = fecha(r[cFe]); if (!f || f.getFullYear() !== 2026) continue
  const c = {}
  for (const i of PED) { const v = recurso(r[i]); if (v) c[v] = (c[v] || 0) + 1 }
  const firma = Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, v]) => v > 1 ? `${k}x${v}` : k).join('+') || '(vacío)'
  const x = rec[firma] = rec[firma] || { n: 0, s: 0, t: [] }
  x.n++; x.s += num(r[cTot]); x.t.push(num(r[cTot]))
}
const ver = (firma, nPub, promPub, medPub) => {
  const x = rec[firma] || { n: 0, s: 0, t: [0] }
  check(`Catálogo · ${firma} (proy)`, nPub, x.n, 0)
  check(`Catálogo · ${firma} (prom)`, promPub, x.s / (x.n || 1), 1)
  check(`Catálogo · ${firma} (mediana)`, medPub, med(x.t), 1)
}
ver('½+Edición', 65, 483_335, 400_000)
ver('Edición', 48, 214_583, 195_000)
ver('½', 24, 449_417, 400_000)
ver('½x2+Edición', 13, 1_444_462, 1_600_000)
ver('1', 8, 866_250, 770_000)
ver('1x2+Edición', 7, 1_893_290, 1_600_000)
ver('1+Asistente+Edición', 4, 1_711_665, 1_470_000)

// ── salida ──
const malos = checks.filter(c => !c.ok)
console.log(`\n  VERIFICACIÓN DEL BRIEF COMERCIAL — ${checks.length} números chequeados contra el sheet\n`)
for (const c of checks) {
  const icono = c.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
  const extra = c.ok ? '' : `  \x1b[31m← publicado ${M(c.publicado)} / real ${M(c.real)}\x1b[0m`
  console.log(`  ${icono} ${c.etiqueta.padEnd(42)} ${M(c.real).padStart(16)}${extra}`)
}
console.log(malos.length
  ? `\n  \x1b[31m${malos.length} NO COINCIDEN — corregir el documento antes de mandarlo.\x1b[0m\n`
  : `\n  \x1b[32mTodo coincide. El documento se puede mandar.\x1b[0m\n`)
