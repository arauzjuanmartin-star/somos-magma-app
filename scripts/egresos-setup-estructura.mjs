// Setup ADITIVO de estructura para el módulo Egresos ampliado.
// - CUENTAS: agrega columnas "Saldo USD" y "Hist saldos" si faltan + cuenta "Dólares"
// - PRESTAMOS: agrega columnas "Tipo", "Deudor", "Acreedor", "Saldado" (para deudas socio↔Magma)
// - MOVIMIENTOS: crea la solapa (plata que cambia de lugar, NO gastos)
// NO borra ni pisa datos. Idempotente: si ya existe, no duplica.
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
    const i=l.indexOf('='); let v=l.slice(i+1).trim()
    if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1)
    return [l.slice(0,i).trim(),v]
  })
)
const auth = new google.auth.GoogleAuth({
  credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},
  scopes:['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({version:'v4',auth})
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

const meta = await sheets.spreadsheets.get({spreadsheetId:SHEET_ID, fields:'sheets(properties(title,sheetId,gridProperties(columnCount)))'})
const tabs = Object.fromEntries(meta.data.sheets.map(s=>[s.properties.title, s.properties]))

// helper: leer headers (fila 1) de una solapa
async function headersDe(tab){
  const r = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID, range:`${tab}!1:1`})
  return r.data.values?.[0] || []
}
// helper: agregar columnas que falten al final de la fila 1 (expande la grilla si hace falta)
async function agregarColsSiFaltan(tab, nuevas){
  const h = await headersDe(tab)
  const faltan = nuevas.filter(n => !h.includes(n))
  if(!faltan.length){ console.log(`  ${tab}: columnas ya existen (${nuevas.join(', ')})`); return }
  const startCol = h.length
  const necesita = startCol + faltan.length
  const colCount = tabs[tab]?.gridProperties?.columnCount || startCol
  if(necesita > colCount){
    await sheets.spreadsheets.batchUpdate({spreadsheetId:SHEET_ID, requestBody:{requests:[{appendDimension:{sheetId:tabs[tab].sheetId, dimension:'COLUMNS', length:necesita-colCount}}]}})
    console.log(`  ${tab}: grilla expandida ${colCount}→${necesita} columnas`)
  }
  const updates = faltan.map((name,i)=>({ range:`${tab}!${colLetra(startCol+i)}1`, values:[[name]] }))
  await sheets.spreadsheets.values.batchUpdate({spreadsheetId:SHEET_ID, requestBody:{valueInputOption:'RAW', data:updates}})
  console.log(`  ${tab}: +columnas ${faltan.join(', ')} (desde ${colLetra(startCol)})`)
}

console.log('=== 1) CUENTAS ===')
await agregarColsSiFaltan('CUENTAS', ['Saldo USD','Hist saldos'])
// cuenta "Dólares"
{
  const r = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID, range:`CUENTAS!A:E`})
  const rows = r.data.values||[]
  const existe = rows.slice(1).some(row => String(row[0]||'').trim().toLowerCase()==='dólares' || String(row[0]||'').trim().toLowerCase()==='dolares')
  if(existe){ console.log('  cuenta Dólares: ya existe') }
  else {
    const h = await headersDe('CUENTAS')
    const fila = new Array(h.length).fill('')
    const set=(name,val)=>{ const i=h.indexOf(name); if(i>=0) fila[i]=val }
    set('Nombre','Dólares'); set('Tipo','Dólares'); set('Activa','SÍ'); set('Saldo actual',0); set('Saldo USD',0)
    set('Notas','Dólares en efectivo/guardados. Saldo en USD (col Saldo USD), no en pesos.')
    await sheets.spreadsheets.values.append({spreadsheetId:SHEET_ID, range:'CUENTAS!A:Z', valueInputOption:'USER_ENTERED', insertDataOption:'INSERT_ROWS', requestBody:{values:[fila]}})
    console.log('  cuenta Dólares: creada (Saldo USD 0)')
  }
}

console.log('=== 2) PRESTAMOS ===')
await agregarColsSiFaltan('PRESTAMOS', ['Tipo','Deudor','Acreedor','Saldado'])
// marcar los préstamos existentes (bancarios) como Tipo=Banco si está vacío
{
  const h = await headersDe('PRESTAMOS')
  const iTipo = h.indexOf('Tipo')
  const r = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID, range:`PRESTAMOS!A:${colLetra(h.length-1)}`})
  const rows = r.data.values||[]
  const ups=[]
  rows.slice(1).forEach((row,i)=>{ if(String(row[0]||'').trim() && !String(row[iTipo]||'').trim()) ups.push({range:`PRESTAMOS!${colLetra(iTipo)}${i+2}`, values:[['Banco']]}) })
  if(ups.length){ await sheets.spreadsheets.values.batchUpdate({spreadsheetId:SHEET_ID, requestBody:{valueInputOption:'RAW', data:ups}}); console.log(`  ${ups.length} préstamos existentes marcados Tipo=Banco`) }
  else console.log('  préstamos existentes: Tipo ya seteado')
}

console.log('=== 3) MOVIMIENTOS ===')
if(tabs['MOVIMIENTOS']!=null){ console.log('  solapa MOVIMIENTOS: ya existe') }
else {
  await sheets.spreadsheets.batchUpdate({spreadsheetId:SHEET_ID, requestBody:{requests:[{addSheet:{properties:{title:'MOVIMIENTOS'}}}]}})
  const H=['Fecha','Tipo','Descripción','Cuenta origen','Moneda origen','Monto origen','Cuenta destino','Moneda destino','Monto destino','Cotización','Persona','Cargado por','Timestamp','Notas']
  await sheets.spreadsheets.values.update({spreadsheetId:SHEET_ID, range:'MOVIMIENTOS!A1', valueInputOption:'RAW', requestBody:{values:[H]}})
  console.log('  solapa MOVIMIENTOS: creada con headers')
}

console.log('\n✅ Setup de estructura listo. Nada se borró.')
