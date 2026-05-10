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

const [presR, hisR, facR] = await Promise.all([
  sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PRESUPUESTOS!A:AV'}),
  sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'HISTORICO_2025!A:AE'}),
  sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'FACTURACION!A:AG'}),
])

const objify = (vals) => {
  if (!vals || vals.length<2) return { headers: [], rows: [] }
  const headers = vals[0]
  const rows = vals.slice(1).map((row,i)=>{const o={__fila:i+2}; headers.forEach((h,c)=>{ const k=h||`col${c}`; if(o[k]!==undefined)o[`${k}_${c}`]=row[c]||''; else o[k]=row[c]||'' }); return o}).filter(p=>Object.values(p).some(v=>v!==''&&v!==undefined&&v!==2))
  return { headers, rows }
}

const presu = objify(presR.data.values).rows
const his = objify(hisR.data.values).rows
const fac = objify(facR.data.values).rows

const presuN = p => p['Columna 1'] || p['col0'] || ''
const norm = v => String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'')

const aprobados = presu.filter(p => String(p['Estado']||'').trim().toUpperCase() === 'APROBADO')
const proyNs = new Set() // ya sabemos: 50 huerfanos. Los detectamos
const facNs = new Set(fac.map(f => String(f['N° Presupuesto']||'').trim()).filter(Boolean))

const proyR = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PROYECTOS!A:AQ'})
const proy = objify(proyR.data.values).rows
proy.forEach(p => proyNs.add(String(p['N° presupuesto']||'').trim()))

const huerfanos = aprobados.filter(p => presuN(p) && !proyNs.has(String(presuN(p)).trim()))
console.log(`\nTotal huérfanos: ${huerfanos.length}`)

const parseFecha = s => { const m = String(s||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if(!m)return new Date(0); const y=Number(m[3])<100?2000+Number(m[3]):Number(m[3]); return new Date(y,Number(m[2])-1,Number(m[1])) }

const huerfanos2025 = huerfanos.filter(p => parseFecha(p['Fecha Evento']).getFullYear() === 2025)
const huerfanos2026 = huerfanos.filter(p => parseFecha(p['Fecha Evento']).getFullYear() === 2026)
const huerfanosOtros = huerfanos.filter(p => parseFecha(p['Fecha Evento']).getFullYear() !== 2025 && parseFecha(p['Fecha Evento']).getFullYear() !== 2026)

console.log(`  De 2025: ${huerfanos2025.length}`)
console.log(`  De 2026: ${huerfanos2026.length}`)
console.log(`  Otros: ${huerfanosOtros.length}`)

console.log(`\n===== CRUCE: ¿LOS HUÉRFANOS DE 2025 ESTÁN EN HISTORICO_2025? =====\n`)
const sameMonth = (a,b) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth()
const yes = []
const no = []

huerfanos2025.forEach(h => {
  const fechaH = parseFecha(h['Fecha Evento'])
  const cli = norm(h['Cliente'])
  const ag = norm(h['Agencia'])
  const proyN = norm(h['Proyecto'])
  const match = his.find(hi => {
    const fH = parseFecha(hi['Fecha'])
    if (!sameMonth(fH, fechaH)) return false
    const hisCli = norm(hi['Cliente'])
    const hisProy = norm(hi['col5']||hi['Proyecto']||'') // columna F probablemente
    if (hisCli && cli && hisCli === cli) return true
    if (hisCli && ag && hisCli === ag) return true
    if (proyN && hisProy && proyN === hisProy) return true
    return false
  })
  if (match) yes.push({ huerfano: h, his: match })
  else no.push(h)
})

console.log(`✓ Encontrados en HISTORICO_2025: ${yes.length}/${huerfanos2025.length}`)
yes.slice(0,10).forEach(({huerfano,his}) => console.log(`  ${presuN(huerfano)} | ${huerfano['Cliente']} | ${huerfano['Fecha Evento']}  → his fila ${his.__fila} | ${his['Cliente']} | ${his['Fecha']}`))
if (yes.length>10) console.log(`  ... y ${yes.length-10} más`)

console.log(`\n✗ NO encontrados en HISTORICO_2025: ${no.length}`)
no.forEach(h => console.log(`  ${presuN(h)} | ${h['Cliente']||h['Agencia']} | ${h['Fecha Evento']} | ${h['Proyecto']} | ${h['Precio Final']}`))

console.log(`\n\n===== HUÉRFANOS DE 2026 (a pasar a PROYECTOS) =====`)
huerfanos2026.forEach(h => console.log(`  ${presuN(h)} | ${h['Fecha Evento']} | ${h['Cliente']||h['Agencia']} | ${h['Proyecto']} | ${h['Precio Final']}`))

console.log(`\n\n===== ANÁLISIS DE FACTURACION =====`)
console.log(`Total facturas: ${fac.length}`)
const facCobradas = fac.filter(f => String(f['Cobrado']||'').toUpperCase()==='TRUE').length
const facSinCobrar = fac.filter(f => String(f['Cobrado']||'').toUpperCase()!=='TRUE').length
console.log(`  Cobradas: ${facCobradas}`)
console.log(`  Sin cobrar: ${facSinCobrar}`)

const facSinProy = fac.filter(f => f['N° Presupuesto'] && !proyNs.has(String(f['N° Presupuesto']).trim()))
console.log(`\nFacturas con N° Presupuesto que NO está en PROYECTOS: ${facSinProy.length}`)
facSinProy.slice(0,15).forEach(f => console.log(`  fila ${f.__fila} | N° pres ${f['N° Presupuesto']} | ${f['Cliente']} | ${f['Proyecto']} | ${f['Fecha Evento']} | $${f['Precio FINAL']} | cobrado: ${f['Cobrado']}`))
if (facSinProy.length>15) console.log(`  ... y ${facSinProy.length-15} más`)

const facSinNum = fac.filter(f => !f['N° Presupuesto'])
console.log(`\nFacturas SIN N° presupuesto: ${facSinNum.length}`)
facSinNum.slice(0,10).forEach(f => console.log(`  fila ${f.__fila} | ${f['Cliente']} | ${f['Proyecto']} | ${f['Fecha Evento']} | $${f['Precio FINAL']}`))

const noCobrAtrasadas = fac.filter(f => {
  if (String(f['Cobrado']||'').toUpperCase()==='TRUE') return false
  const fEv = parseFecha(f['Fecha Evento'])
  const hoy = new Date()
  const diasPasados = (hoy - fEv) / (1000*60*60*24)
  return diasPasados > 60
})
console.log(`\nFacturas sin cobrar con evento hace MÁS de 60 días: ${noCobrAtrasadas.length}`)
noCobrAtrasadas.slice(0,15).forEach(f => console.log(`  fila ${f.__fila} | N° pres ${f['N° Presupuesto']} | ${f['Cliente']} | ${f['Proyecto']} | evento ${f['Fecha Evento']} | $${f['Precio FINAL']}`))
