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
const proySheet = meta.data.sheets.find(s => s.properties.title === 'PROYECTOS').properties

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

// --- FIX 3: 1189 Gillette Fecha Presupuesto → blanco ---
// --- FIX 4: 1707/1708/1709 Honda + 1710/1711 Keller → 15/3/2026 ---
const presR = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PRESUPUESTOS!A:AV'})
const presuHeaders = presR.data.values[0]
const idxFP = presuHeaders.indexOf('Fecha Presupuesto')
const idxN = 0
console.log('Col Fecha Presupuesto:', colLetra(idxFP), 'idx:', idxFP)

const findFila = (num) => {
  for (let i=1;i<presR.data.values.length;i++) {
    if (String(presR.data.values[i][idxN]||'').trim() === String(num)) return i+1
  }
  return null
}

const targetsCorregir = [
  {n:'1189', fechaNueva:''},      // Gillette: blanco
  {n:'1707', fechaNueva:'15/3/2026'}, // Honda
  {n:'1708', fechaNueva:'15/3/2026'}, // Honda
  {n:'1709', fechaNueva:'15/3/2026'}, // Honda
  {n:'1710', fechaNueva:'15/3/2026'}, // Keller W
  {n:'1711', fechaNueva:'15/3/2026'}, // Keller W
]

const updates = []
for (const t of targetsCorregir) {
  const fila = findFila(t.n)
  if (!fila) { console.log(`⚠ N° ${t.n} no encontrado`); continue }
  const range = `PRESUPUESTOS!${colLetra(idxFP)}${fila}`
  updates.push({ range, values: [[t.fechaNueva]] })
  console.log(`  ✓ N° ${t.n} → fila ${fila} → Fecha Presupuesto = "${t.fechaNueva}"`)
}

if (updates.length > 0) {
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
  })
  console.log(`✓ ${updates.length} actualizaciones aplicadas en PRESUPUESTOS`)
}

// --- FIX 2: Borrar 5 proyectos 2025 de PROYECTOS ---
console.log(`\nBorrando 5 proyectos 2025 de PROYECTOS...`)
const proyR = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PROYECTOS!A:AQ'})
const proyHeaders = proyR.data.values[0]
const idxNProy = proyHeaders.indexOf('N° presupuesto')
const idxFEProy = proyHeaders.indexOf('Fecha Evento')

const aBorrar = []
for (let i=1;i<proyR.data.values.length;i++) {
  const row = proyR.data.values[i]
  const fE = row[idxFEProy]||''
  if (fE.includes('2025')) aBorrar.push({fila: i+1, n: row[idxNProy], fecha: fE, cliente: row[5]||row[4], proyecto: row[6]||''})
}
console.log(`Identificados: ${aBorrar.length}`)
aBorrar.forEach(p => console.log(`  fila ${p.fila} | N° ${p.n} | ${p.fecha} | ${p.cliente} | ${p.proyecto}`))

aBorrar.sort((a,b) => b.fila - a.fila)
const rangos = []
let i = 0
while (i < aBorrar.length) {
  let inicio = aBorrar[i].fila
  let fin = inicio
  while (i+1 < aBorrar.length && aBorrar[i+1].fila === fin - 1) {
    fin = aBorrar[i+1].fila
    i++
  }
  rangos.push({ start: fin, end: inicio })
  i++
}

const requests = rangos.map(r => ({
  deleteDimension: {
    range: {
      sheetId: proySheet.sheetId,
      dimension: 'ROWS',
      startIndex: r.start - 1,
      endIndex: r.end,
    }
  }
}))

if (requests.length > 0) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests }
  })
  console.log(`✓ ${aBorrar.length} proyectos eliminados de PROYECTOS (${requests.length} rangos)`)
}

const proyR2 = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PROYECTOS!A:A'})
console.log(`Quedaron ${proyR2.data.values.length - 1} filas en PROYECTOS`)

console.log(`\n===== LISTO =====`)
console.log(`PRESUPUESTOS: actualizadas 6 fechas (Gillette + 3 Honda + 2 Keller)`)
console.log(`PROYECTOS: eliminadas 5 filas 2025 (estaban en HISTORICO_2025)`)
