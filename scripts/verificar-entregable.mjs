/**
 * VERIFICADOR DEL ENTREGABLE A MARIANA.
 * Recalcula desde el sheet CADA número publicado en el documento y lo compara
 * contra el valor declarado. Si algo no coincide, lo marca en rojo.
 *
 * Correr antes de mandarle el link a alguien:  node scripts/verificar-entregable.mjs
 * Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const yes=v=>/^(s[ií]|true|x|✓)$/i.test(txt(v))
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const mediana=a=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2}
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,
  ranges:['PROYECTOS','FACTURACION','GASTOS_FIJOS','PRESTAMOS','CUENTAS','Pagos_Staff','SOCIOS_MOVIMIENTOS'],
  valueRenderOption:'FORMATTED_VALUE'})
const [PRO,FAC,GAS,PRE,CUE,PS,SM]=R.data.valueRanges.map(v=>v.values||[])
const H=PRO[0]
const iTot=H.findIndex(x=>txt(x)==='Total'), iFee=H.indexOf('Fee Agencia'), iDif=H.indexOf('Diferencia')

const checks=[]
const check=(etiqueta, declarado, real, tol=1)=>{
  const ok = Math.abs(declarado-real) <= tol
  checks.push({etiqueta, declarado, real, ok})
}

// ── producción y margen ──
let prodEneJul=0, prodTot=0, costoFree=0, magma=0, nProy=0, ganMagma=0
const tickets=[], ticketsEvento=[]
PRO.slice(1).forEach(r=>{
  const f=fecha(r[3]); if(!f||f.getFullYear()!==2026)return
  const t=num(r[iTot]); prodTot+=t; nProy++
  if(f.getMonth()<=6) prodEneJul+=t
  const esEvento=[11,14,17,20,23,26].some(c=>/foto|video|film/i.test(txt(r[c])))
  let cf=0, sm=0
  PED.forEach(c=>{const p=txt(r[c]); if(!p)return; const v=num(r[c+1]); const pers=txt(r[c+2])
    if(v<=1||!pers)return
    if(/somos magma/i.test(pers)) sm+=v; else cf+=v })
  costoFree+=cf; magma+=sm
  ganMagma+=num(r[iFee])+sm+num(r[iDif])
  if(t>0){ tickets.push(t); if(esEvento) ticketsEvento.push(t) }
})
check('Producción ene–jul 2026',        232971990, prodEneJul, 1000)
check('Costo de freelancers 2026',       98208063, costoFree, 1000)
// margen = ganancia Magma real (Fee Agencia + Somos Magma + Diferencia) / producción,
// igual que snapshot-coach. NO es (producción - costo freelancers), que incluye impuestos.
const margenPct=Math.round(ganMagma/prodTot*100)
check('Margen de producción (%)',              50, margenPct, 1)   // tolerancia 1: queda en el borde 49,5%
check('Ticket promedio de eventos',       1372762, Math.round(ticketsEvento.reduce((s,x)=>s+x,0)/ticketsEvento.length), 5000)
check('Ticket mediana de eventos',         800000, mediana(ticketsEvento), 1000)

// ── facturación ──
let facEneJul=0, porCobrar=0
FAC.slice(1).forEach(r=>{ if(!r||!r.some(c=>txt(c)))return
  const f=fecha(r[6]); const final=num(r[12])
  if(f&&f.getFullYear()===2026&&f.getMonth()<=6) facEneJul+=final
  if(!yes(r[4])) porCobrar+=final })
check('Facturado ene–jul 2026',          169776190, facEneJul, 1000)
check('Gap producción vs facturación',    63195801, prodEneJul-facEneJul, 2000)

// ── gastos fijos ──
let gf=0
GAS.slice(1).forEach(r=>{ if(!r||!yes(r[7]))return
  const mon=txt(r[3]||'ARS').toUpperCase(), fr=txt(r[4]||'mensual').toLowerCase()
  if(mon.includes('USD'))return
  let m=num(r[2])
  if(fr.includes('anual'))m/=12; else if(fr.includes('trimes'))m/=3; else if(fr.includes('semest'))m/=6
  gf+=m })
check('Estructura fija mensual',          25505929, gf, 1000)

// ── préstamos ──
let pend=0, cap=0, int=0
PRE.slice(1).forEach(r=>{ if(!r||!txt(r[0]))return
  if(/^s/i.test(txt(r[6])))return
  pend+=num(r[4]); cap+=num(r[15]); int+=num(r[16]) })
check('Préstamos pendientes',             35396327, pend, 1000)
check('  · de eso, capital',              27908979, cap, 1000)
check('  · de eso, interés',               6394557, int, 1000)

// ── caja ──
let caja=0
CUE.slice(1).forEach(r=>{ if(!r||!txt(r[0]))return; if(yes(r[4])) caja+=num(r[5]) })
check('Caja (cuentas activas)',          -22520166, caja, 1000)

// ── Oir ──
let oirPend=0
FAC.slice(1).forEach(r=>{ if(!/oir/i.test(txt(r[7])))return; if(!yes(r[4])) oirPend+=num(r[12]) })
check('Oir — facturas abiertas',           7260000, oirPend, 1000)

// ── Pagos_Staff conciliado ──
const nros2026=new Set()
PRO.slice(1).forEach(r=>{const f=fecha(r[3]); if(f&&f.getFullYear()===2026){const n=txt(r[2]); if(n)nros2026.add(n)}})
let psAd=0
PS.slice(1).forEach(r=>{ if(!r||!txt(r[1]))return; if(nros2026.has(txt(r[3]))) psAd+=num(r[6]) })
check('Pagos_Staff (proyectos 2026)',     100565063, psAd, 1000)
const esMonto=v=>/^\$?\s*[\d.,]+\s*$/.test(txt(v))&&txt(v)!==''
let sinServicio=0
PS.slice(1).forEach(r=>{ if(r&&txt(r[1])&&esMonto(txt(r[5])))sinServicio++ })
check('Registros con monto en "Servicio"',       0, sinServicio, 0)

// ── sueldo de socios ──
// misma lógica que cuenta-socios.mjs: solo ARS y solo movimientos con Magma
// (las direcciones Sofi→Juan son deuda entre socios y NO son aporte a Magma)
let juanRec=0, juanPuso=0, sofiMov=0
SM.slice(1).forEach(r=>{ if(!r||!txt(r[0]))return
  const so=txt(r[1]), dir=txt(r[2]), m=num(r[4]), mon=txt(r[9]||'ARS').toUpperCase()
  if(/sofi/i.test(so)) sofiMov++
  if(/→/.test(dir)&&!/magma/i.test(dir)) return    // entre socios
  if(mon!=='ARS') return                            // USD va aparte
  if(!/juan/i.test(so))return
  if(/Magma→Socio/i.test(dir)) juanRec+=m; else juanPuso+=m })
check('Juan — retiró de Magma',           14485000, juanRec, 1000)
check('Juan — puso de su bolsillo',        3250036, juanPuso, 1000)
check('Sofi — movimientos cargados',             15, sofiMov, 0)

// ── saldos de la cuenta de socios ──
// No los re-implemento acá: corro cuenta-socios.mjs (que es la fuente del número
// publicado) y comparo su salida contra el documento. Así se detecta el caso real:
// el sheet cambió, el script da otro número y el documento quedó viejo.
try {
  const out = execSync('node scripts/cuenta-socios.mjs', { cwd:'/Users/dronjuan/somos-magma-app', encoding:'utf8' })
  // ojo: la salida viene en formato argentino ($12.859.709), el punto es separador
  // de miles — hay que sacarlo, no tratarlo como decimal.
  const saldo = quien => {
    const l = out.split('\n').find(x => new RegExp(`^\\s{2}${quien}\\s`).test(x))
    // el signo puede venir antes o después del $ ("-$1.952.973" o "$-1.952.973")
    const montos = (l||'').match(/-?\$-?[\d.]+/g) || []
    // sacar $ y los puntos de miles ya deja el signo bien puesto en ambos casos
    return parseFloat((montos[montos.length-1] || '0').replace(/[$.]/g,''))
  }
  check('Saldo de socio — Sofi',  11750046, saldo('Sofi'), 1000)
  check('Saldo de socio — Juan',  -1952973, saldo('Juan'), 1000)
} catch(e) { check('Saldo de socios (script)', 1, 0, 0) }

// ── formatos de rodaje con margen (sección B.1 bis) ──
try {
  const out = execSync('node scripts/formato-rodaje.mjs 2026', { cwd:'/Users/dronjuan/somos-magma-app', encoding:'utf8' })
  const n = (rx,i=1) => { const m = out.match(rx); return m ? parseFloat(String(m[i]).replace(/\./g,'')) : 0 }
  check('Proyectos 2026',                     234, n(/· (\d+) proyectos/), 0)
  check('Facturado 2026',               259911731, n(/proyectos · \$([\d.]+)/), 1000)
  check('Costo de freelancers',         105928800, n(/^  TOTAL\s+\d+\s+\$[\d.]+\s+\$([\d.]+)/m), 1000)
  check('MARGEN de Magma',              153982931, n(/^  TOTAL\s+\d+\s+\$[\d.]+\s+\$[\d.]+\s+\$([\d.]+)/m), 1000)
  check('IVA facturado 2026',            44522890, n(/IVA cobrado aparte: \$([\d.]+)/), 1000)
  check('1 pers × media — proyectos',          93, n(/1 persona × media jornada\s+(\d+)/), 0)
  check('1 pers × media — facturado',    49143202, n(/1 persona × media jornada\s+\d+\s+\$([\d.]+)/), 1000)
  check('2 pers × media — facturado',    36873000, n(/2 personas × media jornada\s+\d+\s+\$([\d.]+)/), 1000)
  check('Solo edición — facturado',      12185000, n(/^  Solo edición\s+\d+\s+\$([\d.]+)/m), 1000)
} catch(e) { check('Formatos de rodaje (script)', 1, 0, 0) }

// ── proyectos que no cuadran por dentro ──
try {
  const out = execSync('node scripts/auditar-proyectos.mjs', { cwd:'/Users/dronjuan/somos-magma-app', encoding:'utf8' })
  const m = out.match(/no cuadran\s+(\d+) de/)
  check('Proyectos que no cuadran',           109, m?+m[1]:0, 0)
} catch(e) { check('Auditoría de proyectos (script)', 1, 0, 0) }

// ── punto de equilibrio con la estructura separada (A.7) ──
try {
  const out = execSync('node scripts/equilibrio.mjs', { cwd:'/Users/dronjuan/somos-magma-app', encoding:'utf8' })
  const g = (rx,n=1) => { const m = out.match(rx); return m ? parseFloat(String(m[n]).replace(/\./g,'')) : 0 }
  check('Estructura mensual real',       18578821, g(/todos los meses\s+\$([\d.]+)/), 1000)
  check('Pagos únicos en la estructura',  6927108, g(/\$([\d.]+) son pagos únicos/), 1000)
  check('Equilibrio — eventos/mes',            28, g(/todos los meses.*?=\s+(\d+) eventos/), 0)
  check('Ritmo actual — eventos/mes',          23, g(/Ritmo actual: .*· (\d+) eventos/), 0)
} catch(e) { check('Equilibrio (script)', 1, 0, 0) }

// ── salida ──
console.log(`\n${'█'.repeat(74)}`)
console.log(`  VERIFICACIÓN DEL ENTREGABLE — cada número recalculado desde el sheet`)
console.log(`${'█'.repeat(74)}\n`)
let fallos=0
checks.forEach(c=>{
  const marca=c.ok?'✓':'✗'
  const val = Math.abs(c.real)>=1000 ? M(c.real) : String(c.real)
  const dec = Math.abs(c.declarado)>=1000 ? M(c.declarado) : String(c.declarado)
  if(!c.ok)fallos++
  console.log(`  ${marca} ${c.etiqueta.padEnd(34)} doc: ${dec.padStart(15)}   sheet: ${val.padStart(15)}${c.ok?'':'   ← NO COINCIDE'}`)
})
console.log(`\n${'─'.repeat(74)}`)
if(fallos===0) console.log(`  ✓ ${checks.length}/${checks.length} — el documento coincide con el sheet.`)
else console.log(`  ✗ ${fallos} de ${checks.length} NO coinciden. Corregir el documento antes de compartirlo.`)
console.log('')
process.exit(fallos?1:0)
