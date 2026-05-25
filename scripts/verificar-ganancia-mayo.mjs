// Cruza PROYECTOS de mayo 2026 con sus Pagos_Staff reales para verificar el cálculo de ganancia
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]})
)
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth = new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets = google.sheets({version:'v4',auth})

const parseMonto = v => { const s=String(v||'').replace(/[\s$]/g,''); if(s.includes(',')&&s.includes('.'))return s.lastIndexOf(',')>s.lastIndexOf('.')?Number(s.replace(/\./g,'').replace(',','.'))||0:Number(s.replace(/,/g,''))||0; if(s.includes(','))return Number(s.replace(',','.'))||0; return Number(s)||0 }
const fmt = n => Math.round(n).toLocaleString('es-AR')

const [proyR, psR] = await Promise.all([
  sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PROYECTOS!A:CZ'}),
  sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PAGOS_STAFF!A:L'}),
])

const proyHeaders = proyR.data.values[0]
const rawProys = proyR.data.values.slice(1)

// Encontrar índices de columnas clave
const idxFE = proyHeaders.indexOf('Fecha Evento')
const idxNro = proyHeaders.indexOf('N° presupuesto')
const idxCli = proyHeaders.indexOf('Cliente')
const idxAg = proyHeaders.indexOf('Agencia')
const idxProyName = proyHeaders.indexOf('Proyecto')
const idxTotal = proyHeaders.findIndex(h=>String(h||'').trim()==='Total ')
const idxFee = proyHeaders.indexOf('Fee Agencia')
const idxDiferencia = proyHeaders.indexOf('Diferencia')
const idxImpGan = proyHeaders.indexOf('Imp. Ganancias')
const idxIIBB = proyHeaders.indexOf('IIBB')

// Identificar todos los índices de columnas Staff
const staffIdxs = []
proyHeaders.forEach((h,i) => {
  if (h === 'Staff' || /^Staff \d+$/.test(String(h||'').trim())) staffIdxs.push(i)
})

// Pagos_Staff por N° presupuesto
const psPorPresu = {}
psR.data.values.slice(1).forEach(row => {
  const nro = String(row[3]||'').trim()
  if (!nro) return
  if (!psPorPresu[nro]) psPorPresu[nro] = []
  psPorPresu[nro].push({ freelancer: row[1]||'', servicio: row[5]||'', adeudado: parseMonto(row[6]), pagado: parseMonto(row[7]) })
})

const mayo = rawProys.filter(row => /\/5\/2026|\/05\/2026/.test(row[idxFE]||''))
console.log(`\n=== ANÁLISIS GANANCIA REAL — Mayo 2026 ===`)
console.log(`Proyectos mayo: ${mayo.length}\n`)

let totalFee=0, totalSomosMagma=0, totalDiferencia=0, totalImpGan=0, totalIIBB=0, totalStaffAdeudado=0, totalStaffPagado=0
let totalSMItems = 0

mayo.forEach(row => {
  const nro = row[idxNro]||''
  const fee = parseMonto(row[idxFee])
  const diferencia = parseMonto(row[idxDiferencia])
  const impGan = parseMonto(row[idxImpGan])
  const iibb = parseMonto(row[idxIIBB])

  // Sumar precios de cada slot donde Staff = 'Somos Magma'
  let somosMagma = 0
  const smItems = []
  staffIdxs.forEach(staffCol => {
    const staff = String(row[staffCol]||'').trim()
    if (staff === 'Somos Magma') {
      const precio = parseMonto(row[staffCol-1])
      const pedido = row[staffCol-2]||''
      if (precio > 0) { somosMagma += precio; smItems.push({pedido, precio}) }
    }
  })

  const pagos = psPorPresu[String(nro)] || []
  const pagosAd = pagos.reduce((s,x)=>s+x.adeudado,0)
  const pagosPag = pagos.reduce((s,x)=>s+x.pagado,0)

  totalFee += fee
  totalSomosMagma += somosMagma
  totalDiferencia += diferencia
  totalImpGan += impGan
  totalIIBB += iibb
  totalStaffAdeudado += pagosAd
  totalStaffPagado += pagosPag
  totalSMItems += smItems.length

  const ganReal = fee + somosMagma + diferencia
  const cliente = (row[idxCli]||row[idxAg]||'').slice(0,18).padEnd(18)
  const proyName = (row[idxProyName]||'').slice(0,22).padEnd(22)
  const smTag = smItems.length > 0 ? `  +SM x${smItems.length} $${fmt(somosMagma)}` : ''
  console.log(`#${String(nro).padEnd(6)} | ${cliente} | ${proyName} | Fee $${fmt(fee).padStart(8)} | Dif $${fmt(diferencia).padStart(6)} | → Gan $${fmt(ganReal).padStart(8)}${smTag}`)
})

const gananciaReal = totalFee + totalSomosMagma + totalDiferencia
const impuestosTotal = totalImpGan + totalIIBB

console.log(`\n=== RESUMEN MAYO 2026 ===`)
console.log(`Proyectos cargados:           ${mayo.length}`)
console.log(`Items "Somos Magma" en total: ${totalSMItems}`)
console.log(``)
console.log(`Fee Agencia (margen base):    $${fmt(totalFee)}`)
console.log(`Servicios "Somos Magma":      $${fmt(totalSomosMagma)}    ← ingreso interno (Dani, etc.)`)
console.log(`Diferencia (post-pago staff): $${fmt(totalDiferencia)}    ← ajuste vs presupuestado`)
console.log(`─────────────────────────────────`)
console.log(`>>> GANANCIA NETA Magma:      $${fmt(gananciaReal)}`)
console.log(``)
console.log(`Imp. Ganancias 35% s/Fee:     $${fmt(totalImpGan)}`)
console.log(`IIBB 4% s/Fee:                $${fmt(totalIIBB)}`)
console.log(`>>> Impuestos a pagar fisco:  $${fmt(impuestosTotal)}    ← cobrado al cliente, va al fisco`)
console.log(``)
console.log(`Adeudado a freelancers:       $${fmt(totalStaffAdeudado)}`)
console.log(`Ya pagado:                    $${fmt(totalStaffPagado)}`)
console.log(`Falta pagar staff:            $${fmt(totalStaffAdeudado - totalStaffPagado)}`)
