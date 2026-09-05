// Lleva la solapa EDICION al modelo nuevo (5/9/2026): las columnas de "qué es
// la pieza", el brief del editor, los contadores de rondas y los estados del
// circuito con las dos aprobaciones.
//
// Por qué se puede reordenar sin miedo AHORA: las 61 filas que hay las escribió
// el sincronizador y ninguna la tocó una persona (Estado="Sin material", Por="sync").
// Igual hace copia de seguridad antes de tocar nada.
//
//   node scripts/edicion-migrar.mjs              → preview
//   node scripts/edicion-migrar.mjs --escribir   → aplica

import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { HEADERS_EDICION, ESTADOS, PRIORIDADES, CLASES_VIDEO, CAMPOS_PIEZA } from '../lib/edicion.js'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim()
  if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1)
  return [l.slice(0,i).trim(), v]
}))
const auth = new google.auth.GoogleAuth({
  credentials:{ client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') },
  scopes:['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version:'v4', auth })
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const colLetra = c => { let s='', n=c+1; while(n>0){ n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26) } return s }
const ULT = colLetra(HEADERS_EDICION.length - 1)

const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields:'sheets(properties(title,sheetId,gridProperties))' })
const props = meta.data.sheets.map(x=>x.properties)
const ed = props.find(x=>x.title==='EDICION')
if (!ed) { console.log('No existe la solapa EDICION — correr edicion-setup.mjs --escribir'); process.exit(1) }

const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range:'EDICION!A:AZ' })
const filas = r.data.values || []
const hViejo = filas[0] || []
const datos = filas.slice(1).filter(f=>f.some(Boolean))

// Los estados del modelo viejo se traducen al circuito nuevo (dos aprobaciones).
const ESTADO_VIEJO_A_NUEVO = {
  'V1 enviada': 'Para revisar',
  'Cambios pedidos': 'Cambios del cliente',
}

const iPor = hViejo.indexOf('Por'), iEst = hViejo.indexOf('Estado'), iId = hViejo.indexOf('ID')
const humanas = datos.filter(f => { const por = String(f[iPor]||'').trim(); return por && por !== 'sync' })

console.log('════════ MIGRACIÓN DE LA SOLAPA EDICION ════════\n')
console.log(`Hoy:    ${hViejo.length} columnas · ${datos.length} filas`)
console.log(`Queda:  ${HEADERS_EDICION.length} columnas (A:${ULT})`)
console.log(`\nFilas que cargó una persona (se conservan igual): ${humanas.length}`)
humanas.forEach(f=>console.log(`   ${String(f[iId]||'').padEnd(8)} ${String(f[iPor]||'')} · ${f[iEst]}`))

// Remapea por NOMBRE de header, así el reordenamiento no mueve ningún dato de lugar.
const perdidas = hViejo.filter(h => h && !HEADERS_EDICION.includes(h))
const nuevasFilas = datos.map(f => {
  const out = new Array(HEADERS_EDICION.length).fill('')
  HEADERS_EDICION.forEach((h, i) => {
    const j = hViejo.indexOf(h)
    if (j > -1 && f[j] !== undefined) out[i] = f[j]
  })
  const iEstNuevo = HEADERS_EDICION.indexOf('Estado')
  const est = String(out[iEstNuevo] || '').trim()
  if (ESTADO_VIEJO_A_NUEVO[est]) out[iEstNuevo] = ESTADO_VIEJO_A_NUEVO[est]
  return out
})

const traducidos = datos.filter(f => ESTADO_VIEJO_A_NUEVO[String(f[iEst]||'').trim()]).length
if (traducidos) console.log(`\nEstados traducidos al circuito nuevo: ${traducidos}`)

console.log('\n--- columnas nuevas ---')
HEADERS_EDICION.forEach((h,i)=>{ if(!hViejo.includes(h)) console.log(`   + ${colLetra(i).padStart(2)} ${h}`) })
if (perdidas.length) console.log('\n⚠️  columnas que se perderían:\n   ' + perdidas.join(' · '))
else console.log('\n✓ ninguna columna vieja se pierde: todas existen en el modelo nuevo')

console.log('\n--- qué hace ---')
console.log(`   1. Copia EDICION a "EDICION_backup_${new Date().toISOString().slice(0,10)}"`)
console.log(`   2. Reescribe las ${datos.length} filas en el orden nuevo, mapeando por nombre de columna`)
console.log(`   3. Escribe los ${HEADERS_EDICION.length} headers nuevos, en negrita y con la fila fija`)
console.log(`   4. Pone desplegables: Estado (${ESTADOS.length}), Prioridad, Clase (${CLASES_VIDEO.length}) y los demás de la pieza`)
console.log('   5. Después conviene correr:  node scripts/edicion-sync.mjs --escribir')

if (!ESCRIBIR) { console.log('\n👀 PREVIEW — no se tocó nada. Corré con --escribir para aplicar.'); process.exit(0) }

// 1. backup
const nombreBk = `EDICION_backup_${new Date().toISOString().slice(0,10)}`
if (!props.find(x=>x.title===nombreBk)) {
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody:{ requests:[
    { duplicateSheet: { sourceSheetId: ed.sheetId, newSheetName: nombreBk, insertSheetIndex: props.length } },
  ]}})
  console.log(`\n✓ backup en "${nombreBk}"`)
} else console.log(`\n· el backup "${nombreBk}" ya existía`)

// 2 y 3. limpiar y headers
await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range:'EDICION!A:AZ' })
if (ed.gridProperties.columnCount < HEADERS_EDICION.length) {
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody:{ requests:[
    { appendDimension: { sheetId: ed.sheetId, dimension:'COLUMNS', length: HEADERS_EDICION.length - ed.gridProperties.columnCount } },
  ]}})
}
await sheets.spreadsheets.values.update({
  spreadsheetId: SHEET_ID, range:'EDICION!A1', valueInputOption:'RAW',
  requestBody:{ values:[HEADERS_EDICION] },
})
if (nuevasFilas.length) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range:`EDICION!A2:${ULT}${nuevasFilas.length + 1}`,
    valueInputOption:'USER_ENTERED', requestBody:{ values: nuevasFilas },
  })
  console.log(`✓ ${nuevasFilas.length} filas reescritas en el orden nuevo`)
}

// 4. formato + desplegables (el sheet es una interfaz, no un depósito)
const col = n => HEADERS_EDICION.indexOf(n)
const lista = (nombre, valores) => ({ setDataValidation: {
  range: { sheetId: ed.sheetId, startRowIndex:1, endRowIndex:2000, startColumnIndex: col(nombre), endColumnIndex: col(nombre)+1 },
  rule: { condition:{ type:'ONE_OF_LIST', values: valores.map(v=>({userEnteredValue:v})) }, showCustomUi:true, strict:false },
}})
const reqs = [
  { repeatCell: {
      range:{ sheetId: ed.sheetId, startRowIndex:0, endRowIndex:1 },
      cell:{ userEnteredFormat:{ textFormat:{bold:true}, backgroundColor:{red:0.94,green:0.93,blue:0.91}, wrapStrategy:'CLIP' } },
      fields:'userEnteredFormat(textFormat,backgroundColor,wrapStrategy)',
  }},
  { updateSheetProperties: { properties:{ sheetId: ed.sheetId, gridProperties:{ frozenRowCount:1, frozenColumnCount:1 } }, fields:'gridProperties(frozenRowCount,frozenColumnCount)' }},
  lista('Estado', ESTADOS),
  lista('Prioridad', PRIORIDADES),
  ...CAMPOS_PIEZA.map(c => lista(c.campo, c.opciones)),
  lista('Subtítulos', ['Sí, sobre el video','No','A definir']),
  lista('Testimonios', ['Sí','No','A definir']),
  lista('Origen', ['sync','manual']),
  // El filtro tiene que abarcar TODAS las columnas o la nueva no aparece en el desplegable
  { setBasicFilter: { filter: { range: { sheetId: ed.sheetId, startRowIndex:0, startColumnIndex:0, endColumnIndex: HEADERS_EDICION.length } } } },
]
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody:{ requests: reqs } })

console.log('✓ headers, formato y desplegables listos')
console.log('\nAhora corré:  node scripts/edicion-sync.mjs --escribir')
