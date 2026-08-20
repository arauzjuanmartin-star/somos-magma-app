// Amplía la cantidad de slots de Pedido/Precio(/Staff) en PRESUPUESTOS y PROYECTOS.
// El sheet cortaba en 12 (PRESUPUESTOS) y 20 (PROYECTOS): los servicios de más
// se guardaban en la app pero NO llegaban al sheet. 6 presus perdieron $5.932.000 de costo.
//
// Uso:   node scripts/ampliar-slots-pedidos.mjs            → PREVIEW, no toca nada
//        node scripts/ampliar-slots-pedidos.mjs --escribir → aplica
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const auth = new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets = google.sheets({version:'v4',auth})
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

const ESCRIBIR = process.argv.includes('--escribir')
const MAX_SLOTS = 40   // ← el nuevo tope. Subirlo acá y volver a correr es todo lo que hace falta.

const L = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)} return s }

// Lee headers y datos para verificar que no estemos pisando nada
const b = await sheets.spreadsheets.values.batchGet({ spreadsheetId: ID, ranges: ['PRESUPUESTOS!A1:GZ1','PROYECTOS!A1:GZ1','PRESUPUESTOS!A1:GZ700','PROYECTOS!A1:GZ700'] })
const [hPres, hProy, dPres, dProy] = b.data.valueRanges

const plan = []

// ---------- PRESUPUESTOS: pares Pedido N / Precio N ----------
{
  const H = hPres.values?.[0] || []
  const filas = dPres.values || []
  const anchoReal = Math.max(...filas.map(r => r.length))
  const nuevos = []
  let col = H.length
  for (let n = 13; n <= MAX_SLOTS; n++) {
    if (H.indexOf(`Pedido ${n}`) !== -1) continue
    nuevos.push({ col, nombre: `Pedido ${n}` }); col++
    nuevos.push({ col, nombre: `Precio ${n}` }); col++
  }
  plan.push({ tab:'PRESUPUESTOS', H, anchoReal, nuevos, desde: H.length })
}

// ---------- PROYECTOS: tríos Pedido N / Precio N / Staff N ----------
{
  const H = hProy.values?.[0] || []
  const filas = dProy.values || []
  const anchoReal = Math.max(...filas.map(r => r.length))
  const nuevos = []
  let col = H.length
  for (let n = 21; n <= MAX_SLOTS; n++) {
    if (H.indexOf(`Pedido ${n}`) !== -1) continue
    nuevos.push({ col, nombre: `Pedido ${n}` }); col++
    nuevos.push({ col, nombre: `Precio ${n}` }); col++
    nuevos.push({ col, nombre: `Staff ${n}` });  col++
  }
  plan.push({ tab:'PROYECTOS', H, anchoReal, nuevos, desde: H.length })
}

console.log(`\n${'='.repeat(70)}`)
console.log(`  ${ESCRIBIR ? '✍️  APLICANDO' : '👀 PREVIEW (no se toca nada)'} — tope nuevo: ${MAX_SLOTS} slots`)
console.log('='.repeat(70))

for (const p of plan) {
  console.log(`\n### ${p.tab}`)
  console.log(`   Hoy: ${p.H.length} columnas (última ${L(p.H.length-1)} = "${p.H[p.H.length-1]}")`)
  console.log(`   Ancho real de los datos: ${p.anchoReal} columnas → ${p.anchoReal <= p.H.length ? '✅ no hay datos más allá del header, es seguro agregar' : '🔴 OJO: hay datos fuera del header'}`)
  if (!p.nuevos.length) { console.log('   ✅ Ya tiene todos los slots, no hay nada que agregar'); continue }
  console.log(`   AGREGA ${p.nuevos.length} columnas NUEVAS Y VACÍAS al final (de ${L(p.desde)} a ${L(p.desde + p.nuevos.length - 1)}):`)
  console.log(`     ${p.nuevos.map(n => `${L(n.col)}="${n.nombre}"`).join(' · ')}`)
  console.log(`   Queda en ${p.H.length + p.nuevos.length} columnas (última ${L(p.H.length + p.nuevos.length - 1)})`)
  console.log(`   ⚠️  Sólo se escribe la FILA 1 (los títulos). Ninguna fila de datos se toca.`)
}

if (!ESCRIBIR) {
  console.log(`\n${'='.repeat(70)}`)
  console.log('  Esto fue un preview. Para aplicarlo:')
  console.log('  node scripts/ampliar-slots-pedidos.mjs --escribir')
  console.log('='.repeat(70) + '\n')
  process.exit(0)
}

// El grid del sheet tiene un ancho FÍSICO (columnCount). Si los headers nuevos caen
// más allá, la escritura falla con "exceeds grid limits". Primero se ensancha la grilla.
const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, fields: 'sheets(properties(sheetId,title,gridProperties))' })
const props = Object.fromEntries(meta.data.sheets.map(s => [s.properties.title, s.properties]))

for (const p of plan) {
  if (!p.nuevos.length) continue
  const pr = props[p.tab]
  const necesarias = p.desde + p.nuevos.length
  const actuales = pr.gridProperties.columnCount
  if (actuales < necesarias) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: ID,
      requestBody: { requests: [{ appendDimension: { sheetId: pr.sheetId, dimension: 'COLUMNS', length: necesarias - actuales } }] },
    })
    console.log(`   ${p.tab}: grilla ensanchada de ${actuales} a ${necesarias} columnas`)
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: ID,
    range: `${p.tab}!${L(p.desde)}1:${L(p.desde + p.nuevos.length - 1)}1`,
    valueInputOption: 'RAW',
    requestBody: { values: [p.nuevos.map(n => n.nombre)] },
  })
  console.log(`✅ ${p.tab}: +${p.nuevos.length} columnas`)
}
console.log('\nListo. Ahora los headers soportan hasta', MAX_SLOTS, 'servicios por presupuesto/proyecto.\n')
