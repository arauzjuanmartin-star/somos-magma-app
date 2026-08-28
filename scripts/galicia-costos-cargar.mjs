/**
 * Carga los costos bancarios de Galicia en GASTOS_FIJOS, leídos de los extractos
 * CSV de las tres cuentas de Sofi (cta cte 990510864, caja de ahorro 401448782124
 * y caja de ahorro USD 400487042125), período 28/07 a 28/08/2026.
 *
 * Es el pendiente más viejo de Mariana: viene de la Práctica 2. Hasta ahora solo
 * estaban los costos de BBVA.
 *
 * Uso:  node scripts/galicia-costos-cargar.mjs             (preview)
 *       node scripts/galicia-costos-cargar.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim(); if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1)
  return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR=process.argv.includes('--escribir')
const fmt=n=>'$'+Math.round(n).toLocaleString('es-AR')
const num=v=>{const n=parseFloat(String(v).replace(/[^0-9.-]/g,''));return isNaN(n)?0:n}

// Del extracto, agrupado por concepto. Los montos son del período 28/07-28/08/2026.
const NUEVOS=[
  {con:'Costos bancarios Galicia — SIRCREB', monto:102492.44, cuenta:'Galicia Sofi (CA 401448782124)',
   obs:'Ingresos Brutos sobre créditos (REG.RECAU.SIRCREB), 3 retenciones del 03 y 07/08/2026. Es percepción: se computa a cuenta de IIBB.'},
  {con:'Costos bancarios Galicia — comisión de cuenta', monto:75000, cuenta:'Galicia Sofi (CC 990510864)',
   obs:'Comisión servicio de cuenta corriente, período julio 2026.'},
  {con:'Costos bancarios Galicia — IVA', monto:15756.24, cuenta:'Galicia Sofi (CC 990510864)',
   obs:'IVA sobre la comisión de cuenta y los intereses, período julio 2026.'},
  {con:'Costos bancarios Galicia — IIBB sobre cuotas de préstamo', monto:21700.58, cuenta:'Galicia Sofi (CC 990510864)',
   obs:'IIBB que el banco debita junto a cada cuota de préstamo, aparte del cronograma de PRESTAMOS (cuota 18 $6.703,98 + cuota 3 $14.996,60). No está en Capital/Interes/Impuestos.'},
]
// Este se carga aparte porque puede solaparse con lo que ya hay
const DUDOSO={con:'Costos bancarios Galicia — Ley 25.413', monto:5453.98, cuenta:'Galicia Sofi (CC 990510864)',
  obs:'Impuesto al débito de las cuentas de Galicia (28/07 y 03/08/2026).'}

const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'GASTOS_FIJOS!A:Z'})
const V=r.data.values||[], H=V[0]
const iCon=H.indexOf('Concepto'), iMon=H.indexOf('Monto'), iAct=H.indexOf('Activo')
const yaEsta=c=>V.slice(1).some(f=>String(f[iCon]||'').trim().toLowerCase()===c.toLowerCase())
const pendientes=NUEVOS.filter(g=>!yaEsta(g.con))

console.log(`\nCOSTOS BANCARIOS DE GALICIA · período 28/07 a 28/08/2026\n`)
console.log(`${'CONCEPTO'.padEnd(52)} ${'MONTO'.padStart(12)}`)
console.log('-'.repeat(70))
NUEVOS.forEach(g=>console.log(`${g.con.padEnd(52)} ${fmt(g.monto).padStart(12)}  ${yaEsta(g.con)?'(ya está)':''}`))
const tot=pendientes.reduce((s,g)=>s+g.monto,0)
console.log('-'.repeat(70))
console.log(`${'TOTAL A CARGAR'.padEnd(52)} ${fmt(tot).padStart(12)}\n`)

// lo que ya hay cargado de bancos, para no duplicar
const yaBanc=V.slice(1).filter(f=>/costos bancarios|ley 25\.?413|d[eé]bitos y cr[eé]ditos/i.test(String(f[iCon]||'')))
console.log('Lo que YA está cargado de costos bancarios:')
yaBanc.forEach(f=>console.log(`   ${String(f[iCon]).slice(0,50).padEnd(51)} ${fmt(num(f[iMon])).padStart(12)}`))
console.log(`\n⚠ NO cargo "${DUDOSO.con}" (${fmt(DUDOSO.monto)}): ya existe`)
console.log(`  "Impuesto ley 25.413 (débitos y créditos) ${fmt(507000)}" y no sé si ese número`)
console.log(`  es solo de BBVA o de todas las cuentas. Si es solo BBVA, hay que sumarlo.\n`)

if(!pendientes.length){ console.log('Nada nuevo para cargar.'); process.exit(0) }
if(!ESCRIBIR){ console.log('--- PREVIEW. Nada escrito. Correr con --escribir. ---'); process.exit(0) }

const set=o=>{const f=new Array(H.length).fill(''); Object.entries(o).forEach(([k,v])=>{const i=H.indexOf(k); if(i>=0)f[i]=v}); return f}
await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'GASTOS_FIJOS!A:Z',valueInputOption:'USER_ENTERED',
  insertDataOption:'INSERT_ROWS',requestBody:{values:pendientes.map(g=>set({
    'Categoria':'Financieros','Concepto':g.con,'Monto':g.monto,'Moneda':'ARS','Frecuencia':'mensual',
    'Persona/Cuenta':g.cuenta,'Activo':'SI','Medio de pago':'Débito automático','Tipo':'Costos bancarios',
    'Observacion':g.obs+' Del extracto CSV de Galicia, 28/07-28/08/2026.'}))}})

const v2=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'GASTOS_FIJOS!A:Z',valueRenderOption:'UNFORMATTED_VALUE'})
const V2=v2.data.values||[], H2=V2[0]
const car=V2.slice(1).filter(f=>/costos bancarios galicia/i.test(String(f[H2.indexOf('Concepto')]||'')))
const sum=car.reduce((s,f)=>s+Number(f[H2.indexOf('Monto')]||0),0)
console.log(`✓ ${car.length} filas cargadas (esperadas ${pendientes.length})`)
car.forEach(f=>console.log(`   ${String(f[H2.indexOf('Concepto')]).slice(0,52).padEnd(53)} ${fmt(Number(f[H2.indexOf('Monto')])).padStart(12)}  ${f[H2.indexOf('Medio de pago')]}`))
console.log(`   ${'suma'.padEnd(53)} ${fmt(sum).padStart(12)} ${Math.abs(sum-tot)<1?'✓ = lo calculado':'✗ NO CIERRA'}`)
try{ await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',
  requestBody:{values:[[new Date().toISOString(),'juan (script)','galicia-costos-cargar','GASTOS_FIJOS',String(car.length),fmt(sum)]]}}) }catch(e){}
