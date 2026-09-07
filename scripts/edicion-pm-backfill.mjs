/**
 * Completa la columna PM de EDICION con el PM que ya tiene el proyecto en PROYECTOS.
 *
 * Por qué: el tablero nunca copió el PM (0 de 101 filas lo tenían), así que TODOS
 * los avisos de "esto espera tu OK" caían en un mail por default, fuera de quien
 * fuera el responsable. Desde ahora el sync y el alta manual lo escriben solos;
 * esto es para las filas que ya estaban.
 *
 * Uso:  node scripts/edicion-pm-backfill.mjs            (preview, no toca nada)
 *       node scripts/edicion-pm-backfill.mjs --escribir (aplica)
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }

const R = await sheets.spreadsheets.values.batchGet({ spreadsheetId: ID, ranges: ['PROYECTOS!A:ET', 'EDICION!A:AM'] })
const [PRO, ED] = R.data.valueRanges.map(v => v.values || [])
const hP = PRO[0], hE = ED[0]
const iNumP = hP.indexOf('N° presupuesto'), iPM = hP.indexOf('PM')
const iNumE = hE.indexOf('N° presupuesto'), jPM = hE.indexOf('PM'), jID = hE.indexOf('ID')
if (iPM === -1 || jPM === -1) { console.error('No encuentro la columna PM'); process.exit(1) }

const pmDe = new Map()
PRO.slice(1).forEach(r => { const n = String(r[iNumP] || '').trim(); const p = String(r[iPM] || '').trim(); if (n && p && !pmDe.has(n)) pmDe.set(n, p) })

const data = [], sin = []
ED.slice(1).forEach((r, i) => {
  const fila = i + 2
  if (String(r[jPM] || '').trim()) return
  const num = String(r[iNumE] || '').trim()
  const pm = pmDe.get(num)
  if (!pm) { sin.push(`${String(r[jID] || '').padEnd(10)} #${num || '—'}  sin PM en PROYECTOS`); return }
  data.push({ range: `EDICION!${colLetra(jPM)}${fila}`, values: [[pm]] })
})

const cuenta = {}
data.forEach(d => { const p = d.values[0][0]; cuenta[p] = (cuenta[p] || 0) + 1 })
console.log(`\nFilas de EDICION: ${ED.length - 1}  ·  ya tenían PM: ${ED.slice(1).filter(r => String(r[jPM] || '').trim()).length}`)
console.log(`A completar: ${data.length}   ${Object.entries(cuenta).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(' · ')}`)
if (sin.length) { console.log(`\nQuedan sin PM (${sin.length}) — el proyecto no lo tiene cargado:`); sin.forEach(x => console.log('  ', x)) }
console.log('\nMuestra de lo que se escribe:')
data.slice(0, 8).forEach(d => console.log('  ', d.range, '→', d.values[0][0]))

if (!ESCRIBIR) { console.log('\n(preview — corré con --escribir para aplicar)\n'); process.exit(0) }
if (!data.length) { console.log('\nNada para escribir.\n'); process.exit(0) }

await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: ID, requestBody: { valueInputOption: 'USER_ENTERED', data } })

// Verificación: releer y confirmar que cada fila quedó con el PM de su proyecto.
const V = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'EDICION!A:AM' })).data.values || []
let ok = 0, mal = 0
V.slice(1).forEach(r => {
  const num = String(r[iNumE] || '').trim(), pm = String(r[jPM] || '').trim(), esperado = pmDe.get(num)
  if (!esperado) return
  if (pm === esperado) ok++; else { mal++; console.log('  ✗', r[jID], `esperaba "${esperado}" y quedó "${pm}"`) }
})
console.log(`\n✓ escrito. Alineadas con PROYECTOS: ${ok}  ·  desalineadas: ${mal}\n`)
