/**
 * Morning Brief — radar del día para Juan. Solo lectura.
 *   node scripts/morning-brief.mjs
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
    const i=l.indexOf('='); let v=l.slice(i+1).trim()
    if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1)
    return [l.slice(0,i).trim(),v]
  })
)
const auth = new google.auth.GoogleAuth({
  credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},
  scopes:['https://www.googleapis.com/auth/spreadsheets.readonly'],
})
const sheets = google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

// ---- helpers ----
const ERR = /^#(ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)/
const txt = v => { const s=String(v??'').trim(); return ERR.test(s) ? '' : s }
// "$3,107,905.00" -> 3107905    | "- $4,596" -> -4596
const num = v => {
  const s = txt(v).replace(/\s/g,'')
  if(!s) return 0
  const neg = /^-|^\(.*\)$/.test(s)
  const n = parseFloat(s.replace(/[^\d.]/g,'')) || 0
  return neg ? -n : n
}
// "22/6/2026" -> Date
const fecha = v => {
  const s = txt(v)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if(!m) return null
  let [,d,mo,y] = m
  y = +y; if(y<100) y += 2000
  const dt = new Date(y, +mo-1, +d)
  return isNaN(dt) ? null : dt
}
const money = n => '$' + Math.round(n).toLocaleString('es-AR')
const DIA = 86400000
const hoy = new Date(); hoy.setHours(0,0,0,0)
const dias = d => Math.round((hoy - d)/DIA)
const fmtF = d => d.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'})

// ---- una sola llamada para las 4 solapas (cuidar cuota de Google) ----
const r = await sheets.spreadsheets.values.batchGet({
  spreadsheetId: ID,
  ranges: ['PRESUPUESTOS','PROYECTOS','FACTURACION','RRHH'],
  valueRenderOption: 'FORMATTED_VALUE',
})
const [PRE, PRO, FAC, RH] = r.data.valueRanges.map(v => v.values||[])

const ANIO = hoy.getFullYear()

// ================= 1. PIPELINE =================
// PRESUPUESTOS: A[0]N° B[1]FechaEvento D[3]Estado E[4]Agencia F[5]Cliente G[6]Proyecto I[8]PrecioFinal K[10]Contacto
const presus = PRE.slice(1).filter(p=>txt(p[0])).map(p=>({
  nro: txt(p[0]), fEvento: fecha(p[1]), estado: txt(p[3]).toUpperCase(),
  agencia: txt(p[4]), cliente: txt(p[5]), proyecto: txt(p[6]),
  monto: num(p[8]), contacto: txt(p[10]), pm: txt(p[2]),
}))
const delAnio = presus.filter(p => p.fEvento && p.fEvento.getFullYear()===ANIO)
const espera = delAnio.filter(p => /ESPERA|PENDIENTE/.test(p.estado))
const aprob  = delAnio.filter(p => /APROBADO/.test(p.estado) && !/DESAPROBADO/.test(p.estado))

// PROYECTOS: C[2] N° presupuesto, D[3] Fecha Evento
const nrosProy = new Set(PRO.slice(1).map(p=>txt(p[2])).filter(Boolean))
const sinProyecto = aprob.filter(p => !nrosProy.has(p.nro))

// ================= 2. PRÓXIMOS 7 DÍAS =================
const STAFF_COLS = [13,16,19,22,25,28,31,34,37,40,43,46,49,62,65,68,71,74,77,80,83]
const PED_COLS   = [11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const proyectos = PRO.slice(1).filter(p=>txt(p[2])).map(p=>{
  const pedidos = PED_COLS.filter(c=>txt(p[c])).length
  const conStaff = STAFF_COLS.filter(c=>txt(p[c])).length
  return {
    nro: txt(p[2]), fEvento: fecha(p[3]), agencia: txt(p[4]), cliente: txt(p[5]),
    proyecto: txt(p[6]), total: num(p[7]), pm: txt(p[51]),
    pedidos, conStaff, sinStaff: pedidos>0 && conStaff===0,
    staffParcial: pedidos>0 && conStaff>0 && conStaff<pedidos,
  }
})
const en7 = proyectos
  .filter(p=>p.fEvento && p.fEvento>=hoy && (p.fEvento-hoy)/DIA <= 7)
  .sort((a,b)=>a.fEvento-b.fEvento)
const en7SinStaff = en7.filter(p=>p.sinStaff)

// ================= 3. FACTURACIÓN =================
// FACTURACION: B[1]N° E[4]Cobrado G[6]FechaEvento H[7]Agencia I[8]Cliente J[9]Proyecto M[12]PrecioFINAL T[19]Vencimiento
const esTrue = v => /^(TRUE|VERDADERO|SI|SÍ|X)$/i.test(txt(v))
const facturas = FAC.slice(1).filter(f=>txt(f[1])||txt(f[8])).map(f=>({
  nro: txt(f[1]), cobrado: esTrue(f[4]), fEvento: fecha(f[6]),
  agencia: txt(f[7]), cliente: txt(f[8]), proyecto: txt(f[9]),
  monto: num(f[12]), venc: fecha(f[19]), nroFc: txt(f[14]),
}))
const porCobrar = facturas.filter(f=>!f.cobrado && f.monto>0)
const totalPorCobrar = porCobrar.reduce((s,f)=>s+f.monto,0)

const atrasadas = porCobrar.filter(f=>f.fEvento && dias(f.fEvento)>30)
                           .sort((a,b)=>dias(b.fEvento)-dias(a.fEvento))
const vencenSemana = porCobrar.filter(f=>f.venc && f.venc>=hoy && (f.venc-hoy)/DIA<=7)
const vencidas = porCobrar.filter(f=>f.venc && f.venc<hoy).sort((a,b)=>a.venc-b.venc)

// ================= 4. STAFF =================
// RRHH: A[0] Nombre, K[10] CBU
const cbuPorNombre = new Map(RH.slice(1).map(x=>[txt(x[0]).toLowerCase(), txt(x[10])]))
// "activos" = aparecen en proyectos del mes en curso
const mesActual = proyectos.filter(p=>p.fEvento && p.fEvento.getFullYear()===ANIO && p.fEvento.getMonth()===hoy.getMonth())
const activos = new Set()
PRO.slice(1).forEach(p=>{
  const fe = fecha(p[3]); if(!fe || fe.getFullYear()!==ANIO || fe.getMonth()!==hoy.getMonth()) return
  STAFF_COLS.forEach(c=>{ const n=txt(p[c]); if(n) activos.add(n) })
})
// Equipo interno + el atajo "$1 a Somos Magma" (fee agencia) no son freelancers a pagar.
// Mismo criterio que pages/api/pagos-staff-respuestas.js
const EQUIPO_INTERNO = [/arauz/i, /grenier\s+basavilbaso/i, /somos\s*magma/i]
const esInterno = n => EQUIPO_INTERNO.some(re => re.test(String(n||'')))
const sinCBU = [...activos].filter(n=>{
  if(esInterno(n)) return false
  const cbu = cbuPorNombre.get(n.toLowerCase())
  return cbu===undefined || cbu===''
})

// ================= SALIDA =================
const MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const DIAS=['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
console.log(`\n# 🌅 Morning Brief — ${DIAS[hoy.getDay()]} ${hoy.getDate()} de ${MESES[hoy.getMonth()]} ${ANIO}\n`)

const alertas=[]
if(vencidas.length) alertas.push(`❌ **${vencidas.length} facturas vencidas sin cobrar** por ${money(vencidas.reduce((s,f)=>s+f.monto,0))} — la más vieja: ${vencidas[0].cliente||vencidas[0].agencia} venció hace ${dias(vencidas[0].venc)} días`)
if(atrasadas.length) alertas.push(`🔥 **${atrasadas.length} facturas +30d desde el evento** por ${money(atrasadas.reduce((s,f)=>s+f.monto,0))} — top: ${atrasadas[0].cliente||atrasadas[0].agencia} (${dias(atrasadas[0].fEvento)} días, ${money(atrasadas[0].monto)})`)
if(en7SinStaff.length) alertas.push(`👥 **${en7SinStaff.length} proyectos en los próximos 7 días SIN staff cargado** — ${en7SinStaff.slice(0,3).map(p=>`#${p.nro} ${p.cliente||p.agencia} (${fmtF(p.fEvento)})`).join(', ')}`)
if(sinProyecto.length) alertas.push(`⚠️ **${sinProyecto.length} presus APROBADOS sin proyecto cargado** por ${money(sinProyecto.reduce((s,p)=>s+p.monto,0))} — trabajo confirmado que no está en PROYECTOS`)
if(sinCBU.length) alertas.push(`🏦 **${sinCBU.length} freelancers activos este mes sin CBU** — no se les puede pagar`)
console.log('## 🚨 ATENCIÓN HOY')
console.log(alertas.length ? alertas.slice(0,5).map(a=>`- ${a}`).join('\n') : 'Sin nada crítico, día tranquilo.')

console.log(`\n## 📊 Pipeline ${ANIO}`)
console.log(`- ⏳ En espera: ${espera.length} presus por ${money(espera.reduce((s,p)=>s+p.monto,0))}`)
console.log(`- ✅ Aprobado: ${aprob.length} presus por ${money(aprob.reduce((s,p)=>s+p.monto,0))}`)
if(sinProyecto.length) console.log(`- ⚠️ Aprobados sin proyecto: ${sinProyecto.length} por ${money(sinProyecto.reduce((s,p)=>s+p.monto,0))}`)

console.log(`\n## 📅 Próximos 7 días`)
console.log(`${en7.length} proyectos · ${en7SinStaff.length} sin staff cargado`)
en7.slice(0,8).forEach(p=>{
  const flag = p.sinStaff ? ' 🔴 SIN STAFF' : (p.staffParcial ? ` 🟡 staff ${p.conStaff}/${p.pedidos}` : '')
  console.log(`- **${fmtF(p.fEvento)}** · #${p.nro} · ${p.cliente||p.agencia} — ${p.proyecto||'(sin nombre)'}${p.pm?` · PM ${p.pm}`:''}${flag}`)
})
if(!en7.length) console.log('_(nada agendado)_')

console.log(`\n## 💵 Cobros`)
console.log(`- Por cobrar total: **${money(totalPorCobrar)}** (${porCobrar.length} facturas)`)
console.log(`- 🔥 Atrasadas +30d: ${atrasadas.length} por ${money(atrasadas.reduce((s,f)=>s+f.monto,0))}`)
console.log(`- ⏰ Vencen esta semana: ${vencenSemana.length} por ${money(vencenSemana.reduce((s,f)=>s+f.monto,0))}`)
console.log(`- ❌ Vencidas no cobradas: ${vencidas.length} por ${money(vencidas.reduce((s,f)=>s+f.monto,0))}`)
if(atrasadas.length){
  console.log(`\n**Top 5 más atrasadas:**`)
  atrasadas.slice(0,5).forEach(f=>console.log(`- ${dias(f.fEvento)}d · ${money(f.monto)} · ${f.cliente||f.agencia} — ${f.proyecto||`#${f.nro}`}`))
}

console.log(`\n## 👥 Staff`)
console.log(sinCBU.length ? sinCBU.slice(0,5).map(n=>`- ${n} — falta CBU`).join('\n') : 'Todos los activos del mes tienen CBU cargado ✓')
console.log()
