// Verificación end-to-end: agarra los últimos presupuestos y muestra qué se guardó
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]})
)
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth = new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets = google.sheets({version:'v4',auth})

const r = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PRESUPUESTOS!A:AX'})
const headers = r.data.values[0]
const allRows = r.data.values.slice(1).filter(row => row.some(c => c!==''))

// Tomar los últimos 5 con número mayor a 1890
const recientes = allRows
  .map((row,i) => ({fila: i+2, row, num: parseInt(String(row[0]||'').match(/^\d+/)?.[0]||0)}))
  .filter(x => x.num >= 1890)
  .sort((a,b) => b.num - a.num)
  .slice(0,8)

console.log(`Headers: ${headers.length} columnas total\n`)
console.log(`Verificando últimos ${recientes.length} presupuestos:\n`)

recientes.forEach(({fila,row,num}) => {
  console.log(`\n=== #${row[0]} (fila ${fila}) ===`)
  // Campos clave en orden
  const criticos = [
    'Columna 1','Estado','PM Interno','Agencia','Cliente','Proyecto','Contacto',
    'Fecha Presupuesto','Fecha Evento','Cant. Fechas','Tipo Fechas','Fechas Adicionales',
    'Precio Final','Subtotal','Fee Agencia','Impuesto a las ganancias','IIBB',
    'Plazo','Interes %','Interes $','Total','Ajuste','Fee Servicios',
  ]
  criticos.forEach(campo => {
    const idx = headers.indexOf(campo)
    if (idx === -1) { console.log(`  ❓ ${campo}: <columna no existe en sheet>`); return }
    const val = row[idx] || ''
    const ok = val !== '' && val !== '0' && val !== 0
    const icon = ok ? '✓' : (campo.startsWith('Interes') || campo === 'Ajuste' || campo === 'Fechas Adicionales' || campo === 'Tipo Fechas' || campo === 'Fee Servicios') ? '·' : '⚠'
    console.log(`  ${icon} ${campo.padEnd(28)} ${val}`)
  })

  // Pedidos
  console.log('  --- Pedidos ---')
  for (let i=1;i<=12;i++){
    const idxP = headers.indexOf('Pedido '+i)
    const idxV = headers.indexOf('Precio '+i)
    const ped = row[idxP] || ''
    const prc = row[idxV] || ''
    if (ped) console.log(`  ✓ ${('Pedido '+i).padEnd(28)} ${ped}  →  $${prc}`)
  }
})

// === Análisis transversal ===
console.log('\n\n===== ANÁLISIS TRANSVERSAL (todos los presus 2026) =====')
const presus2026 = allRows.filter(r => /2026/.test(String(r[1]||r[9]||'')))
console.log(`Total presupuestos 2026: ${presus2026.length}`)

const camposCheck = [
  'PM Interno','Agencia','Cliente','Proyecto','Contacto',
  'Fecha Evento','Tipo Fechas','Fechas Adicionales',
  'Precio Final','Subtotal','Fee Agencia','Impuesto a las ganancias','IIBB',
  'Plazo','Fee Servicios',
]
console.log('\n% completitud por campo:')
camposCheck.forEach(campo => {
  const idx = headers.indexOf(campo)
  if (idx === -1) return
  const conValor = presus2026.filter(r => (r[idx]||'') !== '' && r[idx] !== '0' && r[idx] !== 0).length
  const pct = Math.round(conValor/presus2026.length*100)
  const barra = '█'.repeat(Math.round(pct/5)) + '·'.repeat(20-Math.round(pct/5))
  console.log(`  ${campo.padEnd(28)} ${barra} ${pct.toString().padStart(3)}% (${conValor}/${presus2026.length})`)
})
