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

const r = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PRESUPUESTOS!A:AV'})
const headers = r.data.values[0]
const rows = r.data.values.slice(1).filter(row => row.some(c => c!==''))

const idxN = 0
const idxEstado = headers.indexOf('Estado')
const idxPM = headers.indexOf('PM Interno')
const idxAg = headers.indexOf('Agencia')
const idxCli = headers.indexOf('Cliente')
const idxProy = headers.indexOf('Proyecto')
const idxCont = headers.indexOf('Contacto')
const idxFE = headers.indexOf('Fecha Evento')
const idxFP = headers.indexOf('Fecha Presupuesto')

const presus = rows.map((row,i) => ({
  __fila: i+2,
  n: row[idxN],
  estado: row[idxEstado],
  pm: row[idxPM],
  agencia: row[idxAg],
  cliente: row[idxCli],
  proyecto: row[idxProy],
  contacto: row[idxCont],
  fechaEv: row[idxFE],
  fechaPres: row[idxFP],
}))

const incompletos = presus.filter(p => {
  return !p.pm || !p.cliente || !p.proyecto || !p.contacto || !p.fechaEv
})

console.log(`\n===== AUDIT DE PRESUPUESTOS INCOMPLETOS =====\n`)
console.log(`Total presupuestos en sheet: ${presus.length}`)
console.log(`Incompletos (falta PM / Cliente / Proyecto / Contacto / Fecha Evento): ${incompletos.length}`)

const conteoFalta = {pm:0, cliente:0, proyecto:0, contacto:0, fechaEv:0}
incompletos.forEach(p => {
  if (!p.pm) conteoFalta.pm++
  if (!p.cliente) conteoFalta.cliente++
  if (!p.proyecto) conteoFalta.proyecto++
  if (!p.contacto) conteoFalta.contacto++
  if (!p.fechaEv) conteoFalta.fechaEv++
})
console.log(`\nDesglose:`)
console.log(`  Sin PM Interno:     ${conteoFalta.pm}`)
console.log(`  Sin Cliente:        ${conteoFalta.cliente}`)
console.log(`  Sin Proyecto:       ${conteoFalta.proyecto}`)
console.log(`  Sin Contacto:       ${conteoFalta.contacto}`)
console.log(`  Sin Fecha Evento:   ${conteoFalta.fechaEv}`)

const porEstado = {}
incompletos.forEach(p => {
  const e = (p.estado||'(vacío)').trim()
  porEstado[e] = (porEstado[e]||0)+1
})
console.log(`\nPor estado:`)
Object.entries(porEstado).sort((a,b)=>b[1]-a[1]).forEach(([e,n]) => console.log(`  ${e}: ${n}`))

console.log(`\n--- Detalle de incompletos APROBADOS (los más críticos) ---`)
const aprobIncompletos = incompletos.filter(p => String(p.estado||'').trim().toUpperCase() === 'APROBADO')
console.log(`Aprobados con datos faltantes: ${aprobIncompletos.length}\n`)
aprobIncompletos.forEach(p => {
  const faltas = []
  if (!p.pm) faltas.push('PM')
  if (!p.cliente) faltas.push('Cliente')
  if (!p.proyecto) faltas.push('Proyecto')
  if (!p.contacto) faltas.push('Contacto')
  if (!p.fechaEv) faltas.push('Fecha Evento')
  console.log(`  fila ${p.__fila} | N° ${p.n} | ${p.cliente||p.agencia||'(s/cliente)'} | falta: ${faltas.join(', ')}`)
})

console.log(`\n--- Sample (10) de incompletos en otros estados ---`)
incompletos.filter(p => String(p.estado||'').trim().toUpperCase() !== 'APROBADO').slice(0,10).forEach(p => {
  const faltas = []
  if (!p.pm) faltas.push('PM')
  if (!p.cliente) faltas.push('Cliente')
  if (!p.proyecto) faltas.push('Proyecto')
  if (!p.contacto) faltas.push('Contacto')
  if (!p.fechaEv) faltas.push('Fecha Evento')
  console.log(`  fila ${p.__fila} | N° ${p.n} | ${p.estado} | ${p.cliente||p.agencia||'(s/cliente)'} | falta: ${faltas.join(', ')}`)
})
