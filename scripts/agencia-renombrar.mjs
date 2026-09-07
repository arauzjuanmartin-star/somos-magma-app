/**
 * Renombra una agencia en TODAS las solapas donde figura.
 *
 * Pasa seguido: el mismo cliente cambia de agencia, o la agencia se llama distinto
 * en el sheet y en Drive ("Pancha Studio" vs "PANCHITA LA CREME"), y ahí la app crea
 * una carpeta nueva en vez de usar la que ya tiene todo el material.
 *
 * Uso:  node scripts/agencia-renombrar.mjs "Pancha Studio" "Panchita La Creme"
 *       node scripts/agencia-renombrar.mjs "Pancha Studio" "Panchita La Creme" --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const [viejo, nuevo] = process.argv.slice(2).filter(a => !a.startsWith('--'))
const ESCRIBIR = process.argv.includes('--escribir')
if (!viejo || !nuevo) { console.error('Uso: node scripts/agencia-renombrar.mjs "Nombre viejo" "Nombre nuevo" [--escribir]'); process.exit(1) }
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const igual = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

// Dónde vive el nombre de una agencia. La columna se busca por header, no por letra.
const DONDE = [
  { solapa: 'PRESUPUESTOS', rango: 'PRESUPUESTOS!A:G', col: 'Agencia' },
  { solapa: 'PROYECTOS', rango: 'PROYECTOS!A:G', col: 'Agencia' },
  { solapa: 'AGENCIAS', rango: 'AGENCIAS!A:L', col: 'Nombre' },
  { solapa: 'Contactos/agencias', rango: 'Contactos/agencias!A:Z', col: 'Agencia' },
]

const data = []
for (const d of DONDE) {
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: d.rango })
  const rows = r.data.values || []
  const h = rows[0] || []
  let i = h.indexOf(d.col)
  if (i === -1 && d.solapa === 'AGENCIAS') i = 0   // la primera columna es el nombre
  if (i === -1) { console.log(`   ! ${d.solapa}: no encontré la columna "${d.col}"`); continue }
  const hits = []
  rows.slice(1).forEach((row, k) => { if (igual(row[i], viejo)) hits.push(k + 2) })
  console.log(`${d.solapa.padEnd(20)} ${String(hits.length).padStart(3)} filas  (col ${colLetra(i)})`)
  hits.forEach(f => data.push({ range: `${d.solapa}!${colLetra(i)}${f}`, values: [[nuevo]] }))
}

console.log(`\n"${viejo}"  →  "${nuevo}"   ·  ${data.length} celdas`)
if (!ESCRIBIR) { console.log('\n(preview — agregá --escribir para aplicar)\n'); process.exit(0) }
if (!data.length) { console.log('\nNada para cambiar.\n'); process.exit(0) }

await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: ID, requestBody: { valueInputOption: 'USER_ENTERED', data } })

// Verificar: que no quede ninguna con el nombre viejo
let quedan = 0
for (const d of DONDE) {
  const rows = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: d.rango })).data.values || []
  const h = rows[0] || []
  let i = h.indexOf(d.col); if (i === -1 && d.solapa === 'AGENCIAS') i = 0
  if (i === -1) continue
  quedan += rows.slice(1).filter(r => igual(r[i], viejo)).length
}
console.log(quedan === 0 ? `\n✓ ${data.length} celdas cambiadas · no quedó ninguna con "${viejo}"\n` : `\n✗ todavía quedan ${quedan} con "${viejo}"\n`)
