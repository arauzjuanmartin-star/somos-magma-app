import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const i = l.indexOf('=')
      let v = l.slice(i+1).trim()
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1,-1)
      return [l.slice(0, i).trim(), v]
    })
)

const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: env.GOOGLE_CLIENT_EMAIL,
    private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })

const LEGACY = ['RESUMEN', 'BALANCE', 'Dashboard_data', 'DATOS', 'BUSCADOR STAFF', 'BUSCADOR AGENCIA', 'BUSCADOR MES', 'Presupuesto', 'listado']
const ACTIVE_FOR_REFS = ['CARGA DATOS 1', 'CARGA DATOS 2', 'CARGA DATOS 3', 'PRESUPUESTOS', 'PROYECTOS', 'FACTURACION', 'CARGAR STAFF']

// 1. Buscar referencias a las solapas legacy desde solapas activas
console.log('=== REFERENCIAS A SOLAPAS LEGACY DESDE SOLAPAS ACTIVAS ===\n')
const refs = {}
for (const name of LEGACY) refs[name] = []
for (const active of ACTIVE_FOR_REFS) {
  try {
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${active}'!A1:AZ60`,
      valueRenderOption: 'FORMULA',
    })
    const rows = r.data.values || []
    for (let i = 0; i < rows.length; i++) {
      for (let j = 0; j < (rows[i]||[]).length; j++) {
        const cell = String(rows[i][j] || '')
        if (!cell.startsWith('=')) continue
        for (const legacy of LEGACY) {
          if (cell.includes(legacy)) {
            const cellRef = String.fromCharCode(65+j) + (i+1)
            refs[legacy].push(`${active}!${cellRef}: ${cell.slice(0,120)}`)
          }
        }
      }
    }
  } catch (e) { console.log(`  err leyendo ${active}: ${e.message}`) }
}
for (const [legacy, hits] of Object.entries(refs)) {
  if (hits.length === 0) console.log(`  ${legacy.padEnd(20)} → SIN REFERENCIAS (seguro borrar)`)
  else {
    console.log(`  ${legacy.padEnd(20)} → ${hits.length} referencia(s):`)
    hits.slice(0,5).forEach(h => console.log(`     ${h}`))
  }
}

// 2. Sample de contenido de cada solapa legacy
console.log('\n\n=== CONTENIDO DE LAS SOLAPAS LEGACY (primeras 6 filas) ===\n')
for (const name of LEGACY) {
  console.log(`\n----- ${name} -----`)
  try {
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${name}'!A1:M8`,
    })
    const rows = r.data.values || []
    rows.forEach((row, i) => {
      const compact = (row || []).slice(0,8).map(c => String(c||'').slice(0,18)).join(' | ')
      if (compact.replace(/[ |]/g,'').length > 0) console.log(`  fila ${i+1}: ${compact}`)
    })
  } catch (e) { console.log(`  err: ${e.message}`) }
}
