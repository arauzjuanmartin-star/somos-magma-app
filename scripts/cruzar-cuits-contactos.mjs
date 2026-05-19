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

const ejecutar = process.argv.includes('--ejecutar')

// 1. Leer Contactos/agencias (col C = Agencia, col H = CUIT)
const ctR = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'Contactos/agencias!A:H'})
const ctRows = ctR.data.values.slice(1)
console.log(`Contactos/agencias: ${ctRows.length} filas`)

// 2. Agrupar CUITs por agencia (filtrar vacíos)
const cuitsPorAgencia = {}
ctRows.forEach(row => {
  const ag = String(row[2]||'').trim()
  const cuit = String(row[7]||'').trim().replace(/[^\d]/g,'')
  if (ag && cuit && cuit.length >= 9) {
    if (!cuitsPorAgencia[ag]) cuitsPorAgencia[ag] = {}
    cuitsPorAgencia[ag][cuit] = (cuitsPorAgencia[ag][cuit]||0)+1
  }
})

// 3. Leer AGENCIAS actual
const agR = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'AGENCIAS!A:L'})
const agRows = agR.data.values.slice(1)
console.log(`AGENCIAS: ${agRows.length} filas`)

// 4. Match
const norm = v => String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'')
const aActualizar = []
const sinMatch = []
const conflictos = []

agRows.forEach((row,i) => {
  const fila = i + 2
  const nombre = row[0]
  const cuitActual = row[1]
  if (cuitActual) return // ya tiene CUIT
  // Buscar en cuitsPorAgencia con match flexible
  const matchKey = Object.keys(cuitsPorAgencia).find(k => norm(k) === norm(nombre))
  if (!matchKey) {
    sinMatch.push({fila, nombre})
    return
  }
  const cuits = cuitsPorAgencia[matchKey]
  const cuitsArr = Object.entries(cuits).sort((a,b)=>b[1]-a[1])
  if (cuitsArr.length === 1) {
    aActualizar.push({fila, nombre, cuit: cuitsArr[0][0], freq: cuitsArr[0][1]})
  } else {
    // Múltiples CUITs — usar el más frecuente pero avisar conflicto
    conflictos.push({fila, nombre, opciones: cuitsArr})
    aActualizar.push({fila, nombre, cuit: cuitsArr[0][0], freq: cuitsArr[0][1], conflictivo: true})
  }
})

console.log(`\n===== RESULTADO =====`)
console.log(`Agencias a actualizar con CUIT: ${aActualizar.length}`)
console.log(`Agencias sin match en Contactos: ${sinMatch.length}`)
console.log(`Conflictos (CUITs distintos para misma agencia): ${conflictos.length}`)

if (conflictos.length > 0) {
  console.log(`\n--- CONFLICTOS (uso el CUIT más frecuente, pero revisalo) ---`)
  conflictos.forEach(c => {
    console.log(`  ${c.nombre}:`)
    c.opciones.forEach(([cuit,freq]) => console.log(`    ${cuit} (aparece ${freq}x)`))
  })
}

console.log(`\n--- A ACTUALIZAR (${aActualizar.length}) ---`)
aActualizar.slice(0,30).forEach(a => console.log(`  fila ${a.fila} | ${a.nombre.padEnd(25)} | CUIT ${a.cuit}${a.conflictivo?' ⚠':''}`))
if (aActualizar.length > 30) console.log(`  ... y ${aActualizar.length-30} más`)

if (!ejecutar) {
  console.log(`\n💡 Para ejecutar: node scripts/cruzar-cuits-contactos.mjs --ejecutar`)
  process.exit(0)
}

console.log(`\n===== EJECUTANDO =====`)
const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
const hoy = new Date().toLocaleDateString('es-AR')
const updates = []
aActualizar.forEach(a => {
  updates.push({ range: `AGENCIAS!B${a.fila}`, values: [[a.cuit]] })
  updates.push({ range: `AGENCIAS!L${a.fila}`, values: [[hoy]] })
})

await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId: SHEET_ID,
  requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
})
console.log(`✓ ${aActualizar.length} CUITs aplicados a AGENCIAS`)
