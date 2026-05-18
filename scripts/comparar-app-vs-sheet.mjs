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

const [presR, proyR] = await Promise.all([
  sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PRESUPUESTOS!A:AV'}),
  sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PROYECTOS!A:AQ'}),
])

const objify = (vals) => {
  if (!vals || vals.length<2) return []
  const headers = vals[0]
  return vals.slice(1).map((row,i)=>{const o={__fila:i+2}; headers.forEach((h,c)=>{ const k=h||`col${c}`; if(o[k]!==undefined)o[`${k}_${c}`]=row[c]||''; else o[k]=row[c]||'' }); return o}).filter(r => Object.entries(r).some(([k,v])=>k!=='__fila'&&v!==''))
}

const presu = objify(presR.data.values)
const proy = objify(proyR.data.values)
const presuN = p => p['Columna 1'] || p['col0'] || ''

console.log(`\n===== COMPARACIÓN APP vs SHEET =====\n`)

// === PRESUPUESTOS ===
console.log(`\n## PRESUPUESTOS\n`)
console.log(`Total filas en sheet: ${presu.length}`)

// Nuevo filtro de la app: Fecha Evento OR Fecha Presupuesto
const presu2026 = presu.filter(p => String(p['Fecha Evento']||'').includes('2026') || String(p['Fecha Presupuesto']||'').includes('2026'))
const presuSinFP = presu.filter(p => !String(p['Fecha Presupuesto']||'').trim())
const presu2025 = presu.filter(p => String(p['Fecha Presupuesto']||'').includes('2025'))
const presuOtraFecha = presu.filter(p => {
  const fp = String(p['Fecha Presupuesto']||'').trim()
  return fp && !fp.includes('2026') && !fp.includes('2025')
})

console.log(`Filtro app (anio=2026, busca '2026' en Fecha Presupuesto): ${presu2026.length} filas mostradas`)
console.log(`Faltarían en la app (no tendrían "2026" en Fecha Presupuesto): ${presu.length - presu2026.length}`)
console.log(`  - Sin Fecha Presupuesto: ${presuSinFP.length}`)
console.log(`  - Con 2025 en Fecha Presupuesto: ${presu2025.length}`)
console.log(`  - Con otra fecha (ni 2026 ni 2025): ${presuOtraFecha.length}`)

if (presuSinFP.length > 0) {
  console.log(`\n  Presupuestos SIN Fecha Presupuesto (no aparecerían en filtro 2026):`)
  presuSinFP.forEach(p => console.log(`    fila ${p.__fila} | N° ${presuN(p)} | ${p['Estado']||''} | cliente ${p['Cliente']||p['Agencia']} | evento ${p['Fecha Evento']}`))
}
if (presu2025.length > 0) {
  console.log(`\n  Presupuestos con FECHA PRESUPUESTO 2025 (no aparecerían en filtro 2026):`)
  presu2025.forEach(p => console.log(`    fila ${p.__fila} | N° ${presuN(p)} | Fecha Presu: ${p['Fecha Presupuesto']} | evento ${p['Fecha Evento']} | ${p['Cliente']}`))
}
if (presuOtraFecha.length > 0) {
  console.log(`\n  Presupuestos con FECHA PRESUPUESTO ni 2026 ni 2025:`)
  presuOtraFecha.slice(0,15).forEach(p => console.log(`    fila ${p.__fila} | N° ${presuN(p)} | Fecha Presu: ${p['Fecha Presupuesto']} | ${p['Cliente']}`))
}

// === PROYECTOS ===
console.log(`\n\n## PROYECTOS\n`)
console.log(`Total filas en sheet: ${proy.length}`)
const proy2026 = proy.filter(p => String(p['Fecha Evento']||'').includes('2026'))
const proySinFE = proy.filter(p => !String(p['Fecha Evento']||'').trim())
const proy2025 = proy.filter(p => String(p['Fecha Evento']||'').includes('2025'))

console.log(`Filtro app (anio=2026, busca '2026' en Fecha Evento): ${proy2026.length} filas mostradas`)
console.log(`Faltarían en la app: ${proy.length - proy2026.length}`)
console.log(`  - Sin Fecha Evento: ${proySinFE.length}`)
console.log(`  - Con 2025 en Fecha Evento: ${proy2025.length}`)

if (proySinFE.length > 0) {
  console.log(`\n  Proyectos SIN Fecha Evento (no aparecerían en filtro 2026):`)
  proySinFE.forEach(p => console.log(`    fila ${p.__fila} | N° ${p['N° presupuesto']} | ${p['Cliente']} | ${p['Proyecto']}`))
}
if (proy2025.length > 0) {
  console.log(`\n  Proyectos con FECHA EVENTO 2025 (no aparecerían en filtro 2026):`)
  proy2025.forEach(p => console.log(`    fila ${p.__fila} | N° ${p['N° presupuesto']} | ${p['Fecha Evento']} | ${p['Cliente']} | ${p['Proyecto']}`))
}

console.log(`\n\n===== RESUMEN =====`)
console.log(`PRESUPUESTOS — Sheet: ${presu.length} | App mostrará: ${presu2026.length} | Diferencia: ${presu.length - presu2026.length}`)
console.log(`PROYECTOS — Sheet: ${proy.length} | App mostrará: ${proy2026.length} | Diferencia: ${proy.length - proy2026.length}`)
