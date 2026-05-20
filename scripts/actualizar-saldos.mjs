// Actualiza saldos de CUENTAS + agrega columna Saldo USD si falta
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]})
)
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth = new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets = google.sheets({version:'v4',auth})

// 1. Asegurar que existe la col Saldo USD
const meta = await sheets.spreadsheets.get({spreadsheetId:SHEET_ID,fields:'sheets(properties)'})
const cuentasSheet = meta.data.sheets.find(s=>s.properties.title==='CUENTAS').properties
if (cuentasSheet.gridProperties.columnCount < 10) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ appendDimension: { sheetId: cuentasSheet.sheetId, dimension: 'COLUMNS', length: 10 - cuentasSheet.gridProperties.columnCount } }] }
  })
}

const headersR = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'CUENTAS!A:J'})
const headers = headersR.data.values[0]
if (!headers.includes('Saldo USD')) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `CUENTAS!I1:J1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['Saldo USD', 'Hist saldos']] }
  })
  console.log('✓ Columnas Saldo USD + Hist saldos agregadas')
}

// 2. Leer el sheet de nuevo con las cols actualizadas
const r = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'CUENTAS!A:J'})
const rows = r.data.values
const hdrs = rows[0]
const idxNombre = hdrs.indexOf('Nombre')
const idxSaldo = hdrs.indexOf('Saldo actual')
const idxFecha = hdrs.indexOf('Última actualización')
const idxSaldoUSD = hdrs.indexOf('Saldo USD')
const idxHist = hdrs.indexOf('Hist saldos')
const idxActiva = hdrs.indexOf('Activa')

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

// 3. Actualizar saldos
const hoy = new Date().toLocaleDateString('es-AR')
const updates = []
const targets = [
  { nombre: 'BBVA Somos Magma', saldo: 5455035.08, usd: 0 },
  { nombre: 'Galicia Sofi',      saldo: 6096535.07, usd: 0 },
  { nombre: 'Santander Lucia',   saldo: 574055.02,  usd: 0 },
  { nombre: 'Efectivo',          saldo: 0,          usd: 500 },
  { nombre: 'Santander Sofi',    activa: 'NO' }, // Se cerró en abril 2026
]

targets.forEach(t => {
  const filaIdx = rows.findIndex((row,i) => i>0 && row[idxNombre] === t.nombre)
  if (filaIdx === -1) { console.log(`⚠ No encontré "${t.nombre}"`); return }
  const fila = filaIdx + 1
  if (t.saldo !== undefined) updates.push({ range: `CUENTAS!${colLetra(idxSaldo)}${fila}`, values: [[t.saldo]] })
  if (t.usd !== undefined) updates.push({ range: `CUENTAS!${colLetra(idxSaldoUSD)}${fila}`, values: [[t.usd]] })
  if (t.saldo !== undefined) updates.push({ range: `CUENTAS!${colLetra(idxFecha)}${fila}`, values: [[hoy]] })
  if (t.activa !== undefined) updates.push({ range: `CUENTAS!${colLetra(idxActiva)}${fila}`, values: [[t.activa]] })
  // Agregar al hist
  const prevHist = rows[filaIdx][idxHist] || ''
  if (t.saldo !== undefined) {
    const newHist = prevHist + `${hoy}: $${t.saldo.toLocaleString('es-AR')}${t.usd?' + USD '+t.usd:''}\n`
    updates.push({ range: `CUENTAS!${colLetra(idxHist)}${fila}`, values: [[newHist.slice(-500)]] })
  }
})

await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId: SHEET_ID,
  requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
})
console.log(`✓ ${updates.length} actualizaciones aplicadas`)

// 4. Mostrar estado final
const f = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'CUENTAS!A:J'})
console.log('\n=== ESTADO FINAL ===')
f.data.values.forEach((row,i) => {
  if (i===0) console.log('  Headers:', row.join(' | '))
  else if (row[0]) console.log(`  ${row[0].padEnd(25)} | ${row[3]} | activa: ${row[4]} | $${row[5]} ARS${row[8]?' + USD '+row[8]:''} | actualizado ${row[6]}`)
})
const total = f.data.values.slice(1).filter(r=>r[4]==='SÍ'||r[4]==='SI').reduce((s,r)=>s+Number(String(r[5]||0).replace(/[^\d.-]/g,''))||0,0)
const totalUSD = f.data.values.slice(1).filter(r=>r[4]==='SÍ'||r[4]==='SI').reduce((s,r)=>s+Number(String(r[8]||0).replace(/[^\d.-]/g,''))||0,0)
console.log(`\n💰 TOTAL DISPONIBLE: $${total.toLocaleString('es-AR')} ARS + USD ${totalUSD}`)
