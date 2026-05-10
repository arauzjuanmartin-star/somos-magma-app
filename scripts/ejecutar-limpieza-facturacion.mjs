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

const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties)' })
const facSheet = meta.data.sheets.find(s => s.properties.title === 'FACTURACION').properties

const facR = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'FACTURACION!A:AG'})
const headers = facR.data.values[0]
const allRows = facR.data.values.slice(1)

const idxFE = headers.indexOf('Fecha Evento')
const idxCli = headers.indexOf('Cliente')
const idxAg = headers.indexOf('Agencia')

const parseFecha = s => { const m = String(s||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if(!m)return null; const y=Number(m[3])<100?2000+Number(m[3]):Number(m[3]); return new Date(y,Number(m[2])-1,Number(m[1])) }

const filasABorrar = []
allRows.forEach((row, i) => {
  const filaSheet = i + 2
  const fE = parseFecha(row[idxFE])
  if (!fE || fE.getFullYear() !== 2025) return
  const cli = String(row[idxCli]||'').toLowerCase()
  const ag = String(row[idxAg]||'').toLowerCase()
  const esUnilever = cli.includes('unilever') || ag.includes('unilever') || ag.includes('oir')
  if (!esUnilever) filasABorrar.push(filaSheet)
})

console.log(`Filas a eliminar: ${filasABorrar.length}`)

filasABorrar.sort((a,b) => b - a)

const rangos = []
let i = 0
while (i < filasABorrar.length) {
  let inicio = filasABorrar[i]
  let fin = inicio
  while (i+1 < filasABorrar.length && filasABorrar[i+1] === fin - 1) {
    fin = filasABorrar[i+1]
    i++
  }
  rangos.push({ start: fin, end: inicio })
  i++
}
console.log(`Optimizado a ${rangos.length} rangos`)

const requests = rangos.map(r => ({
  deleteDimension: {
    range: {
      sheetId: facSheet.sheetId,
      dimension: 'ROWS',
      startIndex: r.start - 1,
      endIndex: r.end,
    }
  }
}))

console.log(`Ejecutando ${requests.length} deletes en FACTURACION...`)
await sheets.spreadsheets.batchUpdate({
  spreadsheetId: SHEET_ID,
  requestBody: { requests }
})
console.log(`✓ FACTURACION limpiado`)

const facR2 = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'FACTURACION!A:A'})
console.log(`Quedaron ${facR2.data.values.length - 1} filas en FACTURACION`)
