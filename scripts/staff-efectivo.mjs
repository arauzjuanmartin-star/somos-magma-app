// Marcar qué pagos de un mes van en efectivo.
//
// No es una propiedad de la persona: es una decisión de cada mes. Juan la toma según
// cómo viene el mes, y el contador le pidió que no le entren tantas facturas C — así
// que quién cobra en efectivo cambia de un mes al otro.
//
// Por eso vive en Pagos_Staff (columna Cuenta = "Efectivo", que ya se usa así en 41
// pagos) y no en una columna de RRHH. Lo que se marca acá:
//   · el aviso del 10 no le llega a esa persona — no tiene que facturar
//   · su ficha dice que ese mes se le paga en efectivo
//   · no aparece como "falta su factura" en el tablero del 15
//
//   node scripts/staff-efectivo.mjs --mes 08                        → quién está marcado hoy
//   node scripts/staff-efectivo.mjs --mes 08 "Santino" "Lucho"      → preview de marcarlos
//   node scripts/staff-efectivo.mjs --mes 08 "Santino" --escribir
//   node scripts/staff-efectivo.mjs --mes 08 "Santino" --sacar --escribir

import { google } from 'googleapis'
import { readFileSync } from 'fs'

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

const args = process.argv.slice(2)
const ESCRIBIR = args.includes('--escribir')
const SACAR    = args.includes('--sacar')
const MES = (() => {
  const i = args.indexOf('--mes')
  if (i >= 0) return String(args[i+1]||'').padStart(2,'0')
  const d = new Date(); d.setMonth(d.getMonth()-1)
  return String(d.getMonth()+1).padStart(2,'0')
})()
const QUIENES = args.filter((a,i) => !a.startsWith('--') && args[i-1] !== '--mes')

const numUS = v => { const n = parseFloat(String(v||'').replace(/[$\s,]/g,'')); return isNaN(n)?0:n }
const plata = n => '$' + Math.round(n).toLocaleString('es-AR')
const norm  = s => String(s||'').trim().toLowerCase()
const col   = i => { let s=''; i++; while(i>0){ const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26) } return s }

const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range:'Pagos_Staff!A:N' })
const pv = r.data.values, hP = pv[0]
const cCuenta = hP.indexOf('Cuenta')

const delMes = pv.slice(1)
  .map((row,i) => ({ fila:i+2, ...Object.fromEntries(hP.map((k,j)=>[k, row[j]??''])) }))
  .filter(x => /pendiente/i.test(String(x.Estado||''))
    && String(x['Mes Referencia']||'').trim().startsWith(MES)
    && numUS(x['Monto Adeudado']) > 0)

const MESES = { '01':'enero','02':'febrero','03':'marzo','04':'abril','05':'mayo','06':'junio',
                '07':'julio','08':'agosto','09':'septiembre','10':'octubre','11':'noviembre','12':'diciembre' }

// Por persona: cuánto se le debe y cuántas de sus líneas están en efectivo.
const P = {}
delMes.forEach(x => {
  const n = String(x.Freelancer||'').trim(); if (!n) return
  P[n] = P[n] || { debe:0, filas:[], efectivo:0 }
  P[n].debe += numUS(x['Monto Adeudado']); P[n].filas.push(x)
  if (/efectivo/i.test(String(x.Cuenta||''))) P[n].efectivo++
})

console.log(`════════ PAGOS DE ${(MESES[MES]||MES).toUpperCase()} ════════\n`)
const orden = Object.entries(P).sort((a,b) => b[1].debe - a[1].debe)
orden.forEach(([n,d]) => {
  const estado = d.efectivo === d.filas.length ? '💵 efectivo'
    : d.efectivo ? `⚠️  mezclado (${d.efectivo} de ${d.filas.length} en efectivo)`
    : '   factura'
  console.log(`   ${n.slice(0,26).padEnd(26)} ${plata(d.debe).padStart(12)}  ${String(d.filas.length).padStart(2)} trabajos   ${estado}`)
})
const enEf = orden.filter(([,d]) => d.efectivo === d.filas.length)
console.log(`\n   ${enEf.length} en efectivo (${plata(enEf.reduce((a,[,d])=>a+d.debe,0))}) · ${orden.length-enEf.length} con factura`)

if (!QUIENES.length) {
  console.log('\nPara marcar a alguien:  node scripts/staff-efectivo.mjs --mes ' + MES + ' "Nombre" --escribir')
  process.exit(0)
}

const objetivo = orden.filter(([n]) => QUIENES.some(q => norm(n).includes(norm(q))))
if (!objetivo.length) { console.log(`\nNinguno de [${QUIENES.join(', ')}] tiene pendientes de ${MESES[MES]||MES}.`); process.exit(1) }

console.log(`\n${SACAR ? 'SE SACA de efectivo' : 'SE MARCA como efectivo'} — ${objetivo.length} personas:\n`)
const updates = []
objetivo.forEach(([n,d]) => {
  console.log(`   ${n}  ${plata(d.debe)}`)
  d.filas.forEach(x => {
    const actual = String(x.Cuenta||'').trim()
    const nuevo = SACAR ? (/efectivo/i.test(actual) ? '' : actual) : 'Efectivo'
    if (nuevo === actual) return
    console.log(`      f${String(x.fila).padStart(4)} ${String(x.Proyecto).slice(0,32).padEnd(32)} ${plata(numUS(x['Monto Adeudado'])).padStart(11)}   ${actual||'(vacío)'} → ${nuevo||'(vacío)'}`)
    updates.push({ range:`Pagos_Staff!${col(cCuenta)}${x.fila}`, values:[[nuevo]] })
  })
})

if (!updates.length) { console.log('\nNo hay nada que cambiar.'); process.exit(0) }
if (!ESCRIBIR) { console.log(`\n👀 PREVIEW — se cambiarían ${updates.length} filas. Corré con --escribir.`); process.exit(0) }

await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId: SHEET_ID, requestBody:{ valueInputOption:'USER_ENTERED', data: updates },
})
console.log(`\n✅ ${updates.length} filas actualizadas.`)
