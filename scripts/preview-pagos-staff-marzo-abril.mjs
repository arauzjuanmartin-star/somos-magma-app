import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
    const i=l.indexOf('='); let v=l.slice(i+1).trim()
    if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1)
    return [l.slice(0,i).trim(),v]
  })
)
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth = new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets = google.sheets({version:'v4',auth})

const r = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PAGOS_STAFF!A:L'})
const headers = r.data.values[0]
console.log('Headers PAGOS_STAFF:', headers.join(' | '))
const rows = r.data.values.slice(1).map((row,i) => ({
  fila: i+2,
  fechaPago: row[0]||'',
  freelancer: row[1]||'',
  mesRef: row[2]||'',
  nro: row[3]||'',
  proyecto: row[4]||'',
  servicio: row[5]||'',
  adeudado: row[6]||'',
  pagado: row[7]||'',
  tipo: row[8]||'',
  cuenta: row[9]||'',
  estado: row[10]||'',
  notas: row[11]||'',
}))

const parseMonto = v => { const s=String(v||'').replace(/[\s$]/g,''); if(s.includes(',')&&s.includes('.'))return s.lastIndexOf(',')>s.lastIndexOf('.')?Number(s.replace(/\./g,'').replace(',','.'))||0:Number(s.replace(/,/g,''))||0; if(s.includes(','))return Number(s.replace(',','.'))||0; return Number(s)||0 }

const esJuanSofi = name => /^(juan|juan martin|juan martín|sofi|sofia|sofía)/i.test(String(name||'').trim())
const yaPagado = r => {
  const ad=parseMonto(r.adeudado), pa=parseMonto(r.pagado)
  return pa>0 && pa >= ad*0.95 // 95% por margen de redondeo
}

// Resumen por mes
const porMes = {}
rows.forEach(r => {
  const k = r.mesRef || '(sin mes)'
  if (!porMes[k]) porMes[k] = {total:0, pagado:0, pendiente:0, total$adeudado:0, total$pagado:0, items:[]}
  porMes[k].total++
  porMes[k].total$adeudado += parseMonto(r.adeudado)
  porMes[k].total$pagado += parseMonto(r.pagado)
  if (yaPagado(r)) porMes[k].pagado++
  else porMes[k].pendiente++
  porMes[k].items.push(r)
})

console.log('\n===== RESUMEN POR MES =====')
Object.entries(porMes).sort().forEach(([k,v]) => {
  const pct = v.total>0 ? Math.round(v.pagado/v.total*100) : 0
  console.log(`  ${k.padEnd(20)} | ${v.pagado}/${v.total} pagados (${pct}%) | adeudado total $${v.total$adeudado.toLocaleString('es-AR')}`)
})

// === ACCIÓN: marcar como pagado ABRIL salvo Juan/Sofi ===
console.log('\n===== A APLICAR: ABRIL pagado (salvo Juan/Sofi) =====')
const abrilTarget = rows.filter(r => /abril/i.test(r.mesRef) && !yaPagado(r) && !esJuanSofi(r.freelancer))
console.log(`Filas a marcar como PAGADO: ${abrilTarget.length}`)
let totalAbril = 0
abrilTarget.forEach(r => totalAbril += parseMonto(r.adeudado))
console.log(`Monto total: $${totalAbril.toLocaleString('es-AR')}`)
abrilTarget.slice(0,20).forEach(r => console.log(`  fila ${r.fila} | ${r.freelancer.padEnd(25)} | #${r.nro} | ${r.proyecto?.slice(0,30).padEnd(30)} | $${parseMonto(r.adeudado).toLocaleString('es-AR')}`))
if (abrilTarget.length>20) console.log(`  ... y ${abrilTarget.length-20} más`)

// Verificar Juan/Sofi de marzo y abril que queden pendientes
console.log('\n===== JUAN/SOFI MARZO+ABRIL (deben quedar PENDIENTES) =====')
const juanSofiPendientes = rows.filter(r => esJuanSofi(r.freelancer) && /marzo|abril/i.test(r.mesRef) && !yaPagado(r))
console.log(`Pendientes: ${juanSofiPendientes.length}`)
let totalJSPend = 0
juanSofiPendientes.forEach(r => { totalJSPend += parseMonto(r.adeudado); console.log(`  fila ${r.fila} | ${r.freelancer.padEnd(15)} | ${r.mesRef.padEnd(15)} | #${r.nro} | ${r.proyecto?.slice(0,30).padEnd(30)} | $${parseMonto(r.adeudado).toLocaleString('es-AR')}`) })
console.log(`Total pendiente Juan/Sofi: $${totalJSPend.toLocaleString('es-AR')}`)

// === MAYO: todos pendientes ===
console.log('\n===== MAYO (no se toca, todos pendientes) =====')
const mayoPendiente = rows.filter(r => /mayo/i.test(r.mesRef) && !yaPagado(r))
let totalMayo = 0
mayoPendiente.forEach(r => totalMayo += parseMonto(r.adeudado))
console.log(`Pendientes mayo: ${mayoPendiente.length} | Total $${totalMayo.toLocaleString('es-AR')}`)
const porFreelancerMayo = {}
mayoPendiente.forEach(r => {
  if (!porFreelancerMayo[r.freelancer]) porFreelancerMayo[r.freelancer] = {cant:0, monto:0}
  porFreelancerMayo[r.freelancer].cant++
  porFreelancerMayo[r.freelancer].monto += parseMonto(r.adeudado)
})
console.log('Por freelancer:')
Object.entries(porFreelancerMayo).sort((a,b)=>b[1].monto-a[1].monto).forEach(([f,v]) => {
  console.log(`  ${f.padEnd(28)} | ${v.cant} pagos | $${v.monto.toLocaleString('es-AR')}`)
})

console.log('\n💡 Para aplicar el update de Abril (todos pagados salvo Juan/Sofi):')
console.log('   node scripts/marcar-abril-pagado.mjs --ejecutar')
