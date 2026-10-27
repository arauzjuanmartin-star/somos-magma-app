// Marca como pagadas 8 líneas de PAGOS_STAFF que se pagaron pero nunca se marcaron.
// Juan, 27/10/2026: "no le debemos a nadie.. le pagamos a todos!! salvo lo que están
// trabajando en octubre". Freelancers las mostraba como "vencido" ($1.172.250).
//
// No toca la Cuenta ni la Fecha de pago: la plata ya salió y no sabemos de qué cuenta ni
// qué día, así que CUENTAS no se mueve. Monto Pagado = Monto Adeudado, Notas lo explica.
// Romina Aguilera y Stadium (#2078) además pasan de "07 - julio" a "08 - agosto": el evento
// fue el 3/8 y con julio la llave no matchea con el trabajo.
//
// Preview por default. Con --escribir aplica, deja una línea en el LOG y relee para verificar.
import { readFileSync } from 'fs'
const R = new URL('..', import.meta.url).pathname
for (const l of readFileSync(R + '.env.local', 'utf8').split('\n')) { const i = l.indexOf('='); if (i < 0) continue; let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); const k = l.slice(0, i).trim(); if (!(k in process.env)) process.env[k] = v }
const { getSheets } = await import(R + 'lib/sheets.js')
const ESCRIBIR = process.argv.includes('--escribir')

// fila del sheet → lo que esperamos encontrar ahí (si no coincide, frena)
const FILAS = [
  { fila: 1151, persona: 'Santino', nro: '1126' },
  { fila: 1152, persona: 'Gaspar', nro: '1126' },
  { fila: 1129, persona: 'Lucía María Grenier', nro: '1802' },
  { fila: 1140, persona: 'Romina Aguilera', nro: '2078', mes: '08 - agosto' },
  { fila: 1141, persona: 'Stadium', nro: '2078', mes: '08 - agosto' },
  { fila: 1284, persona: 'Bruno Arce', nro: '2332' },
  { fila: 1362, persona: 'Bruno Arce', nro: '2158' },
  { fila: 1273, persona: 'Gastón Urquía', nro: '2195' },
]
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const parseMonto = v => { const n = parseFloat(String(v || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n }

const { sheets, SHEET_ID } = await getSheets()
const leer = async () => (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PAGOS_STAFF!A:Z' })).data.values || []
const rows = await leer(), h = rows[0]
const c = n => { const i = h.indexOf(n); if (i < 0) throw new Error('Falta la columna ' + n); return i }
const iPer = c('Freelancer'), iMes = c('Mes Referencia'), iNro = c('N° Presupuesto'), iServ = c('Servicio'), iAd = c('Monto Adeudado'), iPag = c('Monto Pagado'), iEst = c('Estado'), iNot = c('Notas')

const data = []; let total = 0
for (const f of FILAS) {
  const r = rows[f.fila - 1] || []
  const ok = String(r[iPer] || '').includes(f.persona.split(' ')[0]) && String(r[iNro] || '').trim() === f.nro && !/pagado/i.test(r[iEst] || '')
  if (!ok) { console.error(`✗ Fila ${f.fila} no es lo esperado (${r[iPer]} #${r[iNro]} ${r[iEst]}). No escribo nada.`); process.exit(1) }
  const monto = parseMonto(r[iAd]); total += monto
  console.log(`fila ${f.fila} · ${r[iPer]} · #${r[iNro]} · ${r[iServ]} · ${r[iMes]}${f.mes ? ' → ' + f.mes : ''} · $${monto.toLocaleString('es-AR')} · ${r[iEst]} → Pagado`)
  const nota = [r[iNot], 'Ya estaba pagado, se marcó el 27/10/2026 (Juan)'].filter(Boolean).join(' · ')
  data.push({ range: `PAGOS_STAFF!${colLetra(iEst)}${f.fila}`, values: [['Pagado']] })
  data.push({ range: `PAGOS_STAFF!${colLetra(iPag)}${f.fila}`, values: [[monto || '']] })
  data.push({ range: `PAGOS_STAFF!${colLetra(iNot)}${f.fila}`, values: [[nota]] })
  if (f.mes) data.push({ range: `PAGOS_STAFF!${colLetra(iMes)}${f.fila}`, values: [[f.mes]] })
}
console.log(`\n${FILAS.length} líneas · $${total.toLocaleString('es-AR')} · Cuenta y Fecha de pago no se tocan (CUENTAS no se mueve)`)
if (!ESCRIBIR) { console.log('\nPreview. Para aplicar: --escribir'); process.exit(0) }

await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data } })
await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), 'juan@somosmagma.com', 'script pagos-staff-marcar-ya-pagados', 'PAGOS_STAFF', FILAS.map(f => f.fila).join(','), `marcadas Pagado (ya estaban pagadas) · $${total.toLocaleString('es-AR')}`]] } })
const despues = await leer()
const mal = FILAS.filter(f => despues[f.fila - 1]?.[iEst] !== 'Pagado' || (f.mes && despues[f.fila - 1]?.[iMes] !== f.mes))
console.log(mal.length ? `✗ No quedaron bien: ${mal.map(f => f.fila).join(', ')}` : '✓ Las 8 quedaron Pagado')
