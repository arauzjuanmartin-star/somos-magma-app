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

const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' })
const existe = meta.data.sheets.find(s => s.properties.title === 'AGENCIAS')

if (!existe) {
  console.log('Creando solapa AGENCIAS...')
  const r = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: 'AGENCIAS', gridProperties: { rowCount: 500, columnCount: 12 } } } }] }
  })
  console.log('✓ Solapa creada, sheetId:', r.data.replies[0].addSheet.properties.sheetId)
} else {
  console.log('Solapa AGENCIAS ya existe')
}

// Headers
const HEADERS = ['Nombre','CUIT','Condicion IVA','Mail facturacion','Telefono','PM default','Direccion fiscal','Tipo','Notas','Activa','Creada','Modificada']
await sheets.spreadsheets.values.update({
  spreadsheetId: SHEET_ID,
  range: 'AGENCIAS!A1:L1',
  valueInputOption: 'USER_ENTERED',
  requestBody: { values: [HEADERS] }
})
console.log('✓ Headers escritos:', HEADERS.join(' | '))

// Leer agencias únicas desde PRESUPUESTOS
const pres = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PRESUPUESTOS!A:K'})
const headers = pres.data.values[0]
const idxAg = headers.indexOf('Agencia')
const idxCli = headers.indexOf('Cliente')
const idxPM = headers.indexOf('PM Interno')

const agencias = {}
pres.data.values.slice(1).forEach(row => {
  const ag = String(row[idxAg]||'').trim()
  const cli = String(row[idxCli]||'').trim()
  const pm = String(row[idxPM]||'').trim()
  // Si tiene agencia, esa es la entidad facturable
  if (ag && ag.toLowerCase() !== 'sin agencia / directo') {
    if (!agencias[ag]) agencias[ag] = { nombre: ag, pms: {}, cant: 0 }
    agencias[ag].cant++
    if (pm) agencias[ag].pms[pm] = (agencias[ag].pms[pm]||0)+1
  }
  // Si no tiene agencia (directo), el cliente es la entidad facturable
  else if (cli && !ag) {
    if (!agencias[cli]) agencias[cli] = { nombre: cli, pms: {}, cant: 0 }
    agencias[cli].cant++
    if (pm) agencias[cli].pms[pm] = (agencias[cli].pms[pm]||0)+1
  }
})

const filas = Object.values(agencias)
  .sort((a,b) => b.cant - a.cant)
  .map(a => {
    const pmDefault = Object.entries(a.pms).sort((x,y)=>y[1]-x[1])[0]?.[0] || ''
    return [a.nombre, '', '', '', '', pmDefault, '', '', `${a.cant} presus históricos`, 'SI', new Date().toLocaleDateString('es-AR'), '']
  })

console.log(`\nPre-poblando ${filas.length} agencias únicas desde PRESUPUESTOS...`)

// Limpiar filas existentes (excepto header)
await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: 'AGENCIAS!A2:L500' })

if (filas.length > 0) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'AGENCIAS!A:L',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: filas }
  })
  console.log(`✓ ${filas.length} agencias cargadas`)
}

console.log('\nTop 10 agencias por cantidad de presupuestos:')
Object.values(agencias).sort((a,b)=>b.cant-a.cant).slice(0,10).forEach(a => {
  const pmDef = Object.entries(a.pms).sort((x,y)=>y[1]-x[1])[0]?.[0] || '—'
  console.log(`  ${a.nombre.padEnd(30)} | ${a.cant} presus | PM más usado: ${pmDef}`)
})
