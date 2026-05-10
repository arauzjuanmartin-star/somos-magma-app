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

const [presR, proyR, facR] = await Promise.all([
  sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PRESUPUESTOS!A:AV'}),
  sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PROYECTOS!A:AQ'}),
  sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'FACTURACION!A:AG'}),
])

const objify = (vals) => {
  if (!vals || vals.length<2) return []
  const headers = vals[0]
  return vals.slice(1).map((row,i)=>{const o={__fila:i+2}; headers.forEach((h,c)=>{ const k=h||`col${c}`; if(o[k]!==undefined)o[`${k}_${c}`]=row[c]||''; else o[k]=row[c]||'' }); return o})
}
const presu = objify(presR.data.values)
const proy = objify(proyR.data.values)
const fac = objify(facR.data.values)

const presuN = p => p['Columna 1'] || p['col0'] || ''
const parseFecha = s => { const m = String(s||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if(!m)return null; const y=Number(m[3])<100?2000+Number(m[3]):Number(m[3]); return new Date(y,Number(m[2])-1,Number(m[1])) }
const norm = v => String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'')

// === Filas del 2025 a eliminar ===
const filas2025 = presu.filter(p => {
  const fE = parseFecha(p['Fecha Evento'])
  const fP = parseFecha(p['Fecha Presupuesto'])
  return (fE && fE.getFullYear() === 2025) || (!fE && fP && fP.getFullYear() === 2025)
})

const porEstado = {}
filas2025.forEach(p => {
  const e = String(p['Estado']||'').trim() || '(sin estado)'
  porEstado[e] = (porEstado[e]||0)+1
})

console.log(`\n===== A) ${filas2025.length} FILAS DEL 2025 EN PRESUPUESTOS A ELIMINAR =====\n`)
console.log('Por estado:')
Object.entries(porEstado).sort((a,b)=>b[1]-a[1]).forEach(([e,n]) => console.log(`  ${e}: ${n}`))

console.log(`\nMuestra (primeras 10 y últimas 10):`)
const show = [...filas2025.slice(0,10), {sep:true}, ...filas2025.slice(-10)]
show.forEach(p => {
  if (p.sep) return console.log('  ...')
  console.log(`  fila ${p.__fila} | N° ${presuN(p)} | ${p['Estado']||''} | ${p['Cliente']||p['Agencia']} | evento ${p['Fecha Evento']} | $${p['Precio Final']}`)
})

// === Los 4 huérfanos 2026 que son duplicados bugeados ===
const huerfanosABorrar = [
  { nro: '1713', cliente: 'Austral Derecho', proyecto: 'Acto de apertura', fecha: '9/3/2026' },
  { nro: '1745', cliente: 'Zona Prop', proyecto: 'Fotos evento', fecha: '12/3/2026' },
  { nro: '1845', cliente: 'Austral Derecho', proyecto: 'Rocio Andrade', fecha: '7/4/2026' },
  { nro: '1823', cliente: 'Austral Derecho', proyecto: 'Evento Cerrito', fecha: '21/4/2026' },
]

console.log(`\n\n===== B) 4 DUPLICADOS BUGEADOS DEL 2026 =====\n`)
console.log('Verifico que cada uno tenga un equivalente en PROYECTOS con OTRO N°:\n')

huerfanosABorrar.forEach(h => {
  const filaPresu = presu.find(p => String(presuN(p)).trim() === h.nro)
  const fechaH = parseFecha(h.fecha)
  const matches = proy.filter(p => {
    const fEv = parseFecha(p['Fecha Evento'])
    if (!fEv || !fechaH) return false
    const diasDiff = Math.abs((fEv - fechaH) / (1000*60*60*24))
    if (diasDiff > 7) return false
    return norm(p['Cliente']) === norm(h.cliente) || norm(p['Cliente']).includes(norm(h.cliente).slice(0,8))
  })
  console.log(`Huérfano N° ${h.nro} (${h.cliente} - ${h.proyecto} - ${h.fecha}):`)
  console.log(`  fila en PRESUPUESTOS: ${filaPresu?.__fila}`)
  if (matches.length === 0) {
    console.log(`  ⚠ NO encontré equivalente en PROYECTOS (cuidado, puede ser real)`)
  } else {
    matches.forEach(m => console.log(`  ✓ MATCH PROYECTOS fila ${m.__fila} | N° ${m['N° presupuesto']} | ${m['Cliente']} | ${m['Proyecto']} | ${m['Fecha Evento']} | $${m['Total ']}`))
  }
  const facMatches = fac.filter(f => {
    const fEv = parseFecha(f['Fecha Evento'])
    if (!fEv || !fechaH) return false
    const diasDiff = Math.abs((fEv - fechaH) / (1000*60*60*24))
    if (diasDiff > 7) return false
    return norm(f['Cliente']) === norm(h.cliente) || norm(f['Cliente']).includes(norm(h.cliente).slice(0,8))
  })
  facMatches.forEach(m => console.log(`  ✓ MATCH FACTURACION fila ${m.__fila} | N° pres ${m['N° Presupuesto']} | ${m['Cliente']} | ${m['Proyecto']} | $${m['Precio FINAL']}`))
  console.log()
})

console.log(`\n===== RESUMEN =====`)
console.log(`A eliminar de PRESUPUESTOS:`)
console.log(`  ${filas2025.length} filas con eventos del 2025`)
console.log(`  4 filas duplicadas bugeadas del 2026 (1713, 1745, 1845, 1823)`)
console.log(`  TOTAL: ${filas2025.length + 4} filas`)
console.log(`\nQuedarían en PRESUPUESTOS: ${presu.length - filas2025.length - 4} filas (todas 2026)`)

console.log(`\n⚠ ACCIÓN DESTRUCTIVA — necesito tu OK explícito antes de ejecutar`)
