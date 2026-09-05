/**
 * VOLUMEN POR CUENTA BANCARIA 2026 — para dimensionar los costos bancarios que faltan cargar
 * (punto 2 de la Práctica 3 de Mariana: solo está desglosado BBVA, faltan Galicia y Santander).
 *
 * Mide, por cuenta:
 *   · CRÉDITOS  = lo que entró (FACTURACION, filas con fecha de cobro)
 *   · DÉBITOS   = lo que salió (Pagos_Staff + GASTOS_FIJOS pagados)
 *   · Comisión bancaria ya registrada en FACTURACION
 * Y estima el impuesto ley 25.413 (0,6% al débito + 0,6% al crédito).
 * Solo lectura.
 */
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
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

// el sheet guarda los montos en formato US ($764,800.00) — ver memoria project_sheet_formato_montos_us
const P = v => { if(!v) return 0; const n=parseFloat(String(v).replace(/[$,\s]/g,'')); return isNaN(n)?0:n }
const M = n => '$'+Math.round(n).toLocaleString('es-AR')
const anio = f => { const m=String(f||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m?+m[3]:null }
const mes  = f => { const m=String(f||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m?+m[2]:null }

const get = async r => (await sheets.spreadsheets.values.get({spreadsheetId:ID, range:r})).data.values||[]
const tabla = rows => { const h=rows[0]||[]; return rows.slice(1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]]))) }

const fac = tabla(await get('FACTURACION!A1:BZ2000'))
const pag = tabla(await get('Pagos_Staff!A1:BZ5000'))
const gf  = tabla(await get('GASTOS_FIJOS!A1:Z200'))

const norm = c => {
  const s=String(c||'').trim()
  if(!s) return '(sin cuenta)'
  if(/bbva/i.test(s)) return 'BBVA Somos Magma'
  if(/galicia/i.test(s)) return 'Galicia Sofi'
  if(/santander.*luc|santander.*lulu/i.test(s)) return 'Santander Lucia'
  if(/santander/i.test(s)) return 'Santander (otra)'
  if(/efectivo/i.test(s)) return 'Efectivo'
  if(/mercado|mp\b/i.test(s)) return 'MercadoPago'
  return s
}

const cta = {}
const add = (c,k,v) => { const n=norm(c); (cta[n]=cta[n]||{cred:0,deb:0,com:0,nC:0,nD:0})[k]+=v }

// ── CRÉDITOS: lo cobrado en 2026 (FACTURACION con fecha de cobro)
let credTotal=0
for (const f of fac) {
  const fc = f['Fecha cobro']
  if (!fc || anio(fc)!==2026) continue
  const monto = P(f['Monto cobrado']) || P(f['Total']) || P(f['Monto'])
  if (!monto) continue
  add(f['Cuenta destino'],'cred',monto); add(f['Cuenta destino'],'nC',1)
  add(f['Cuenta destino'],'com',P(f['Comision banco']))
  credTotal+=monto
}

// ── DÉBITOS: pagos a staff 2026
let debTotal=0
for (const p of pag) {
  const fp = p['Fecha pago'] || p['Fecha']
  if (!fp || anio(fp)!==2026) continue
  const monto = P(p['Monto pagado']) || P(p['Monto'])
  if (!monto) continue
  add(p['Cuenta'],'deb',monto); add(p['Cuenta'],'nD',1)
  debTotal+=monto
}
// ── DÉBITOS: gastos fijos pagados (mensuales × meses pagados + únicos)
for (const g of gf) {
  if (String(g['Pagado']||'').toUpperCase()!=='SI') continue
  const monto = P(g['Monto pagado']) || P(g['Monto'])
  const meses = String(g['Meses pagados']||'').split(',').filter(x=>x.trim()).length || 1
  const total = /mensual/i.test(g['Frecuencia']||'') ? monto*meses : monto
  if(!total) continue
  add(g['Cuenta pago'],'deb',total); add(g['Cuenta pago'],'nD',1)
  debTotal+=total
}

console.log(`\n${'█'.repeat(84)}`)
console.log(`  VOLUMEN 2026 POR CUENTA BANCARIA — cuánto pasa por cada banco`)
console.log(`${'█'.repeat(84)}\n`)
console.log(`  ${'cuenta'.padEnd(22)}${'entró (créditos)'.padStart(19)}${'salió (débitos)'.padStart(18)}${'movido'.padStart(18)}`)
console.log(`  ${'─'.repeat(76)}`)
const filas = Object.entries(cta).sort((a,b)=>(b[1].cred+b[1].deb)-(a[1].cred+a[1].deb))
let mov=0
for (const [c,v] of filas) {
  const t=v.cred+v.deb; mov+=t
  console.log(`  ${c.padEnd(22)}${M(v.cred).padStart(19)}${M(v.deb).padStart(18)}${M(t).padStart(18)}`)
}
console.log(`  ${'─'.repeat(76)}`)
console.log(`  ${'TOTAL'.padEnd(22)}${M(credTotal).padStart(19)}${M(debTotal).padStart(18)}${M(mov).padStart(18)}`)

// ── estimación del impuesto al cheque por cuenta (0,6% crédito + 0,6% débito)
console.log(`\n${'━'.repeat(84)}`)
console.log(`  ESTIMACIÓN impuesto ley 25.413 (0,6% al crédito + 0,6% al débito) — 2026 completo`)
console.log(`${'━'.repeat(84)}\n`)
const MESES = 8 // ene–ago 2026
console.log(`  ${'cuenta'.padEnd(22)}${'impuesto est.'.padStart(17)}${'por mes'.padStart(15)}${'comisión reg.'.padStart(17)}`)
console.log(`  ${'─'.repeat(76)}`)
let impTot=0
for (const [c,v] of filas) {
  const imp=(v.cred+v.deb)*0.006
  impTot+=imp
  console.log(`  ${c.padEnd(22)}${M(imp).padStart(17)}${M(imp/MESES).padStart(15)}${(v.com?M(v.com):'—').padStart(17)}`)
}
console.log(`  ${'─'.repeat(76)}`)
console.log(`  ${'TOTAL'.padEnd(22)}${M(impTot).padStart(17)}${M(impTot/MESES).padStart(15)}`)

const bbva = cta['BBVA Somos Magma']||{cred:0,deb:0}
const otras = filas.filter(([c])=>/Galicia|Santander/i.test(c)).reduce((a,[,v])=>a+v.cred+v.deb,0)
const pctOtras = mov? otras/(bbva.cred+bbva.deb+otras)*100 : 0
console.log(`\n  BBVA mueve ${M(bbva.cred+bbva.deb)} · Galicia+Santander mueven ${M(otras)}`)
console.log(`  → Galicia+Santander son el ${Math.round(pctOtras)}% del volumen bancario, y hoy tienen $0 de costo cargado.`)
console.log(`  Cargado hoy en GASTOS_FIJOS: $17.739/mes comisiones BBVA + $507.000/mes ley 25.413 BBVA.`)
