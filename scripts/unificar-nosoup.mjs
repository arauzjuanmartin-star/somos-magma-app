/**
 * Unifica "No Soup Group" + variantes de "No soup media" en un solo nombre: "No Soup Media".
 * Preview por default. Escribe con --escribir.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth = new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets = google.sheets({version:'v4',auth})
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const CANON = 'No Soup Media'
const rx = /^\s*no\s*soup\s*(media|group)\s*$/i

// Solapas donde vive el nombre, con las columnas que pueden contenerlo (por header)
const OBJETIVO = [
  {tab:'AGENCIAS',            cols:['Nombre']},
  {tab:'CLIENTES',            cols:['Nombre','Agencia habitual']},
  {tab:'Contactos/agencias',  cols:['Agencia']},
  {tab:'PRESUPUESTOS',        cols:['Agencia','Cliente']},
  {tab:'PROYECTOS',           cols:['Agencia','Cliente']},
  {tab:'FACTURACION',         cols:['Agencia','Cliente']},
  {tab:'COBROS',              cols:['Cliente','Agencia']},
  {tab:'listado',             cols:null},   // lista de dropdowns: barrer todas las columnas
  {tab:'CARGA DATOS 3',       cols:null},   // formulario viejo del sheet
]
const colLetra = n => { let s=''; n++; while(n>0){ const r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26) } return s }

const meta = await sheets.spreadsheets.get({spreadsheetId:SHEET_ID})
const tabId = t => meta.data.sheets.find(s=>s.properties.title===t)?.properties.sheetId

const res = await sheets.spreadsheets.values.batchGet({spreadsheetId:SHEET_ID, ranges:OBJETIVO.map(o=>`'${o.tab}'!A:BZ`)})

const cambios = []
res.data.valueRanges.forEach((vr,i)=>{
  const {tab, cols} = OBJETIVO[i]
  const vals = vr.values||[]
  const h = vals[0]||[]
  const idx = cols ? cols.map(c=>h.findIndex(x=>String(x||'').trim().toLowerCase()===c.toLowerCase())).filter(n=>n>=0) : null
  if (cols && idx.length !== cols.length) console.log(`   (${tab} no tiene todas estas columnas: ${cols.join('/')} — se barren las ${idx.length} que sí existen)`)
  vals.forEach((row,ri)=>{
    if (cols && ri===0) return
    const objetivo = idx ?? row.map((_,c)=>c)
    objetivo.forEach(ci=>{
      const v = row[ci]
      if (typeof v==='string' && rx.test(v) && v!==CANON) {
        cambios.push({tab, fila:ri+1, celda:`${colLetra(ci)}${ri+1}`, header:h[ci]||'—', de:v, a:CANON})
      }
    })
  })
})

// La ficha vacía de "No Soup Group" en AGENCIAS se elimina (se queda la que tiene CUIT/mail).
// Se saca de la lista de renombres: si se renombrara Y se borrara, un fallo del delete
// dejaría dos "No Soup Media" en el desplegable.
const ag = res.data.valueRanges[0].values||[]
const filaGroup = ag.findIndex(r=>String(r[0]||'').trim().toLowerCase()==='no soup group')
const borrar = filaGroup>0 ? {fila:filaGroup+1, datos:ag[filaGroup]} : null
if (borrar) { const i = cambios.findIndex(c=>c.tab==='AGENCIAS' && c.fila===borrar.fila); if(i>=0) cambios.splice(i,1) }

console.log(`\n${'='.repeat(68)}\nUNIFICAR AGENCIA → "${CANON}"   ${ESCRIBIR?'*** ESCRIBIENDO ***':'(PREVIEW — nada se escribe)'}\n${'='.repeat(68)}\n`)
let tabAct=''
cambios.forEach(c=>{
  if(c.tab!==tabAct){ console.log(`\n  ${c.tab}`); tabAct=c.tab }
  console.log(`    ${c.celda.padEnd(6)} [${String(c.header).padEnd(18)}]  "${c.de}"  →  "${c.a}"`)
})
if(borrar){
  console.log(`\n  AGENCIAS — ELIMINAR fila ${borrar.fila} (ficha duplicada, sin CUIT ni mail):`)
  console.log(`    ${JSON.stringify(borrar.datos)}`)
}
console.log(`\n  TOTAL: ${cambios.length} celdas a corregir + ${borrar?1:0} fila a eliminar\n`)

if(!ESCRIBIR){ console.log('  Para aplicar:  node scripts/unificar-nosoup.mjs --escribir\n'); process.exit(0) }

// --- escribir ---
const data = cambios.map(c=>({range:`'${c.tab}'!${c.celda}`, values:[[c.a]]}))
if(data.length) await sheets.spreadsheets.values.batchUpdate({spreadsheetId:SHEET_ID, requestBody:{valueInputOption:'USER_ENTERED', data}})
console.log(`  ✓ ${data.length} celdas actualizadas`)
if(borrar){
  await sheets.spreadsheets.batchUpdate({spreadsheetId:SHEET_ID, requestBody:{requests:[{deleteDimension:{range:{sheetId:tabId('AGENCIAS'), dimension:'ROWS', startIndex:borrar.fila-1, endIndex:borrar.fila}}}]}})
  console.log(`  ✓ fila ${borrar.fila} de AGENCIAS eliminada`)
}

// --- verificación ---
const ver = await sheets.spreadsheets.values.batchGet({spreadsheetId:SHEET_ID, ranges:OBJETIVO.map(o=>`'${o.tab}'!A:BZ`)})
let restan=0, ok=0
ver.data.valueRanges.forEach((vr,i)=>{
  (vr.values||[]).forEach((row,ri)=>row.forEach((c,ci)=>{
    if(typeof c==='string' && rx.test(c)){ if(c===CANON) ok++; else { restan++; console.log(`  ✗ QUEDA: ${OBJETIVO[i].tab} ${colLetra(ci)}${ri+1} = "${c}"`) } }
  }))
})
console.log(`\n  VERIFICACIÓN: ${ok} celdas dicen "${CANON}" · ${restan} variantes sin unificar`)
console.log(restan===0 ? '  ✓ TODO UNIFICADO\n' : '  ⚠️  revisar\n')
