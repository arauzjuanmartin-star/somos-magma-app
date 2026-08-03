// Snapshot financiero para las sesiones con la coach (Mariana Tardito).
// Corré: node scripts/snapshot-coach.mjs   → imprime el estado de números reales.
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const N=v=>{ if(typeof v==='number')return v; if(!v)return 0; const n=parseFloat(String(v).replace(/[^\d.-]/g,'')); return isNaN(n)?0:n }
const yes=v=>['SÍ','SI','TRUE','PAGADO','X','✓'].includes(String(v||'').toUpperCase().trim())||v===true
const HOY=new Date()
const toDate=v=>{ if(typeof v==='number'){ return new Date(Math.round((v-25569)*864e5)) } const m=String(v||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if(!m)return null; let y=+m[3]; if(y<100)y+=2000; return new Date(y,+m[2]-1,+m[1]) }
const yearOf=v=>{ const d=toDate(v); return d?d.getUTCFullYear?.()||d.getFullYear():0 }
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const get=async r=>(await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:r,valueRenderOption:'UNFORMATTED_VALUE'})).data.values||[]
const MES=(new Date()).getMonth()+1 // meses transcurridos 2026 (dinámico)

// ===== PRODUCCIÓN REAL (PROYECTOS) — la fuente confiable de margen =====
const py=await get('PROYECTOS!A:CF'); const ph=py[0].map(x=>String(x||''))
const iPF=ph.indexOf('Fecha Evento'), iPT=ph.findIndex(x=>x.trim()==='Total'||x.trim()==='Total '), iPFee=ph.indexOf('Fee Agencia'), iPDif=ph.indexOf('Diferencia')
// ojo: los pedidos 13-20 tienen los headers numerados ("Staff 13", "Precio 13"),
// por eso no alcanza con comparar por igualdad exacta — si no, se pierden ~$5M de costo.
const sC=[],pC=[]; ph.forEach((x,i)=>{ const h=x.trim(); if(/^Staff(\s+\d+)?$/.test(h))sC.push(i); if(/^Precio(\s+\d+)?$/.test(h))pC.push(i) })
let prod=0,costoFree=0,ganMagma=0,nPy=0
for(let i=1;i<py.length;i++){ const r=py[i]; if(!r||yearOf(r[iPF])!==2026)continue; nPy++; prod+=N(r[iPT])
  let sm=0,cf=0; for(let k=0;k<sC.length;k++){ const st=String(r[sC[k]]||'').trim(),pc=N(r[pC[k]]); if(!st||pc<=0)continue; if(st==='Somos Magma')sm+=pc; else cf+=pc }
  costoFree+=cf; ganMagma+=N(r[iPFee])+sm+N(r[iPDif]) }

// ===== COBRANZA (FACTURACION) — aging de lo que está en la calle =====
const fc=await get('FACTURACION!A:AI'); let cobrado=0,porCobrar=0
const aging={'0-30':0,'31-60':0,'61-90':0,'90+':0}
for(let i=1;i<fc.length;i++){ const r=fc[i]; if(!r||!r.some(c=>c!==''&&c!=null))continue
  const final=N(r[12]); if(yes(r[4])){ cobrado+=N(r[10]); continue }
  if(final<=0)continue; porCobrar+=final
  const f=toDate(r[19])||toDate(r[6])||toDate(r[15]); const d=f?Math.floor((HOY-f)/864e5):9999
  if(d<=30)aging['0-30']+=final; else if(d<=60)aging['31-60']+=final; else if(d<=90)aging['61-90']+=final; else aging['90+']+=final }

// ===== GASTOS FIJOS (mensualizado ARS, activos) =====
const gf=await get('GASTOS_FIJOS!A:L'); let gfMes=0; const det=[]
for(let i=1;i<gf.length;i++){ const r=gf[i]; if(!r||!yes(r[7]))continue
  const mo=N(r[2]),mon=String(r[3]||'ARS').toUpperCase(),fr=String(r[4]||'mensual').toLowerCase()
  if(mon.includes('USD'))continue; let m=mo; if(fr.includes('anual'))m/=12; else if(fr.includes('trimes'))m/=3; else if(fr.includes('semest'))m/=6
  gfMes+=m; if(m>40000)det.push(`    ${String(r[0]||'').padEnd(11)} ${String(r[1]||'').padEnd(22)} ${M(m)}/mes`) }

// ===== DEUDA + CAJA =====
const pr=await get('PRESTAMOS!A:K'); let prP=0,prC=0
for(let i=1;i<pr.length;i++){ const r=pr[i]; if(r&&!yes(r[6])){prP+=N(r[4]);prC++} }
const tj=await get('TARJETAS!A:N'); let tjP=0
for(let i=1;i<tj.length;i++){ const r=tj[i]; if(r&&!yes(r[7]))tjP+=N(r[4]) }
const cu=await get('CUENTAS!A:L'); let caja=0
for(let i=1;i<cu.length;i++){ const r=cu[i]; if(r&&yes(r[4]))caja+=N(r[5]) }

const resultadoMes=ganMagma/MES-gfMes
console.log(`╔══════════════════════════════════════════════════════╗`)
console.log(`║  SNAPSHOT FINANCIERO SOMOS MAGMA — al ${String(HOY.getDate()).padStart(2,'0')}/${String(HOY.getMonth()+1).padStart(2,'0')}/${HOY.getFullYear()}      ║`)
console.log(`╚══════════════════════════════════════════════════════╝`)
console.log(`\n■ PRODUCCIÓN 2026 (${nPy} proyectos, fuente: PROYECTOS)`)
console.log(`    Facturación/producción:  ${M(prod)}   (${M(prod/MES)}/mes)`)
console.log(`    Costo freelancers:       ${M(costoFree)}   (${M(costoFree/MES)}/mes)`)
console.log(`    GANANCIA MAGMA:          ${M(ganMagma)}   (${M(ganMagma/MES)}/mes)`)
console.log(`    Margen: ${Math.round(ganMagma/prod*100)}%`)
console.log(`\n■ COBRANZA — plata en la calle (lo NO cobrado, con IVA)`)
console.log(`    Cobrado 2026 (neto):     ${M(cobrado)}`)
console.log(`    POR COBRAR total:        ${M(porCobrar)}`)
console.log(`      0-30 días:  ${M(aging['0-30'])}`)
console.log(`      31-60 días: ${M(aging['31-60'])}`)
console.log(`      61-90 días: ${M(aging['61-90'])}`)
console.log(`      +90 días:   ${M(aging['90+'])}   ← plata vieja, riesgo`)
console.log(`\n■ ESTRUCTURA DE COSTOS FIJOS: ${M(gfMes)}/mes`)
det.sort().forEach(d=>console.log(d))
console.log(`\n■ DEUDA`)
console.log(`    Préstamos pendientes: ${M(prP)} (${prC} cuotas)`)
console.log(`    Tarjetas sin pagar:   ${M(tjP)}`)
console.log(`\n■ CAJA HOY: ${M(caja)}`)
console.log(`\n╔══════════════════════════════════════════════════════╗`)
console.log(`║  EL NÚMERO CLAVE — ¿cuánto deja Magma por mes?        ║`)
console.log(`╚══════════════════════════════════════════════════════╝`)
console.log(`    Ganancia Magma/mes:   ${M(ganMagma/MES)}`)
console.log(`    - Gastos fijos/mes:   ${M(gfMes)}  (incluye sueldos+alquiler+imp.)`)
console.log(`    = RESULTADO NETO/mes: ${M(resultadoMes)}  ${resultadoMes>=0?'✓ positivo':'✗ NEGATIVO'}`)
console.log(`\n    → Rentable en papel, pero ${M(porCobrar)} sin cobrar = problema de CAJA, no de rentabilidad.`)
