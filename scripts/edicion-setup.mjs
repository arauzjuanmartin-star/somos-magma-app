// Prepara el sheet para el módulo de Edición (post-producción):
//   1. Crea la solapa EDICION con sus headers (una fila por entregable)
//   2. Agrega a PROYECTOS las columnas "Drive Crudo" (ES) y "Drive Entrega" (ET)
//
// Sin --escribir solo muestra qué va a hacer. Nada destructivo: no borra ni pisa.
//   node scripts/edicion-setup.mjs              → preview
//   node scripts/edicion-setup.mjs --escribir   → aplica

import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { HEADERS_EDICION } from '../lib/edicion.js'

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

const COLS_PROY_NUEVAS = ['Drive Crudo', 'Drive Entrega']
const colLetraTop = n => { let s2=''; n++; while(n>0){ const m=(n-1)%26; s2=String.fromCharCode(65+m)+s2; n=Math.floor((n-1)/26) } return s2 }

const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties(title,sheetId,gridProperties))' })
const solapas = meta.data.sheets.map(s => s.properties)
const yaExiste = solapas.find(s => s.title === 'EDICION')

console.log('════════ SETUP MÓDULO EDICIÓN ════════\n')

// ---- 1. Solapa EDICION ----
if (yaExiste) {
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'EDICION!A1:Z1' })
  const h = r.data.values?.[0] || []
  const faltan = HEADERS_EDICION.filter(x => !h.includes(x))
  console.log(`1) Solapa EDICION: ya existe (${h.length} columnas)`)
  if (!faltan.length) console.log('   ✓ headers completos')
  else {
    faltan.forEach((c, i) => console.log(`   + ${colLetraTop(h.length + i)} → "${c}"`))
    if (ESCRIBIR) {
      const sid = solapas.find(s2 => s2.title === 'EDICION')
      const necesarias = h.length + faltan.length
      if (sid.gridProperties.columnCount < necesarias) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { requests: [{ appendDimension: { sheetId: sid.sheetId, dimension: 'COLUMNS', length: necesarias - sid.gridProperties.columnCount } }] },
        })
      }
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `EDICION!${colLetraTop(h.length)}1:${colLetraTop(necesarias - 1)}1`,
        valueInputOption: 'RAW', requestBody: { values: [faltan] },
      })
      console.log('   ✓ agregadas')
    }
  }
} else {
  console.log('1) Solapa EDICION: NO existe → se crea con estos headers')
  console.log('   ' + HEADERS_EDICION.join(' | '))
  if (ESCRIBIR) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: 'EDICION', gridProperties: { rowCount: 2000, columnCount: HEADERS_EDICION.length + 3, frozenRowCount: 1 } } } }] },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: 'EDICION!A1',
      valueInputOption: 'RAW', requestBody: { values: [HEADERS_EDICION] },
    })
    // Negrita en la fila de headers
    const meta2 = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties(title,sheetId))' })
    const sid = meta2.data.sheets.find(s => s.properties.title === 'EDICION').properties.sheetId
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ repeatCell: {
        range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red:0.94, green:0.93, blue:0.91 } } },
        fields: 'userEnteredFormat(textFormat,backgroundColor)',
      } }] },
    })
    console.log('   ✓ creada')
  }
}

// ---- 2. Columnas de Drive en PROYECTOS ----
const rP = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A1:FZ1' })
const hP = rP.data.values?.[0] || []
const colLetra = n => { let s=''; n++; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26) } return s }
const faltanCols = COLS_PROY_NUEVAS.filter(c => !hP.includes(c))
console.log(`\n2) PROYECTOS: ${hP.length} columnas hoy (última ${colLetra(hP.length-1)})`)
if (!faltanCols.length) {
  console.log('   ✓ "Drive Crudo" y "Drive Entrega" ya están')
} else {
  faltanCols.forEach((c, i) => console.log(`   + ${colLetra(hP.length + i)} → "${c}"`))
  if (ESCRIBIR) {
    const proySid = solapas.find(s => s.title === 'PROYECTOS').sheetId
    const anchoActual = solapas.find(s => s.title === 'PROYECTOS').gridProperties.columnCount
    const necesarias = hP.length + faltanCols.length
    if (anchoActual < necesarias) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { requests: [{ appendDimension: { sheetId: proySid, dimension: 'COLUMNS', length: necesarias - anchoActual } }] },
      })
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `PROYECTOS!${colLetra(hP.length)}1:${colLetra(necesarias-1)}1`,
      valueInputOption: 'RAW', requestBody: { values: [faltanCols] },
    })
    console.log('   ✓ agregadas')
  }
}

console.log(ESCRIBIR ? '\n✅ Listo.' : '\n👀 PREVIEW — nada se escribió. Corré con --escribir para aplicar.')
