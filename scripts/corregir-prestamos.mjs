/**
 * Correcciones a PRESTAMOS pedidas por Sofi (revisión de la Práctica 2, 01/08/2026):
 *  1. La cuota Galicia SGR $11,5M del 28/07 ($818.210) ya se pagó → marcarla.
 *  2. Cargar el DUEÑO REAL de cada préstamo (quién usó la plata), que es distinto
 *     de a nombre de quién está. Todos están a nombre de Sofía menos el BBVA.
 * Requiere --confirmar.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const CONFIRMAR=process.argv.includes('--confirmar')
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
// dueño REAL declarado por Sofi
const DUENO={
 'Galicia SGR $11,5M':'Magma (a nombre de Sofía)',
 'Galicia SGR $15M':'Magma (a nombre de Sofía)',
 'BBVA':'Magma (a nombre de Magma)',
 'Santander #810-03510008128/6':'50% Magma / 50% Sofía (a nombre de Sofía)',
 'Santander #810-03510008035/1':'Sofía (a nombre de Sofía)',
}
const PRE=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PRESTAMOS',valueRenderOption:'FORMATTED_VALUE'})).data.values

console.log('\n■ 1 · MARCAR PAGADA la cuota Galicia SGR $11,5M del 28/07\n')
const pagar=[]
PRE.slice(1).forEach((r,i)=>{ if(!r)return
  if(txt(r[0])!=='Galicia SGR $11,5M')return
  if(txt(r[3])!=='28/7/2026')return
  if(/^s/i.test(txt(r[6])))return
  pagar.push({fila:i+2, monto:num(r[4]), cuota:txt(r[1])}) })
pagar.forEach(p=>console.log(`   fila ${p.fila}  ${p.cuota}  ${M(p.monto)}  →  Pagado = SI, fecha 28/7/2026`))
if(!pagar.length) console.log('   (ya está marcada)')

console.log('\n■ 2 · CARGAR EL DUEÑO REAL de cada préstamo (columna Deudor)\n')
const cambios=[]
PRE.slice(1).forEach((r,i)=>{ if(!r||!txt(r[0]))return
  const p=txt(r[0]); const nuevo=DUENO[p]; if(!nuevo)return
  if(txt(r[12])===nuevo)return
  cambios.push({fila:i+2, prestamo:p, antes:txt(r[12])||'(vacío)', nuevo}) })
const porPrestamo={}
cambios.forEach(c=>{ porPrestamo[c.prestamo]=porPrestamo[c.prestamo]||{n:0,antes:c.antes,nuevo:c.nuevo}; porPrestamo[c.prestamo].n++ })
Object.entries(porPrestamo).forEach(([p,v])=>
  console.log(`   ${p.padEnd(32)} ${String(v.n).padStart(3)} filas   "${v.antes}"  →  "${v.nuevo}"`))
console.log(`\n   ${cambios.length} filas a actualizar`)

if(!CONFIRMAR){ console.log(`\n   SIMULACIÓN — ejecutar con --confirmar\n`); process.exit(0) }
const data=[]
pagar.forEach(p=>{ data.push({range:`PRESTAMOS!G${p.fila}`,values:[['SI']]}); data.push({range:`PRESTAMOS!H${p.fila}`,values:[['28/7/2026']]}) })
cambios.forEach(c=>data.push({range:`PRESTAMOS!M${c.fila}`,values:[[c.nuevo]]}))
for(let i=0;i<data.length;i+=100){
  await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data:data.slice(i,i+100)}})
}
console.log(`\n   ✓ ${pagar.length} cuota(s) marcada(s) pagada(s) · ${cambios.length} dueños cargados\n`)
