/**
 * PRACTICA 3 — punto 6: "Sacar la cuenta del filmmaker fijo con edición:
 * 14 jornales + 7 videos — cuánto hay que facturar para que cierre."
 *
 * Método: mismo prorrateo que scripts/margen-por-servicio.mjs (el sheet NO guarda
 * precio de venta por servicio: el fee del proyecto se reparte entre sus líneas
 * según el peso de cada una). Así saco venta y costo REALES por línea de cámara
 * y de edición, y con eso armo el paquete de 14 jornales + 7 videos.
 * Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const SUELDOS = (process.argv.find(a=>a.startsWith('--sueldos='))?.split('=')[1] || '1600000,1900000,2200000,2500000').split(',').map(Number)

const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
function norm(p){const s=txt(p).toLowerCase().replace(/[^\wáéíóúñ\s½]/g,'').trim()
  if(/edit|edici/.test(s))return 'Edición'
  if(/foto/.test(s))return /1\/2|½|medi/.test(s)?'Foto ½':'Foto 1'
  if(/video/.test(s))return /1\/2|½|medi/.test(s)?'Video ½':'Video 1'
  if(/film/.test(s))return /1\/2|½|medi/.test(s)?'Film ½':'Film 1'
  return txt(p).slice(0,16)||'(otros)'
}

const R=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS',valueRenderOption:'FORMATTED_VALUE'})
const PRO=R.data.values, H=PRO[0]
const iTot=H.findIndex(x=>txt(x)==='Total'), iFee=H.indexOf('Fee Agencia'), iDif=H.indexOf('Diferencia')
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]

const S={}
PRO.slice(1).forEach(r=>{
  const f=fecha(r[3]); if(!f||f.getFullYear()!==2026)return
  const margenProy=num(r[iFee])+num(r[iDif])
  const lineas=[]
  PED.forEach(c=>{const p=txt(r[c]); if(!p)return; const v=num(r[c+1]); const pers=txt(r[c+2])
    if(v<=1)return
    lineas.push({k:norm(p), v, magma:/somos magma/i.test(pers)})})
  if(!lineas.length)return
  const pesoTotal=lineas.reduce((s,l)=>s+l.v,0)
  let margenExtra=margenProy
  lineas.forEach(l=>{ if(l.magma) margenExtra+=l.v })
  lineas.forEach(l=>{
    const share = l.v/pesoTotal
    S[l.k]=S[l.k]||{veces:0,costo:0,venta:0}
    S[l.k].veces++
    S[l.k].costo += l.magma?0:l.v
    S[l.k].venta += l.v + margenExtra*share
  })
})

const u = k => S[k] ? { venta: S[k].venta/S[k].veces, costo: S[k].costo/S[k].veces, veces: S[k].veces } : null

console.log('\n═══ UNITARIOS REALES POR LÍNEA (PROYECTOS 2026) ═══')
for (const k of ['Video 1','Film 1','Edición','Video ½','Film ½']) {
  const x = u(k); if (!x) continue
  console.log(`  ${k.padEnd(10)} ${String(x.veces).padStart(4)} líneas   venta ${M(x.venta).padStart(12)}   costo ${M(x.costo).padStart(12)}   margen ${((1-x.costo/x.venta)*100).toFixed(0)}%`)
}

// jornada entera de cámara = promedio ponderado Video 1 + Film 1
const v1=u('Video 1'), f1=u('Film 1'), ed=u('Edición')
const nCam = v1.veces + f1.veces
const camVenta = (v1.venta*v1.veces + f1.venta*f1.veces)/nCam
const camCosto = (v1.costo*v1.veces + f1.costo*f1.veces)/nCam

console.log(`\n  ► JORNADA ENTERA DE CÁMARA (Video 1 + Film 1, ${nCam} líneas)`)
console.log(`      venta ${M(camVenta)}  ·  costo freelance ${M(camCosto)}  ·  margen ${((1-camCosto/camVenta)*100).toFixed(0)}%`)
console.log(`  ► EDICIÓN (${ed.veces} líneas)`)
console.log(`      venta ${M(ed.venta)}  ·  costo freelance ${M(ed.costo)}  ·  margen ${((1-ed.costo/ed.venta)*100).toFixed(0)}%`)

const ventaPaq = 14*camVenta + 7*ed.venta
const costoAfuera = 14*camCosto + 7*ed.costo

console.log('\n════════════════════════════════════════════════════════════════')
console.log('  EL PAQUETE: 14 JORNALES + 7 VIDEOS POR MES')
console.log('════════════════════════════════════════════════════════════════')
console.log(`  FACTURACIÓN que representa:`)
console.log(`     14 jornales × ${M(camVenta)}  = ${M(14*camVenta)}`)
console.log(`      7 videos   × ${M(ed.venta)}  = ${M(7*ed.venta)}`)
console.log(`     ─────────────────────────────────────────────`)
console.log(`     ${M(ventaPaq)} / mes   ·   ${M(ventaPaq*12)} / año`)
console.log(`\n  COSTO si lo comprás afuera (freelancers):  ${M(costoAfuera)} / mes`)

console.log('\n  ── ESCENARIOS DE SUELDO ──')
console.log('   sueldo/mes      ahorro vs freelance       ahorro/año    margen del paquete   piso (jorn/mes)')
for (const s of SUELDOS) {
  const ahorro=costoAfuera-s, margen=(ventaPaq-s)/ventaPaq, piso=s/camCosto
  console.log(`  ${M(s).padStart(12)} ${M(ahorro).padStart(20)} ${M(ahorro*12).padStart(16)} ${(margen*100).toFixed(0).padStart(17)}% ${piso.toFixed(1).padStart(15)}`)
}

console.log('\n  ── CUÁNTO HAY QUE FACTURAR PARA QUE CIERRE ──')
console.log('  (dos lecturas: el piso contra freelance, y la facturación que sostiene el paquete)')
for (const s of SUELDOS) {
  const piso=s/camCosto
  const factPiso = piso*camVenta
  console.log(`  sueldo ${M(s).padStart(12)}: se paga solo con ${piso.toFixed(1)} jornadas/mes → ${M(factPiso)}/mes facturados`)
}

console.log('\n  ── REALITY CHECK ──')
console.log('  Magma hace 37,2 jornadas de cámara/mes repartidas en solo 13,6 días de rodaje.')
console.log('  14 jornales/mes = estar en PRÁCTICAMENTE TODOS los días de rodaje del mes. Cero colchón.')
console.log('  El techo físico de una persona es ~13,6 jornadas. 14 es el límite, no el promedio.')
