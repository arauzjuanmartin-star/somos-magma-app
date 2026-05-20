import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
    const i=l.indexOf('='); let v=l.slice(i+1).trim()
    if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1)
    return [l.slice(0,i).trim(),v]
  })
)
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth = new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets = google.sheets({version:'v4',auth})

const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties)' })
const presuSheet = meta.data.sheets.find(s => s.properties.title === 'PRESUPUESTOS').properties

// Leer todo para encontrar las filas por N° (NO por número de fila fijo, por si moves)
const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:K' })
const rows = r.data.values

// Identificar las filas (los 1894 que aparecieron por bug — distinguir por contenido)
const filasOriginales = [] // {fila, n, cliente, proy, total, accion, nuevoN, nuevoEstado}
for (let i=1; i<rows.length; i++) {
  const n = String(rows[i][0]||'').trim()
  if (n === '1894') {
    const cli=rows[i][5]||'', proy=rows[i][6]||'', total=rows[i][8]||'', estado=rows[i][3]||''
    filasOriginales.push({ fila: i+1, n, cli, proy, total, estado, agencia: rows[i][4] })
  } else if (n === '1894v2') {
    const cli=rows[i][5]||'', proy=rows[i][6]||'', total=rows[i][8]||''
    filasOriginales.push({ fila: i+1, n, cli, proy, total, estado: rows[i][3], agencia: rows[i][4] })
  }
}

console.log('Filas a procesar:')
filasOriginales.forEach(f => console.log(' ', f.fila, '|', f.n, '|', f.agencia, '/', f.cli, '/', f.proy, '|', f.total, '|', f.estado))

// Definir acciones
const acciones = filasOriginales.map(f => {
  // 1894 Ostara/Santander (REPRESUPUESTADO) → quedar como EN ESPERA
  if (f.agencia === 'Ostara' && /santander/i.test(f.cli)) return { ...f, accion: 'estado', nuevoEstado: 'EN ESPERA' }
  // 1894 ADN/Iveco $3.3M → renumerar a 1895
  if (f.agencia === 'ADN' && /iveco/i.test(f.cli)) return { ...f, accion: 'renumerar', nuevoN: '1895' }
  // 1894v2 Mods/Downy → renumerar a 1896 (NO es represupuesto)
  if (f.n === '1894v2' && /downy/i.test(f.cli)) return { ...f, accion: 'renumerar', nuevoN: '1896' }
  // 1894 Mods sin cliente → eliminar
  if (f.agencia === 'Mods' && !f.cli) return { ...f, accion: 'eliminar' }
  return { ...f, accion: 'sin-clasificar' }
})

console.log('\nAcciones planeadas:')
acciones.forEach(a => console.log(`  fila ${a.fila} (${a.agencia}/${a.cli||'—'}): ${a.accion}${a.nuevoN?' → '+a.nuevoN:''}${a.nuevoEstado?' → '+a.nuevoEstado:''}`))

if (acciones.some(a => a.accion === 'sin-clasificar')) {
  console.log('\n⚠ Hay filas sin clasificar — revisar antes de ejecutar')
  process.exit(1)
}

// === EJECUTAR ===
// 1. Updates (renumerar + cambiar estado)
const updates = []
for (const a of acciones) {
  if (a.accion === 'renumerar') updates.push({ range: `PRESUPUESTOS!A${a.fila}`, values: [[a.nuevoN]] })
  if (a.accion === 'estado') updates.push({ range: `PRESUPUESTOS!D${a.fila}`, values: [[a.nuevoEstado]] })
}
if (updates.length > 0) {
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
  })
  console.log(`\n✓ ${updates.length} updates aplicados (renumeraciones + estado)`)
}

// 2. Eliminar filas — en orden DESCENDENTE para no desplazar índices
const filasABorrar = acciones.filter(a => a.accion === 'eliminar').map(a => a.fila).sort((a,b)=>b-a)
if (filasABorrar.length > 0) {
  const requests = filasABorrar.map(f => ({
    deleteDimension: {
      range: { sheetId: presuSheet.sheetId, dimension: 'ROWS', startIndex: f-1, endIndex: f }
    }
  }))
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests }
  })
  console.log(`✓ ${filasABorrar.length} filas eliminadas`)
}

console.log('\n===== LISTO =====')
