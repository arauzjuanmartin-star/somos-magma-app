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

const facR = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'FACTURACION!A:AG'})
const headers = facR.data.values[0]
const allRows = facR.data.values.slice(1)
console.log('Headers FACTURACION:', headers.join(' | '))

const idxFE = headers.indexOf('Fecha Evento')
const idxCli = headers.indexOf('Cliente')
const idxAg = headers.indexOf('Agencia')
const idxProy = headers.indexOf('Proyecto')
const idxN = headers.indexOf('N° Presupuesto')
const idxFC = headers.indexOf('Fecha cobro')
const idxCob = headers.indexOf('Cobrado')
const idxPF = headers.indexOf('Precio FINAL')

const parseFecha = s => { const m = String(s||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if(!m)return null; const y=Number(m[3])<100?2000+Number(m[3]):Number(m[3]); return new Date(y,Number(m[2])-1,Number(m[1])) }

const filas2025 = []
const filas2025Mantener = []

allRows.forEach((row, i) => {
  const filaSheet = i + 2
  const fE = parseFecha(row[idxFE])
  if (!fE || fE.getFullYear() !== 2025) return
  const cli = String(row[idxCli]||'').toLowerCase()
  const ag = String(row[idxAg]||'').toLowerCase()
  const esUnilever = cli.includes('unilever') || ag.includes('unilever') || ag.includes('oir')
  const obj = {
    fila: filaSheet,
    nro: row[idxN],
    cliente: row[idxCli],
    agencia: row[idxAg],
    proyecto: row[idxProy],
    fechaEv: row[idxFE],
    fechaCob: row[idxFC],
    cobrado: row[idxCob],
    monto: row[idxPF],
  }
  if (esUnilever) filas2025Mantener.push(obj)
  else filas2025.push(obj)
})

console.log(`\n===== FACTURACION 2025 — PREVIEW =====\n`)
console.log(`Total filas con evento 2025: ${filas2025.length + filas2025Mantener.length}\n`)

console.log(`✓ MANTENER (Unilever / Oir): ${filas2025Mantener.length}`)
filas2025Mantener.forEach(f => console.log(`  fila ${f.fila} | N° ${f.nro} | ${f.cliente} | ag: ${f.agencia} | ${f.proyecto} | ${f.fechaEv} | $${f.monto} | cobrado: ${f.cobrado}`))

console.log(`\n✗ A ELIMINAR: ${filas2025.length}`)
const porEstadoCobro = { cobradas: 0, sinCobrar: 0 }
filas2025.forEach(f => {
  if (String(f.cobrado||'').toUpperCase()==='TRUE') porEstadoCobro.cobradas++
  else porEstadoCobro.sinCobrar++
})
console.log(`  Ya cobradas: ${porEstadoCobro.cobradas}`)
console.log(`  Sin cobrar: ${porEstadoCobro.sinCobrar}`)

console.log(`\nDetalle (primeras 10 y últimas 10):`)
const show = [...filas2025.slice(0,10), {sep:true}, ...filas2025.slice(-10)]
show.forEach(f => {
  if (f.sep) return console.log('  ...')
  console.log(`  fila ${f.fila} | N° ${f.nro} | ${f.cliente} | ${f.proyecto} | ${f.fechaEv} | $${f.monto} | cobrado: ${f.cobrado}`)
})

const sinCobrarLista = filas2025.filter(f => String(f.cobrado||'').toUpperCase()!=='TRUE')
if (sinCobrarLista.length > 0) {
  console.log(`\n⚠ SIN COBRAR DE 2025 que se borrarían (revisá si alguna está pendiente):`)
  sinCobrarLista.forEach(f => console.log(`  fila ${f.fila} | N° ${f.nro} | ${f.cliente} | ${f.proyecto} | ${f.fechaEv} | $${f.monto}`))
}

console.log(`\n===== RESUMEN =====`)
console.log(`Quedarían en FACTURACION: ${allRows.length - filas2025.length} filas`)
console.log(`(de las cuales ${filas2025Mantener.length} son del 2025 — Unilever/Oir)`)
