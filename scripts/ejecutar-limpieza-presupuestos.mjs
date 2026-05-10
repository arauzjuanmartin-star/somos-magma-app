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
const presuSheet = meta.data.sheets.find(s => s.properties.title === 'PRESUPUESTOS').properties
const facSheet = meta.data.sheets.find(s => s.properties.title === 'FACTURACION').properties

const presR = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PRESUPUESTOS!A:AV'})
const headers = presR.data.values[0]
const allRows = presR.data.values.slice(1)

const parseFecha = s => { const m = String(s||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if(!m)return null; const y=Number(m[3])<100?2000+Number(m[3]):Number(m[3]); return new Date(y,Number(m[2])-1,Number(m[1])) }

const idxFE = headers.indexOf('Fecha Evento')
const idxFP = headers.indexOf('Fecha Presupuesto')
const idxN = 0

const huerfanosBorrar = ['1713','1745','1845','1823']
const filasABorrar = []

allRows.forEach((row, i) => {
  const filaSheet = i + 2
  const fE = parseFecha(row[idxFE])
  const fP = parseFecha(row[idxFP])
  const nro = String(row[idxN]||'').trim()
  const es2025 = (fE && fE.getFullYear() === 2025) || (!fE && fP && fP.getFullYear() === 2025)
  const esDuplicado = huerfanosBorrar.includes(nro)
  if (es2025 || esDuplicado) filasABorrar.push({ fila: filaSheet, nro, motivo: es2025 ? '2025' : 'duplicado' })
})

console.log(`Filas a eliminar de PRESUPUESTOS: ${filasABorrar.length}`)
console.log(`  Por ser 2025: ${filasABorrar.filter(f=>f.motivo==='2025').length}`)
console.log(`  Duplicados: ${filasABorrar.filter(f=>f.motivo==='duplicado').length}`)

// Ordenar de mayor a menor para que los borrados no desplacen índices
filasABorrar.sort((a,b) => b.fila - a.fila)

// Agrupar en rangos contiguos para optimizar requests
const rangos = []
let i = 0
while (i < filasABorrar.length) {
  let inicio = filasABorrar[i].fila
  let fin = inicio
  while (i+1 < filasABorrar.length && filasABorrar[i+1].fila === fin - 1) {
    fin = filasABorrar[i+1].fila
    i++
  }
  rangos.push({ start: fin, end: inicio })
  i++
}
console.log(`Optimizado a ${rangos.length} rangos contiguos`)

const requests = rangos.map(r => ({
  deleteDimension: {
    range: {
      sheetId: presuSheet.sheetId,
      dimension: 'ROWS',
      startIndex: r.start - 1,
      endIndex: r.end,
    }
  }
}))

console.log(`\nEjecutando ${requests.length} deletes en PRESUPUESTOS...`)
await sheets.spreadsheets.batchUpdate({
  spreadsheetId: SHEET_ID,
  requestBody: { requests }
})
console.log('✓ PRESUPUESTOS limpiado')

console.log(`\nActualizando FACTURACION fila 155 N° 1823 → 1825...`)
const facR = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'FACTURACION!A1:Z200'})
const facHeaders = facR.data.values[0]
const idxNFac = facHeaders.indexOf('N° Presupuesto')
const fila155 = facR.data.values[154] // index 154 = fila 155
console.log(`Antes: fila 155 col N° pres = "${fila155?.[idxNFac]}", proyecto = "${fila155?.[facHeaders.indexOf('Proyecto')]}"`)

if (String(fila155?.[idxNFac]||'').trim() !== '1823') {
  console.log(`⚠ La fila 155 ya no tiene N° 1823 (después del delete tal vez se desplazó). Buscando...`)
}

// Re-leer FACTURACION después y buscar N° 1823 con proyecto Evento Cerrito 21/4
const fac2 = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'FACTURACION!A:AG'})
const facHeaders2 = fac2.data.values[0]
const idxNFac2 = facHeaders2.indexOf('N° Presupuesto')
const idxProy = facHeaders2.indexOf('Proyecto')
const filaTarget = fac2.data.values.findIndex((row,i) => i>0 && String(row[idxNFac2]||'').trim() === '1823' && /Cerrito 21\/4/i.test(String(row[idxProy]||'')))
if (filaTarget === -1) {
  console.log('⚠ NO encontré la fila con N° 1823 + Evento Cerrito 21/4. Skipping.')
} else {
  const filaSheet = filaTarget + 1
  const colLetra = (c) => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
  const cellRef = `${colLetra(idxNFac2)}${filaSheet}`
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `FACTURACION!${cellRef}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['1825']] }
  })
  console.log(`✓ FACTURACION ${cellRef} actualizado: 1823 → 1825`)
}

console.log(`\n===== LISTO =====`)
console.log(`PRESUPUESTOS: ${allRows.length - filasABorrar.length} filas restantes (todas 2026)`)
