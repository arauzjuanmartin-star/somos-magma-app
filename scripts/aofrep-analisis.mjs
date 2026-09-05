/**
 * AOFREP × SOMOS MAGMA — ¿vale la pena meterse en la asociación?
 * Cruza los 85 socios de aofrep.org.ar contra la base real de clientes de Magma
 * (PROYECTOS 2026 + HISTORICO 2025/2024/2023) y responde:
 *   1) ¿a cuántos socios ya les vendimos? ¿cuánta plata fueron?
 *   2) ¿cuánto vale un organizador de eventos como cliente (ticket, recurrencia)?
 *   3) ¿cuánto pesa hoy el segmento "evento corporativo" en la facturación?
 * Solo lectura. Uso: node scripts/aofrep-analisis.mjs [ruta_json_socios]
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
const SOCIOS_JSON = process.argv[2] || '/private/tmp/claude-501/-Users-dronjuan-somos-magma-app/0fcde025-4e1a-4c96-9766-267e62eebc0f/scratchpad/aofrep_socios.json'

const txt = v => { const s = String(v ?? '').trim(); return /^#(ERROR|REF|N\/A|VALUE|NAME|DIV|NUM|NULL)/.test(s) ? '' : s }
const num = v => {                                  // el sheet guarda formato US ($1,250,000.00)
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
const norm = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&amp;/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
const mediana = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
// palabras que no identifican a nadie — no sirven para matchear
const STOP = new Set('eventos evento sa srl sas s a producciones produccion de la el los las y para organizador organizadora planner planners argentina buenos aires by ok team agencia grupo'.split(' '))
const tokens = s => norm(s).split(' ').filter(t => t.length > 3 && !STOP.has(t))

const R = await sheets.spreadsheets.values.batchGet({
  spreadsheetId: ID,
  ranges: ['PROYECTOS', 'HISTORICO_2025', 'HISTORICO_2024', 'HISTORICO_2023', 'Contactos/agencias'],
  valueRenderOption: 'FORMATTED_VALUE',
})
const [proy, h25, h24, h23, contactos] = R.data.valueRanges.map(v => v.values || [])
const HOY = new Date('2026-08-18T00:00:00')

const trabajos = []
{
  const H = (proy[0] || []).map(h => txt(h).toLowerCase())
  const iAg = H.indexOf('agencia'), iCli = H.indexOf('cliente'), iProy = H.indexOf('proyecto')
  const iFe = H.indexOf('fecha evento'), iTot = H.indexOf('total'), iNro = H.indexOf('n° presupuesto')
  const iNoFact = H.indexOf('no facturable')
  for (const row of proy.slice(1)) {
    if (['TRUE', 'SI'].includes(txt(row[iNoFact]).toUpperCase())) continue
    const monto = num(row[iTot]), nombreProy = txt(row[iProy])
    if (!nombreProy && !monto) continue
    const ag = txt(row[iAg]), cli = txt(row[iCli])
    trabajos.push({ anio: 2026, fecha: fecha(row[iFe]), nro: txt(row[iNro]), contratante: ag || cli || '(sin nombre)', marca: cli || ag, proyecto: nombreProy, monto })
  }
}
for (const [anio, rows] of [[2025, h25], [2024, h24], [2023, h23]]) {
  const H = (rows[0] || []).map(h => txt(h).toLowerCase())
  const iCli = H.indexOf('cliente'), iAg = H.indexOf('agencia'), iProy = H.indexOf('proyecto')
  const iFe = H.indexOf('fecha'), iMes = H.indexOf('mes'), iPres = H.indexOf('presupuesto')
  for (const row of rows.slice(1)) {
    const monto = num(row[iPres]), cli = txt(row[iCli]), ag = txt(row[iAg]), nombreProy = txt(row[iProy])
    if (!cli && !ag && !monto) continue
    let f = fecha(row[iFe])
    if (!f) { const m = parseInt(txt(row[iMes]), 10); if (m >= 1 && m <= 12) f = new Date(anio, m - 1, 15) }
    trabajos.push({ anio, fecha: f, nro: '', contratante: ag || cli || '(sin nombre)', marca: nombreProy || cli, proyecto: nombreProy, monto })
  }
}

// clientes agregados
const C = {}
for (const t of trabajos) {
  const k = norm(t.contratante); if (!k) continue
  const c = C[k] = C[k] || { nombre: t.contratante, total: 0, n: 0, y: {}, ultima: null, tickets: [] }
  if (t.contratante.length > c.nombre.length) c.nombre = t.contratante
  c.total += t.monto; c.n++; c.y[t.anio] = (c.y[t.anio] || 0) + t.monto
  if (t.monto > 0) c.tickets.push(t.monto)
  if (t.fecha && (!c.ultima || t.fecha > c.ultima)) c.ultima = t.fecha
}
const clientes = Object.values(C)
const totalGeneral = clientes.reduce((s, c) => s + c.total, 0)

// ─── 1. cruce AOFREP vs base ───
const socios = JSON.parse(readFileSync(SOCIOS_JSON, 'utf8'))
const decode = s => String(s).replace(/&amp;/g, '&').replace(/&ntilde;/g, 'ñ')
const buscar = nombre => {
  const nk = norm(nombre), tk = tokens(nombre)
  const hits = []
  for (const c of clientes) {
    const ck = norm(c.nombre)
    if (!ck) continue
    if (ck === nk) { hits.push({ c, score: 3 }); continue }
    if (nk.length > 5 && (ck.includes(nk) || nk.includes(ck))) { hits.push({ c, score: 2 }); continue }
    const ctk = tokens(c.nombre)
    const comunes = tk.filter(t => ctk.includes(t))
    if (comunes.length) hits.push({ c, score: 1, comunes })
  }
  return hits.sort((a, b) => b.score - a.score || b.c.total - a.c.total)
}
const yaClientes = [], nuevos = []
for (const s of socios) {
  const nombre = decode(s.nombre)
  const h = buscar(nombre)
  if (h.length && h[0].score >= 2) yaClientes.push({ socio: nombre, cats: s.cats, cliente: h[0].c, score: h[0].score })
  else if (h.length && h[0].score === 1) nuevos.push({ socio: nombre, cats: s.cats, posible: h[0].c.nombre, comunes: h[0].comunes })
  else nuevos.push({ socio: nombre, cats: s.cats })
}

const L = console.log
L(`\n${'█'.repeat(80)}\n  AOFREP × SOMOS MAGMA — ¿es ahí donde hay que meterse?  (${dd(HOY)})\n${'█'.repeat(80)}`)
L(`\n  Socios AOFREP: ${socios.length}`)
const porCat = {}
for (const s of socios) for (const c of s.cats) porCat[c] = (porCat[c] || 0) + 1
L('  Composición: ' + Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '))

L(`\n═══ 1 · ¿A CUÁNTOS SOCIOS YA LES VENDIMOS? ═══\n`)
if (!yaClientes.length) L('  NINGUNO. Los 85 socios son territorio virgen.')
for (const y of yaClientes) {
  L(`  ✔ ${y.socio.slice(0, 40).padEnd(42)} → cliente "${y.cliente.nombre}" · ${money(y.cliente.total)} · ${y.cliente.n} trabajos · última ${dd(y.cliente.ultima)}`)
}
L(`\n  Coincidencias parciales a revisar a ojo:`)
for (const n of nuevos.filter(x => x.posible)) L(`    ~ ${n.socio.slice(0, 38).padEnd(40)} ¿= "${n.posible}"? (comparten: ${n.comunes.join(', ')})`)

L(`\n═══ 2 · CUÁNTO VALE UN CLIENTE ═══\n`)
const tickets = trabajos.filter(t => t.monto > 0).map(t => t.monto)
L(`  Ticket mediano por trabajo (3 años, ${tickets.length} trabajos): ${money(mediana(tickets))} · promedio ${money(tickets.reduce((a, b) => a + b, 0) / tickets.length)}`)
const conRecurrencia = clientes.filter(c => c.n >= 2)
L(`  Clientes totales: ${clientes.length} · con 2+ trabajos: ${conRecurrencia.length} (${Math.round(conRecurrencia.length / clientes.length * 100)}%)`)
L(`  Valor promedio de un cliente que repite: ${money(conRecurrencia.reduce((s, c) => s + c.total, 0) / conRecurrencia.length)} en 3 años`)
L(`  Mediana de un cliente que repite: ${money(mediana(conRecurrencia.map(c => c.total)))}`)

L(`\n═══ 3 · TOP 20 CLIENTES (para ver de qué mundo viene la plata) ═══\n`)
for (const c of [...clientes].sort((a, b) => b.total - a.total).slice(0, 20)) {
  L(`  ${c.nombre.slice(0, 32).padEnd(34)}${money(c.total).padStart(15)}${String(c.n).padStart(5)} trab · ${Math.round(c.total / totalGeneral * 1000) / 10}% · últ ${dd(c.ultima)}`)
}

L(`\n═══ 4 · ¿CUÁNTO PESA "EVENTO" EN LO QUE YA HACEMOS? ═══\n`)
const KEY = /evento|fiesta|convenci|congres|cena|aniversari|lanzamiento|inaugurac|premiaci|gala|summit|expo|feria|jornada|kick ?off|fin de a/i
const eventos = trabajos.filter(t => KEY.test(t.proyecto))
L(`  Trabajos cuyo nombre dice "evento/convención/congreso/gala/etc": ${eventos.length} de ${trabajos.length} (${Math.round(eventos.length / trabajos.length * 100)}%)`)
L(`  Plata: ${money(eventos.reduce((s, t) => s + t.monto, 0))} de ${money(totalGeneral)} (${Math.round(eventos.reduce((s, t) => s + t.monto, 0) / totalGeneral * 100)}%)`)
L(`  Ticket mediano de esos: ${money(mediana(eventos.filter(t => t.monto > 0).map(t => t.monto)))}`)

// Marrollo
L(`\n═══ 5 · ¿MARROLLO YA ESTUVO EN LA BASE? ═══\n`)
const mar = trabajos.filter(t => /marrollo|felipe m/i.test(t.contratante + ' ' + t.marca + ' ' + t.proyecto))
L(mar.length ? mar.map(t => `  ${t.anio} · ${t.contratante} · ${t.proyecto} · ${money(t.monto)}`).join('\n') : '  Sin registro: es cliente nuevo 100%.')
{
  const H = (contactos[0] || []).map(h => txt(h).toLowerCase())
  const iN = H.indexOf('nombre'), iM = H.indexOf('mail'), iA = H.indexOf('agencia')
  const c = contactos.slice(1).filter(r => /marrollo/i.test(txt(r[iA]) + txt(r[iN]) + txt(r[iM])))
  L(c.length ? '  En Contactos: ' + c.map(r => `${txt(r[iN])} · ${txt(r[iM])} · ${txt(r[iA])}`).join(' | ') : '  Tampoco está en Contactos/agencias.')
}
L('')
