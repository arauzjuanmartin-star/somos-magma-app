/**
 * VERIFICADOR — "Los pendientes de Mariana" al 27/08/2026.
 * Recalcula desde el sheet cada número que va publicado en el documento de la
 * reunión con Mariana y lo compara contra el valor declarado. Solo lectura.
 *
 * Correr SIEMPRE antes de republicar el link.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const HOY=new Date(2026,7,27)

const checks=[]
const check=(etiqueta,declarado,real,tol=1)=>checks.push({etiqueta,declarado,real,ok:Math.abs(declarado-real)<=tol})

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,
  ranges:['PROYECTOS','FACTURACION','GASTOS_FIJOS','CUOTAS'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,FAC,GAS,CUO]=R.data.valueRanges.map(v=>v.values||[])

// ══ PRODUCCIÓN ═══════════════════════════════════════════════════════════
const H=PRO[0]
const iTot=H.findIndex(x=>txt(x)==='Total'), iFe=H.indexOf('Fecha Evento'), iAg=H.indexOf('Agencia'), iCob=H.indexOf('Cobrado')
const porMes={}
let tot2026=0, nAgo=0, agoSinTelefe=0
for(const r of PRO.slice(1)){
  const f=fecha(r[iFe]); if(!f||f.getFullYear()!==2026) continue
  const t=num(r[iTot]); if(t<=0) continue
  const m=f.getMonth()+1
  porMes[m]=(porMes[m]||0)+t
  tot2026+=t
  if(m===8){ nAgo++; if(!/telefe/i.test(txt(r[iAg]))) agoSinTelefe+=t }
}
const eneAgo=[1,2,3,4,5,6,7,8].reduce((s,m)=>s+(porMes[m]||0),0)
check('Producción 2026 (todo lo cargado)', 302234391, tot2026, 1000)
check('Agosto 2026 — producción', 57763360, porMes[8]||0, 1000)
check('Agosto 2026 — proyectos', 42, nAgo)
check('Agosto sin Telefe/Popstars', 42763360, agoSinTelefe, 1000)
check('Producción ene-ago (8 meses)', 289890351, eneAgo, 1000)
check('Ritmo ene-ago por mes', 36236294, eneAgo/8, 1000)
check('Mayo — el mejor mes del año', 63895000, porMes[5]||0, 1000)
check('Julio — el piso', 27341028, porMes[7]||0, 1000)

// ══ EQUILIBRIO ═══════════════════════════════════════════════════════════
// mismo criterio que scripts/equilibrio.mjs: estructura = GASTOS_FIJOS activos y mensuales
const gh=GAS[0], gi=n=>gh.findIndex(x=>new RegExp('^'+n,'i').test(txt(x)))
const iMonto=gi('Monto'), iFrec=gi('Frecuencia'), iAct=gi('Activo')
let estructura=0
for(const r of GAS.slice(1)){
  if(!/^si$/i.test(txt(r[iAct]))) continue
  const f=txt(r[iFrec])
  if(/^mensual$/i.test(f)) estructura+=num(r[iMonto])
  else if(/^anual$/i.test(f)) estructura+=num(r[iMonto])/12   // Mastercard Galicia: se paga 1 vez, pesa todos los meses
}
check('Estructura fija por mes', 18999717, estructura, 500)
const TICKET=1299419, RATIO=37750571/18999717   // de equilibrio.mjs (margen 50%)
const eq=estructura*RATIO
check('Producir para empatar (hoy)', 37750571, eq, 2000)
check('Eventos para empatar (hoy)', 29.1, eq/TICKET, .15)
const prod=(extra)=>(estructura+extra)*RATIO
const esc=(extra)=>prod(extra)/TICKET
check('Eventos con Sol cerrada (+$600.000)', 30.0, esc(600000), .15)
check('Eventos + aumentos Lulu y Tom (+$997.500)', 31.5, esc(1597500), .15)
check('Eventos + editor fijo $1,4M', 33.6, esc(2997500), .15)
check('Faltan por mes contra el ritmo ene-ago', 1514277, eq-eneAgo/8, 5000)
check('Ritmo ene-ago en eventos/mes', 27.9, eneAgo/8/TICKET, .1)
check('Producir con Sol cerrada', 38942678, prod(600000), 3000)
check('Producir + aumentos Lulu y Tom', 40924611, prod(1597500), 3000)
check('Producir + editor fijo', 43706271, prod(2997500), 3000)
check('Faltan con el paquete completo', 7469977, prod(2997500)-eneAgo/8, 5000)
check('Eventos que faltan con el paquete completo', 5.7, esc(2997500)-eneAgo/8/TICKET, .15)

// ══ COBRANZA ═════════════════════════════════════════════════════════════
// mismo criterio que scripts/cobranza-atrasada.mjs: eventos YA ocurridos, no cobrados
const cobrado={}
for(const r of FAC.slice(1)){ const n=txt(r[1]); if(!n) continue
  if(/^(TRUE|VERDADERO|SI|SÍ|X)$/i.test(txt(r[4]))) cobrado[n]=true }
const iNro=H.indexOf('N° presupuesto')
let noCob=0,nNoCob=0, atras=0,nAtras=0, enPlazo=0,nEnPlazo=0, viejo=0,nViejo=0
for(const r of PRO.slice(1)){
  const f=fecha(r[iFe]); if(!f||f>HOY||f.getFullYear()!==2026) continue
  const t=num(r[iTot]); if(t<=0) continue
  if(cobrado[txt(r[iNro])]) continue
  const dias=Math.round((HOY-f)/86400000)
  noCob+=t; nNoCob++
  if(dias>30){atras+=t;nAtras++; if(dias>90){viejo+=t;nViejo++}} else {enPlazo+=t;nEnPlazo++}
}
check('No cobrado (eventos ya hechos)', 74605620, noCob, 1000)
check('No cobrado — proyectos', 63, nNoCob)
check('Atrasado +30 días', 17617060, atras, 1000)
check('Atrasado — proyectos', 21, nAtras)
check('Deuda vieja +90 días', 4010000, viejo, 1000)
check('Dentro de los 30 días', 56988560, enPlazo, 1000)

// ══ SEÑAS Y FACTURAS ═════════════════════════════════════════════════════
const fh=FAC[0], i30=fh.indexOf('Cobrado 30%')
let senas=0, nFac=0
for(const r of FAC.slice(1)){ if(!txt(r[1])&&!txt(r[9])) continue; nFac++; if(num(r[i30])>0) senas++ }
check('Señas del 30% cobradas', 0, senas)
check('Facturas cargadas en FACTURACION', 255, nFac)

// ══ OSTARA ═══════════════════════════════════════════════════════════════
let ost=0,nOst=0
for(const r of PRO.slice(1)){
  const f=fecha(r[iFe]); if(!f||f.getFullYear()!==2026) continue
  if(!/ostara/i.test(txt(r[iAg]))) continue
  const t=num(r[iTot]); if(t<=0) continue
  ost+=t; nOst++
}
check('Ostara 2026 — facturado', 62600000, ost, 1000)
check('Ostara 2026 — proyectos', 45, nOst)
check('Ostara — % de la producción', 21, ost/tot2026*100, .6)

// ══ IIBB ═════════════════════════════════════════════════════════════════
const iibb3=tot2026*0.03
let iibbCargado=0
for(const r of GAS.slice(1)){
  if(!/iibb magma/i.test(txt(r[1]))) continue
  if(/^mensual$/i.test(txt(r[iFrec])) && /^si$/i.test(txt(r[iAct]))) iibbCargado+=num(r[iMonto])*10
}
check('IIBB al 3% sobre lo producido (10 meses)', 9067032, iibb3, 2000)
check('IIBB cargado como fijo (10 meses)', 4025000, iibbCargado, 1000)
check('Diferencia que el modelo no ve', 5042032, iibb3-iibbCargado, 3000)

// ══ LO QUE SIGUE SIN CARGARSE ════════════════════════════════════════════
const conceptos=GAS.slice(1).map(r=>txt(r[1]).toLowerCase())
const hay=re=>conceptos.some(c=>re.test(c))
const pend=[
  ['Software/suscripciones $858.874 en GASTOS_FIJOS', hay(/software|suscripc|anthropic/)],
  ['Provisión de viáticos $2,3M en GASTOS_FIJOS',     hay(/viatico|viático/)],
  ['Costos bancarios Santander',                      hay(/santander/)&&hay(/banc/)],
  ['Costos bancarios Galicia (cta cte / caja ahorro)', conceptos.some(c=>/galicia/.test(c)&&/banc/.test(c)&&!/sgr|garantizar|prestamo|préstamo/.test(c))],
]

// ══ CUOTAS ═══════════════════════════════════════════════════════════════
const ch=CUO[0]||[], iPend=ch.findIndex(x=>/pendiente|saldo/i.test(txt(x))), iCuoM=ch.findIndex(x=>/monto|cuota/i.test(txt(x)))
console.log('\n'+'█'.repeat(78))
console.log('  VERIFICACIÓN — "Los pendientes de Mariana" · al 27/08/2026')
console.log('█'.repeat(78)+'\n')
for(const c of checks){
  const dec = Math.abs(c.declarado)>1000 ? M(c.declarado) : String(c.declarado)
  const rea = Math.abs(c.real)>1000 ? M(c.real) : (Math.round(c.real*10)/10).toString()
  console.log(`  ${c.ok?'\x1b[32m✓\x1b[0m':'\x1b[31m✗\x1b[0m'} ${c.etiqueta.padEnd(46)} dice ${dec.padStart(14)}   real ${rea.padStart(14)}`)
}
console.log('\n  ── Pendientes de la Práctica 3 · ¿ya están en el sheet? ──')
for(const [n,ok] of pend) console.log(`  ${ok?'\x1b[32m✓ cargado \x1b[0m':'\x1b[31m✗ SIGUE SIN CARGARSE\x1b[0m'}  ${n}`)

const malos=checks.filter(c=>!c.ok).length
console.log('\n  '+(malos?`\x1b[31m${malos} número(s) no cierran — corregir antes de publicar\x1b[0m`:'\x1b[32mTodos los números cierran\x1b[0m')+`  (${checks.length} chequeos)\n`)
