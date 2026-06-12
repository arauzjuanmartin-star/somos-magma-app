// Simula la lógica de kpis.sinFacturar EXACTA del front, contra el sheet vivo
import { google } from 'googleapis'
import { readFileSync } from 'fs'
readFileSync('.env.local','utf-8').split('\n').forEach(l => {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"|"$/g,'')
})

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

// Replica lib/sheets.js toProyectos + toObjects
const toProyectos = (values) => {
  if (!values || values.length < 2) return []
  const headers = values[0]
  return values.slice(1).filter(row => row.some(c => c !== '')).map(row => {
    const obj = {}
    let staffN = 0, precioN = 0
    headers.forEach((h, i) => {
      if (h === 'Staff') { staffN++; obj['Staff '+staffN] = row[i] || '' }
      else if (h === 'Precio') { precioN++; obj['Precio '+precioN] = row[i] || '' }
      else { obj[h] = row[i] || '' }
    })
    return obj
  })
}
const toObjects = values => {
  if (!values || values.length < 2) return []
  const headers = values[0]
  return values.slice(1).filter(row => row.some(c => c !== '')).map(row => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = row[i] || '' })
    return obj
  })
}

const proyRaw = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:BH' })
const facRaw = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AG' })
const proyectos = toProyectos(proyRaw.data.values)
const fc = toObjects(facRaw.data.values)

console.log('Total proyectos:', proyectos.length)
console.log('Total facturas:', fc.length)

const facNums = new Set(fc.map(f => String(f['N° Presupuesto']||'').trim()).filter(Boolean))
const sinFacturar = proyectos.filter(p => p['N° presupuesto'] && !facNums.has(String(p['N° presupuesto']).trim()))

console.log('\n=== SIN FACTURAR (replica del front) ===')
console.log('Total:', sinFacturar.length)
const beccar = sinFacturar.filter(p => /beccar|1957/i.test(String(p['N° presupuesto']) + ' ' + p['Proyecto']))
console.log('\n¿#1957 Beccar en sin facturar?')
console.log(beccar.length === 0 ? '❌ NO aparece — BUG' : '✓ SÍ aparece')
beccar.forEach(p => console.log(`  N°:${p['N° presupuesto']} | Cli:${p['Cliente']} | Proy:${p['Proyecto']} | Total:${p['Total ']||p['Total']}`))

// Ver junio
const junio = sinFacturar.filter(p => String(p['Fecha Evento']||'').includes('/6/2026'))
console.log('\nJunio 2026 sin facturar (' + junio.length + '):')
junio.forEach(p => console.log(`  #${p['N° presupuesto']} | ${p['Cliente']} - ${p['Proyecto']} | ${p['Fecha Evento']} | ${p['Total ']||p['Total']}`))

// Diagnóstico: cómo aparece la fila #1957 raw
const fila1957raw = proyRaw.data.values.find(r => String(r[2]) === '1957')
console.log('\n=== Raw row #1957 ===')
console.log('Existe:', !!fila1957raw)
if (fila1957raw) {
  console.log('A (Mes):', fila1957raw[0])
  console.log('B (Carga Staff):', fila1957raw[1])
  console.log('C (N° presupuesto):', fila1957raw[2], 'typeof:', typeof fila1957raw[2])
  console.log('D (Fecha Evento):', fila1957raw[3])
  console.log('F (Cliente):', fila1957raw[5])
  console.log('G (Proyecto):', fila1957raw[6])
}

// ¿Y como objeto procesado?
const obj1957 = proyectos.find(p => String(p['N° presupuesto']) === '1957')
console.log('\n=== Object #1957 ===')
console.log('Existe en proyectos array:', !!obj1957)
if (obj1957) {
  console.log('N° presupuesto:', JSON.stringify(obj1957['N° presupuesto']))
  console.log('keys con "presupuesto":', Object.keys(obj1957).filter(k => k.toLowerCase().includes('presupuesto')))
}
