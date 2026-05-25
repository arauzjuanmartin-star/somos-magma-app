// Análisis completo de mayo 2026: facturación, costos, ganancia, margen real
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

const [proyR, psR, facR] = await Promise.all([
  sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PROYECTOS!A:CZ'}),
  sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PAGOS_STAFF!A:L'}),
  sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'FACTURACION!A:AG'}),
])

const h = proyR.data.values[0]
const idxs = {
  nro: h.indexOf('N° presupuesto'),
  fe: h.indexOf('Fecha Evento'),
  cli: h.indexOf('Cliente'),
  ag: h.indexOf('Agencia'),
  proy: h.indexOf('Proyecto'),
  total: h.findIndex(x=>String(x||'').trim()==='Total'),
  fee: h.indexOf('Fee Agencia'),
  feeFinal: h.indexOf('Fee Final'),
  dif: h.indexOf('Diferencia'),
  impGan: h.indexOf('Imp. Ganancias'),
  iibb: h.indexOf('IIBB'),
  subtotal: h.indexOf('Subtotal'),
}
const staffCols = []; h.forEach((x,i)=>{ if(x==='Staff'||/^Staff \d+$/.test(String(x||'').trim())) staffCols.push(i) })

const mayo = proyR.data.values.slice(1).filter(r=>/\/5\/2026|\/05\/2026/.test(r[idxs.fe]||''))

// Pagos staff de mayo por proyecto
const psPorPresu = {}
psR.data.values.slice(1).forEach(r => {
  const nro=String(r[3]||'').trim()
  if (!nro) return
  if (!psPorPresu[nro]) psPorPresu[nro] = {adeudado:0, pagado:0, items:0}
  psPorPresu[nro].adeudado += parseMonto(r[6])
  psPorPresu[nro].pagado += parseMonto(r[7])
  psPorPresu[nro].items++
})

// Facturación de mayo (con sus propios headers)
const facHeaders = facR.data.values[0]
const fF=name=>facHeaders.indexOf(name)
const facMayo = facR.data.values.slice(1).filter(f => /\/5\/2026|\/05\/2026/.test(f[fF('Fecha Evento')]||''))
console.log(`Facturas con evento mayo 2026: ${facMayo.length}`)

// Análisis
let totalCliente=0, totalSubtotal=0, totalFee=0, totalSM=0, totalDif=0, totalImpGan=0, totalIIBB=0
let totalStaffAdeudado=0, totalStaffPagado=0
let cantSMItems=0

mayo.forEach(r => {
  totalCliente += parseMonto(r[idxs.total])
  totalSubtotal += parseMonto(r[idxs.subtotal])
  totalFee += parseMonto(r[idxs.fee])
  totalDif += parseMonto(r[idxs.dif])
  totalImpGan += parseMonto(r[idxs.impGan])
  totalIIBB += parseMonto(r[idxs.iibb])
  staffCols.forEach(c => {
    const staff = String(r[c]||'').trim()
    if (staff==='Somos Magma') {
      const precio = parseMonto(r[c-1])
      if (precio>0) { totalSM += precio; cantSMItems++ }
    }
  })
  const ps = psPorPresu[String(r[idxs.nro])]
  if (ps) { totalStaffAdeudado += ps.adeudado; totalStaffPagado += ps.pagado }
})

const facCobradaMayo = facMayo.filter(f => String(f[fF('Cobrado')]||'').toUpperCase() === 'TRUE').reduce((s,f)=>s+parseMonto(f[fF('Precio FINAL')]),0)
const facTotalMayo = facMayo.reduce((s,f)=>s+parseMonto(f[fF('Precio FINAL')]),0)
const facTotalSinIVA = facMayo.reduce((s,f)=>s+parseMonto(f[fF('Precio SIN IVA')]),0)

console.log(`\n=== ANÁLISIS COMPLETO MAYO 2026 ===\n`)

console.log(`📊 PROYECTOS (35 trabajos)`)
console.log(`   Total facturable al cliente:        $${fmt(totalCliente)}`)
console.log(`   ↳ Subtotal (servicios sin fee):     $${fmt(totalSubtotal)}`)
console.log(`   ↳ Fee Magma:                        $${fmt(totalFee)}`)
console.log(`   ↳ Imp. Ganancias (recargo):         $${fmt(totalImpGan)}`)
console.log(`   ↳ IIBB (recargo):                   $${fmt(totalIIBB)}`)
console.log(``)
console.log(`💰 GANANCIA REAL DE MAGMA`)
console.log(`   Fee Agencia:                        $${fmt(totalFee)}`)
console.log(`   + Servicios "Somos Magma" (${cantSMItems}):       $${fmt(totalSM)}`)
console.log(`   + Diferencia (ajustes pago staff):  $${fmt(totalDif)}`)
console.log(`   ──────────────────────────────────────`)
console.log(`   = GANANCIA NETA:                    $${fmt(totalFee+totalSM+totalDif)}`)
console.log(``)
console.log(`💸 IMPUESTOS (cobrados al cliente, van al fisco — net cero)`)
console.log(`   Imp. Ganancias 35% s/Fee:           $${fmt(totalImpGan)}`)
console.log(`   IIBB 4% s/Fee:                      $${fmt(totalIIBB)}`)
console.log(`   Total a depositar al fisco:         $${fmt(totalImpGan+totalIIBB)}`)
console.log(``)
console.log(`🔍 COSTOS REALES`)
console.log(`   Adeudado a freelancers:             $${fmt(totalStaffAdeudado)}`)
console.log(`   Ya pagado a freelancers:            $${fmt(totalStaffPagado)}`)
console.log(`   Falta pagar staff:                  $${fmt(totalStaffAdeudado-totalStaffPagado)}`)
console.log(``)
console.log(`📈 MÁRGEN`)
const gananciaNeta = totalFee+totalSM+totalDif
const margenSobreTotal = totalCliente>0 ? (gananciaNeta/totalCliente*100) : 0
const margenSobreSubt = totalSubtotal>0 ? (gananciaNeta/totalSubtotal*100) : 0
console.log(`   Margen sobre total cliente:         ${margenSobreTotal.toFixed(1)}%`)
console.log(`   Margen sobre subtotal (costo):      ${margenSobreSubt.toFixed(1)}%`)
console.log(``)
console.log(`🧾 FACTURACIÓN DEL MES (Mayo 2026)`)
console.log(`   Facturas emitidas con evento mayo:  ${facMayo.length}`)
console.log(`   Total facturado (con IVA):          $${fmt(facTotalMayo)}`)
console.log(`   Ya cobrado:                         $${fmt(facCobradaMayo)}`)
console.log(`   Falta cobrar:                       $${fmt(facTotalMayo-facCobradaMayo)}`)
console.log(``)
console.log(`🎯 VERIFICACIÓN`)
console.log(`   Total cliente proyectos:            $${fmt(totalCliente)}     ← lo que se factura sin IVA`)
console.log(`   Subtotal + Fee + Imp + IIBB:        $${fmt(totalSubtotal+totalFee+totalImpGan+totalIIBB)}`)
console.log(`   ¿Cuadran? ${Math.abs((totalCliente)-(totalSubtotal+totalFee+totalImpGan+totalIIBB))<100 ? '✓ SÍ' : '⚠ HAY DIFERENCIA: $'+fmt(totalCliente-(totalSubtotal+totalFee+totalImpGan+totalIIBB))}`)
