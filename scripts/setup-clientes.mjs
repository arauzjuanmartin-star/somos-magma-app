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
const existe = meta.data.sheets.find(s => s.properties.title === 'CLIENTES')

if (!existe) {
  console.log('Creando solapa CLIENTES...')
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: 'CLIENTES', gridProperties: { rowCount: 500, columnCount: 10 } } } }] }
  })
  console.log('✓ Solapa creada')
} else {
  console.log('Solapa CLIENTES ya existe')
}

const HEADERS = ['Nombre','Agencia habitual','Industria','Notas','Activo','Primera vez','Ultima vez','Cant. presus historicos','Creada','Modificada']
await sheets.spreadsheets.values.update({
  spreadsheetId: SHEET_ID,
  range: 'CLIENTES!A1:J1',
  valueInputOption: 'USER_ENTERED',
  requestBody: { values: [HEADERS] }
})
console.log('✓ Headers escritos:', HEADERS.join(' | '))

// Recolectar clientes de TODOS los sheets (presupuestos + facturacion + historicos)
const ranges = [
  { name: 'PRESUPUESTOS', range: 'PRESUPUESTOS!A:K', colCli: 5, colAg: 4, colFecha: 9 },
  { name: 'FACTURACION', range: 'FACTURACION!A:J', colCli: 8, colAg: 7, colFecha: 6 },
  { name: 'HISTORICO_2023', range: 'HISTORICO_2023!A:G', colCli: 4, colAg: 5, colFecha: 2 },
  { name: 'HISTORICO_2024', range: 'HISTORICO_2024!A:G', colCli: 4, colAg: 5, colFecha: 2 },
  { name: 'HISTORICO_2025', range: 'HISTORICO_2025!A:G', colCli: 4, colAg: 5, colFecha: 2 },
]

const parseFecha = s => { const m = String(s||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if(!m)return null; const y=Number(m[3])<100?2000+Number(m[3]):Number(m[3]); return new Date(y,Number(m[2])-1,Number(m[1])) }

const clientes = {}
for (const r of ranges) {
  try {
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: r.range })
    const rows = (resp.data.values||[]).slice(1)
    rows.forEach(row => {
      const cli = String(row[r.colCli]||'').trim()
      const ag = String(row[r.colAg]||'').trim()
      const fecha = parseFecha(row[r.colFecha])
      if (!cli || cli.toLowerCase() === '(sin cliente)') return
      if (!clientes[cli]) clientes[cli] = { nombre: cli, ags: {}, primera: null, ultima: null, cant: 0 }
      clientes[cli].cant++
      if (ag) clientes[cli].ags[ag] = (clientes[cli].ags[ag]||0) + 1
      if (fecha) {
        if (!clientes[cli].primera || fecha < clientes[cli].primera) clientes[cli].primera = fecha
        if (!clientes[cli].ultima || fecha > clientes[cli].ultima) clientes[cli].ultima = fecha
      }
    })
    console.log(`  ${r.name}: ${rows.length} filas procesadas`)
  } catch (e) { console.log(`  ${r.name}: error -`, e.message.slice(0,80)) }
}

const fmtFecha = d => d ? `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}` : ''

const filas = Object.values(clientes)
  .sort((a,b) => b.cant - a.cant)
  .map(c => {
    const agHab = Object.entries(c.ags).sort((a,b)=>b[1]-a[1])[0]?.[0] || ''
    return [c.nombre, agHab, '', '', 'SI', fmtFecha(c.primera), fmtFecha(c.ultima), c.cant, new Date().toLocaleDateString('es-AR'), '']
  })

console.log(`\nPre-poblando ${filas.length} clientes únicos...`)
await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: 'CLIENTES!A2:J500' })

if (filas.length > 0) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'CLIENTES!A:J',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: filas }
  })
  console.log(`✓ ${filas.length} clientes cargados`)
}

console.log('\nTop 15 clientes por frecuencia histórica:')
Object.values(clientes).sort((a,b)=>b.cant-a.cant).slice(0,15).forEach(c => {
  const agHab = Object.entries(c.ags).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—'
  console.log(`  ${c.nombre.padEnd(28)} | ${c.cant.toString().padStart(3)} trabajos | agencia: ${agHab.padEnd(20)} | ${fmtFecha(c.primera)} → ${fmtFecha(c.ultima)}`)
})
