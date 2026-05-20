// Para cada factura marcada como Cobrada en FACTURACION que NO tenga entrada en COBROS,
// genera la entrada correspondiente. Reconstruye el historial bancario.
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]})
)
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth = new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets = google.sheets({version:'v4',auth})

const ejecutar = process.argv.includes('--ejecutar')
const num = v => parseFloat(String(v||'0').replace(/[^\d.-]/g,''))||0
const norm = v => String(v||'').trim()

// 1. Leer FACTURACION y COBROS
const [factR, cobR] = await Promise.all([
  sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'FACTURACION!A:AG'}),
  sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'COBROS!A:L'}),
])
const fHeaders = factR.data.values[0]
const cHeaders = cobR.data.values[0]
console.log('FACTURACION headers:', fHeaders.length, 'cols')
console.log('COBROS headers:', cHeaders.join(' | '))

const F = name => fHeaders.indexOf(name)
const idxF = {
  presu: F('N° Presupuesto'),
  fechaEv: F('Fecha Evento'),
  agencia: F('Agencia'),
  cliente: F('Cliente'),
  proyecto: F('Proyecto'),
  precioFinal: F('Precio FINAL'),
  precioNeto: F('Precio SIN IVA'),
  iva: F('IVA'),
  tipo: F('Tipo de Factura'),
  cobrado: F('Cobrado'),
  fechaCobro: F('Fecha cobro'),
  cob30: F('Cobrado 30%'),
  cob50: F('Cobrado 50%'),
  cuenta: F('Cuenta destino'),
  forma: F('Forma de pago'),
  retG: F('Ret. Ganancias'),
  retI: F('Ret. IIBB'),
  retV: F('Ret. IVA'),
  com: F('Comision banco'),
  montoCob: F('Monto cobrado'),
}

// 2. Identificar cobros existentes (por N° Presupuesto)
const cobrosExistentes = new Set()
cobR.data.values.slice(1).forEach(row => {
  const presu = norm(row[1])  // col B = N° Presupuesto
  if (presu) cobrosExistentes.add(presu)
})
console.log(`\nCobros existentes en COBROS: ${cobrosExistentes.size}`)

// 3. Identificar facturas cobradas que NO tienen entrada en COBROS
const cobradasSinMov = []
factR.data.values.slice(1).forEach((row, i) => {
  const fila = i + 2
  const cobrado = String(row[idxF.cobrado]||'').toUpperCase()
  if (cobrado !== 'TRUE') return
  const presu = norm(row[idxF.presu])
  if (!presu) return
  if (cobrosExistentes.has(presu)) return  // ya hay un cobro para este presu

  cobradasSinMov.push({
    fila,
    nro: presu,
    cliente: row[idxF.cliente]||'',
    proyecto: row[idxF.proyecto]||'',
    fechaEv: row[idxF.fechaEv]||'',
    fechaCobro: row[idxF.fechaCobro]||'',
    precioFinal: num(row[idxF.precioFinal]),
    montoCob: num(row[idxF.montoCob]),
    cuenta: row[idxF.cuenta]||'',
    forma: row[idxF.forma]||'',
    retG: num(row[idxF.retG]),
    retI: num(row[idxF.retI]),
    retV: num(row[idxF.retV]),
    com: num(row[idxF.com]),
    tipo: row[idxF.tipo]||'',
  })
})

console.log(`\nFacturas COBRADAS sin entrada en COBROS: ${cobradasSinMov.length}`)
const totalMonto = cobradasSinMov.reduce((s,f)=>s+f.precioFinal,0)
console.log(`Monto total a reconstruir: $${totalMonto.toLocaleString('es-AR')}`)

console.log('\nSample (primeras 10):')
cobradasSinMov.slice(0,10).forEach(f => console.log(`  fila ${f.fila} | #${f.nro} | ${f.cliente.slice(0,20).padEnd(20)} | ${f.fechaCobro||f.fechaEv} | $${f.precioFinal.toLocaleString('es-AR')} | cuenta:${f.cuenta||'?'}`))

if (!ejecutar) {
  console.log('\n💡 Para ejecutar la migración: node scripts/migrar-cobros-historicos.mjs --ejecutar')
  process.exit(0)
}

// 4. Crear entradas en COBROS
console.log(`\n===== MIGRANDO ${cobradasSinMov.length} cobros... =====`)
const filasNuevas = cobradasSinMov.map(f => [
  f.fechaCobro || f.fechaEv || new Date().toLocaleDateString('es-AR'),   // Timestamp
  f.nro,                                                                  // N° Presupuesto
  f.cliente,                                                              // Cliente
  'total',                                                                // Tipo
  f.precioFinal,                                                          // Monto
  f.cuenta,                                                               // Cuenta destino
  f.forma,                                                                // Forma de pago
  f.retG,                                                                 // Ret. Ganancias
  f.retI,                                                                 // Ret. IIBB
  f.retV,                                                                 // Ret. IVA
  f.com,                                                                  // Comision
  'Migrado del histórico — cobro reconstruido desde FACTURACION',         // Notas
])

// Append en batches de 100
const BATCH = 100
for (let i = 0; i < filasNuevas.length; i += BATCH) {
  const batch = filasNuevas.slice(i, i+BATCH)
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'COBROS!A:L',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: batch }
  })
  console.log(`  ✓ Batch ${i/BATCH+1}: ${batch.length} filas`)
}

console.log(`\n✓ Migración completa: ${filasNuevas.length} entradas creadas en COBROS`)

// Verificar
const verify = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'COBROS!A:A'})
console.log(`Total filas en COBROS ahora: ${verify.data.values.length-1}`)
