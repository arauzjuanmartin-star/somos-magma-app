/**
 * VERIFICADOR DE LA PRÁCTICA 3 — recalcula desde el sheet cada número que va
 * publicado en el documento de la reunión con Sofi (13/08/2026) y lo compara
 * contra el valor declarado. Correr antes de mandar el link.
 * Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const USD_TARJETA = 1900   // dólar tarjeta estimado del resumen de julio (cierre 30/07)

const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const T=s=>/true/i.test(txt(s))
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const med=a=>{if(!a.length)return null;const o=[...a].sort((x,y)=>x-y);return o[Math.floor(o.length/2)]}
// MISMA normalización de servicios que scripts/margen-por-servicio.mjs — no inventar otra
function norm(p){const s=txt(p).toLowerCase().replace(/[^\wáéíóúñ\s½]/g,'').trim()
  if(/edit|edici/.test(s))return 'Edición'
  if(/foto/.test(s))return /1\/2|½|medi/.test(s)?'Foto ½':'Foto 1'
  if(/video/.test(s))return /1\/2|½|medi/.test(s)?'Video ½':'Video 1'
  if(/film/.test(s))return /1\/2|½|medi/.test(s)?'Film ½':'Film 1'
  return txt(p).slice(0,16)||'(otros)'
}

const checks=[]
const check=(etiqueta, declarado, real, tol=1)=>checks.push({etiqueta, declarado, real, ok:Math.abs(declarado-real)<=tol})

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,
  ranges:['PROYECTOS','FACTURACION','MOVIMIENTOS_TARJETA','CUOTAS','GASTOS_FIJOS'],
  valueRenderOption:'FORMATTED_VALUE'})
const [PRO,FAC,MOV,CUO,GAS]=R.data.valueRanges.map(v=>v.values||[])
const H=PRO[0]
const iTot=H.findIndex(x=>txt(x)==='Total'), iFee=H.indexOf('Fee Agencia'), iDif=H.indexOf('Diferencia'), iAg=H.indexOf('Agencia')
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]

// ══ 1 · TARJETA DE JULIO ══════════════════════════════════════════════════
const CAT=[
  ['software', /adobe|anthropic|openai|chatgpt|claude|google|apple|amazon|sqsp|squarespace|dragonpass|prime|youtube|skool|halls/i],
  ['ads', /facebk|facebook/i],
  ['combustible', /ypf|shell|axion|puma|gnc|combust|nafta/i],
  ['movilidad', /cabify|uber|didi|taxi|peaje|telepase/i],
  ['comida', /rappi|pedidosya|pedidos ?ya|mc ?donald|cafe|resto|pizza|coto|carrefour|jumbo|dia |super|almacen|pollo|camorra|cramer|prospero|pedrera|sossa|dongato/i],
  ['equipos', /mercado ?libre|gangahome|svccomar|gamestation|bidcom|macstation|sodimac|electronica|gallio|rouge|obok/i],
  ['seguros', /seguro|la segunda/i],
  ['oficina', /edenor|metrogas|abl|persflow|personal ?flow/i],
  ['bancarios', /cargo|comision|comisión|percep|rg ?5617|db\.rg|sircreb|interes/i],
]
const esPersona=c=>/^MERPAGO\*[A-Z]{10,}$/i.test(c.trim()) && !/gamestation|gangahome|svccomar|passline|electronica|gallio|appypf|bidcom|obok|anchorena|dongato/i.test(c)
const clasif=t=>{if(esPersona(t))return 'personas';for(const [n,re] of CAT) if(re.test(t)) return n;return 'otros'}

const jul=MOV.slice(1).filter(x=>String(x[1])==='7'&&String(x[2])==='2026'&&/empresa/i.test(x[8]||''))
const B={}
let totJul=0
for(const row of jul){
  const raw=num(row[7]); if(!raw) continue
  const monto=/usd/i.test(txt(row[6]))?raw*USD_TARJETA:raw
  const c=clasif(txt(row[5]))
  B[c]=(B[c]||0)+monto; totJul+=monto
}
const viaticos=(B.comida||0)+(B.combustible||0)+(B.movilidad||0)

check('Tarjeta Magma julio (total)', 5222091, totJul, 500)
check('  · comida/rodaje', 1515757, B.comida||0, 500)
check('  · combustible', 574083, B.combustible||0, 500)
check('  · movilidad', 215640, B.movilidad||0, 500)
check('  · software/suscripciones', 858874, B.software||0, 500)
check('  · ads (Meta USD)', 296875, B.ads||0, 500)
check('  · equipos/insumos', 264721, B.equipos||0, 500)
check('  · seguros', 402733, B.seguros||0, 500)
check('  · pagos sueltos a personas', 246067, B.personas||0, 500)
check('VIÁTICOS+COMIDA+COMBUSTIBLE julio', 2305480, viaticos, 500)

// ══ 2 · PROYECTOS: facturación mensual y unitarios ═════════════════════════
const porMes={}
let factTotal=0, costoTotal=0
const S={}
PRO.slice(1).forEach(r=>{
  const f=fecha(r[3]); if(!f||f.getFullYear()!==2026)return
  const m=f.getMonth()+1
  const total=num(r[iTot]); factTotal+=total
  porMes[m]=porMes[m]||{total:0,costo:0,viat:0}
  porMes[m].total+=total
  const margenProy=num(r[iFee])+num(r[iDif])
  const lineas=[]
  PED.forEach(c=>{const p=txt(r[c]); if(!p)return; const v=num(r[c+1]); const pers=txt(r[c+2]); if(v<=1)return
    lineas.push({p,v,magma:/somos magma/i.test(pers)})
    if(!/somos magma/i.test(pers)){ costoTotal+=v; porMes[m].costo+=v }
    if(/viatic/i.test(p)) porMes[m].viat+=v })
  if(!lineas.length)return
  const peso=lineas.reduce((s,l)=>s+l.v,0)
  let extra=margenProy; lineas.forEach(l=>{if(l.magma) extra+=l.v})
  lineas.forEach(l=>{
    const k=norm(l.p)
    if(!['Edición','Video 1','Film 1'].includes(k))return
    S[k]=S[k]||{n:0,venta:0,costo:0}
    S[k].n++; S[k].venta+=l.v+extra*(l.v/peso); S[k].costo+=l.magma?0:l.v
  })
})
check('Facturación julio (eventos de julio)', 26891028, porMes[7].total, 100)
check('Facturación 2026 total', 272704391, factTotal, 5000)
check('Viáticos facturados como línea en julio', 144000, porMes[7].viat, 100)

const camN=S['Video 1'].n+S['Film 1'].n
const camVenta=(S['Video 1'].venta+S['Film 1'].venta)/camN
const camCosto=(S['Video 1'].costo+S['Film 1'].costo)/camN
const edVenta=S['Edición'].venta/S['Edición'].n
const edCosto=S['Edición'].costo/S['Edición'].n
check('Venta jornada entera de cámara', 598455, camVenta, 1000)
check('Costo jornada entera de cámara', 301456, camCosto, 1000)
check('Venta por edición', 267826, edVenta, 200)
check('Costo por edición', 74023, edCosto, 1000)
check('Paquete 14 jornales + 7 videos (venta)', 10253149, 14*camVenta+7*edVenta, 2000)
check('Paquete comprado afuera (costo)', 4738543, 14*camCosto+7*edCosto, 20000)

// ══ 3 · OSTARA ════════════════════════════════════════════════════════════
let ostFact=0, ostCosto=0, ostN=0
PRO.slice(1).forEach(r=>{
  if(!/ostara/i.test(txt(r[iAg]))&&!/ostara/i.test(txt(r[iAg+1])))return
  ostN++; ostFact+=num(r[iTot])
  PED.forEach(c=>{const p=txt(r[c]); if(!p)return; const v=num(r[c+1]); const pers=txt(r[c+2]); if(v<=1)return
    if(!/somos magma/i.test(pers)) ostCosto+=v })
})
check('Ostara — proyectos 2026', 44, ostN, 0)
check('Ostara — facturado 2026', 62440000, ostFact, 100)
check('Ostara — margen %', 58, Math.round((1-ostCosto/ostFact)*100), 1)
check('Ostara — % de la facturación de Magma', 23, Math.round(ostFact/factTotal*100), 1)

// ══ 4 · COBRANZA ══════════════════════════════════════════════════════════
const fac=FAC.slice(1).filter(x=>x&&x.length>5)
const conAdelanto=fac.filter(x=>T(x[2])).length
const cobradas=fac.filter(x=>T(x[4]))
const fechasFalsas=cobradas.filter(x=>txt(x[5])&&txt(x[5])===txt(x[6])).length
const fechasReales=cobradas.filter(x=>txt(x[5])&&txt(x[5])!==txt(x[6]))
const noCobradas=fac.filter(x=>!T(x[4]))
const porCobrar=noCobradas.reduce((s,x)=>s+num(x[10]),0)
const sinFactura=noCobradas.filter(x=>!txt(x[14])).reduce((s,x)=>s+num(x[10]),0)

check('Facturas con adelanto del 30% cobrado', 0, conAdelanto, 0)
check('Facturas totales en FACTURACION', 235, fac.length, 0)
check('Facturas sin cobrar', 43, noCobradas.length, 0)
check('Por cobrar (sin IVA)', 44118300, porCobrar, 1000)
check('Por cobrar SIN factura emitida', 12911440, sinFactura, 1000)

const dias=fechasReales.map(x=>{const fe=fecha(x[6]),fc=fecha(x[5]);if(!fe||!fc)return null;const d=Math.round((fc-fe)/86400000);return (d>=-30&&d<400)?d:null}).filter(d=>d!==null)
check('Mediana días evento→cobro (filas con fecha real)', 31, med(dias), 0)
console.log(`\n  ℹ Fechas de cobro copiadas de la fecha del evento (no miden nada): ${fechasFalsas} de ${cobradas.length} cobradas`)
console.log(`  ℹ Filas con fecha de cobro REAL utilizables: ${dias.length}`)

// ── Ostara: plazo y pendiente ──
const ostFac=fac.filter(x=>/ostara/i.test(txt(x[7])+txt(x[8])))
const ostDias=ostFac.filter(x=>T(x[4])&&txt(x[5])&&txt(x[5])!==txt(x[6])).map(x=>{const fe=fecha(x[6]),fc=fecha(x[5]);if(!fe||!fc)return null;return Math.round((fc-fe)/86400000)}).filter(d=>d!==null&&d>=-30&&d<400)
const ostPend=ostFac.filter(x=>!T(x[4])).reduce((s,x)=>s+num(x[10]),0)
check('Ostara — mediana días evento→cobro', 90, med(ostDias), 5)
check('Ostara — por cobrar (sin IVA)', 8830000, ostPend, 1000)

// ══ 5 · CUOTAS DE TARJETA ═════════════════════════════════════════════════
const hc=CUO[0]||[]
const iPer=hc.findIndex(h=>/persona/i.test(h)), iCuota=hc.findIndex(h=>/monto cuota/i.test(h))
const iAct=hc.findIndex(h=>/cuota actual/i.test(h)), iTotC=hc.findIndex(h=>/cuotas total/i.test(h))
let magmaPend=0, totalPend=0
CUO.slice(1).forEach(r=>{
  if(!r||!r.length)return
  const cuota=num(r[iCuota]), act=num(r[iAct]), tot=num(r[iTotC])
  const faltan=Math.max(0, tot-act)
  const pend=cuota*faltan
  totalPend+=pend
  if(/magma/i.test(txt(r[iPer]))) magmaPend+=pend
})
check('Cuotas de tarjeta pendientes — Magma', 489537, magmaPend, 500)
check('Cuotas de tarjeta pendientes — total', 2883337, totalPend, 2000)

// ══ RESULTADO ═════════════════════════════════════════════════════════════
console.log('\n████████ VERIFICACIÓN PRÁCTICA 3 ████████\n')
let fallos=0
for(const c of checks){
  const ok=c.ok
  if(!ok) fallos++
  const dec = typeof c.declarado==='number'&&c.declarado>1000 ? M(c.declarado) : String(c.declarado)
  const rea = typeof c.real==='number'&&c.real>1000 ? M(c.real) : String(Math.round(c.real*100)/100)
  console.log(`  ${ok?'\x1b[32m✓\x1b[0m':'\x1b[31m✗\x1b[0m'} ${c.etiqueta.padEnd(46)} publicado ${dec.padStart(16)}   real ${rea.padStart(16)}`)
}
console.log(`\n  ${fallos===0?'\x1b[32mTODO CIERRA\x1b[0m':`\x1b[31m${fallos} NÚMERO(S) NO CIERRAN — corregir antes de publicar\x1b[0m`}  (${checks.length} chequeos)\n`)
process.exit(fallos?1:0)
