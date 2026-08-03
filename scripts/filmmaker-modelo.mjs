/**
 * MODELO: ¿conviene un filmmaker fijo?
 * Limpia el outlier (fila 820, $27,1M mal cargados), separa equipo interno de
 * freelancers externos, y compara contra el costo real de un empleado en
 * relación de dependencia. Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const MES=['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const CAMARA=/film|c[aá]mara|camara|video|foto/i
const EDIT=/edit|edici|post|color/i
const INTERNO=/somos magma|sofia maria grenier|juan martin arauz|tom[aá]s halbach|luc[ií]a mar[ií]a grenier/i
const FILA_BASURA=820

const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PAGOS_STAFF',valueRenderOption:'FORMATTED_VALUE'})
const PAG=r.data.values||[]

const filas=[]
PAG.slice(1).forEach((row,i)=>{
  const fila=i+2; if(fila===FILA_BASURA) return
  const persona=txt(row[1]); if(!persona) return
  if(/2025|migrad/i.test(txt(row[11]))||/\/2025/.test(txt(row[0]))) return
  const monto=num(row[6])||num(row[7]); if(monto<=1) return
  const s=txt(row[5])
  const cls = EDIT.test(s)?'edicion' : CAMARA.test(s)?'camara' : 'otro'
  filas.push({fila,persona,mes:parseInt(txt(row[2]))||0,npresu:txt(row[3]),serv:s,monto,cls,
    interno:INTERNO.test(persona)})
})
const vistos=new Set()
const vivos=filas.filter(f=>{const k=`${f.persona}|${f.npresu}|${Math.round(f.monto)}`
  if(f.npresu&&vistos.has(k))return false; if(f.npresu)vistos.add(k); return true})

const MESES=[4,5,6,7] // meses con carga completa y representativa
const win=vivos.filter(f=>MESES.includes(f.mes))
const n=MESES.length
const ext=win.filter(f=>!f.interno), int=win.filter(f=>f.interno)
const suma=a=>a.reduce((s,f)=>s+f.monto,0)

console.log(`\n${'█'.repeat(72)}\n  GASTO REAL EN CÁMARA — abr a jul 2026 (sin la fila basura)\n${'█'.repeat(72)}`)
console.log(`\n  concepto                 por mes        total 4 meses`)
const camExt=ext.filter(f=>f.cls==='camara'), edExt=ext.filter(f=>f.cls==='edicion')
const camInt=int.filter(f=>f.cls==='camara')
console.log(`  Cámara freelance      ${money(suma(camExt)/n).padStart(12)}   ${money(suma(camExt)).padStart(14)}`)
console.log(`  Edición freelance     ${money(suma(edExt)/n).padStart(12)}   ${money(suma(edExt)).padStart(14)}`)
console.log(`  Cámara equipo interno ${money(suma(camInt)/n).padStart(12)}   ${money(suma(camInt)).padStart(14)}   ← Juan/Sofi filmando`)
console.log(`  ${'─'.repeat(52)}`)
console.log(`  TOTAL reemplazable    ${money((suma(camExt)+suma(edExt)+suma(camInt))/n).padStart(12)}   ${money(suma(camExt)+suma(edExt)+suma(camInt)).padStart(14)}`)

console.log(`\n  Quién factura cámara (externos, abr-jul):`)
const pp={}; camExt.forEach(f=>{const p=pp[f.persona]=pp[f.persona]||{t:0,n:0}; p.t+=f.monto; p.n++})
Object.entries(pp).sort((a,b)=>b[1].t-a[1].t).slice(0,8).forEach(([p,d])=>
  console.log(`   ${money(d.t).padStart(12)}  ${String(d.n).padStart(3)} jornadas  ${money(d.t/d.n).padStart(10)}/j   ${p}`))

// --- costo de un empleado ---
console.log(`\n${'█'.repeat(72)}\n  QUÉ CUESTA UN FIJO EN RELACIÓN DE DEPENDENCIA\n${'█'.repeat(72)}`)
const F_PATRONAL=0.244, F_ART=0.04, F_SAC=0.0833, F_VAC=0.038, F_INDEM=0.0833
const FACTOR=1+F_PATRONAL+F_ART+F_SAC+F_VAC+F_INDEM
const NETO=0.83
console.log(`  Factor costo empresa = 1 + patronales 24,4% + ART 4% + aguinaldo 8,33%`)
console.log(`                           + vacaciones 3,8% + provisión indemniz. 8,33%  =  ${FACTOR.toFixed(2)}x el bruto\n`)
console.log(`  neto bolsillo     bruto         costo empresa/mes    costo empresa/año`)
;[1500e3,1800e3,2100e3,2400e3].forEach(neto=>{
  const bruto=neto/NETO, costo=bruto*FACTOR
  console.log(`  ${money(neto).padStart(12)}  ${money(bruto).padStart(12)}   ${money(costo).padStart(15)}    ${money(costo*12).padStart(15)}`)})

// --- comparación ---
const ABSORBE_1FIJO=3936375 // de filmmaker-concurrencia.mjs (1 rodaje/día, precios de PROYECTOS)
const EDIC_ABSORBIBLE=suma(edExt)/n*0.6 // ~60% de la edición externa la puede hacer en días sin rodaje
console.log(`\n${'█'.repeat(72)}\n  EL NÚMERO: ahorro mensual según sueldo\n${'█'.repeat(72)}`)
console.log(`  Absorbe en rodaje (1 evento/día, 12,8 días/mes): ${money(ABSORBE_1FIJO)}/mes`)
console.log(`  + edición que hace en días libres (60%):          ${money(EDIC_ABSORBIBLE)}/mes`)
console.log(`  ${'─'.repeat(54)}`)
const ABSORBE=ABSORBE_1FIJO+EDIC_ABSORBIBLE
console.log(`  TOTAL que deja de pagarse afuera:                 ${money(ABSORBE)}/mes\n`)
console.log(`  neto bolsillo    costo empresa      AHORRO/mes       AHORRO/año`)
;[1500e3,1800e3,2100e3,2400e3].forEach(neto=>{
  const costo=neto/NETO*FACTOR, ah=ABSORBE-costo
  const flag=ah>0?'✓':'✗'
  console.log(`  ${money(neto).padStart(12)}  ${money(costo).padStart(15)}  ${money(ah).padStart(14)}  ${money(ah*12).padStart(15)}  ${flag}`)})
const breakeven=ABSORBE/FACTOR*NETO
console.log(`\n  PUNTO DE EQUILIBRIO: neto de bolsillo ${money(breakeven)} — arriba de eso, perdés plata.`)
