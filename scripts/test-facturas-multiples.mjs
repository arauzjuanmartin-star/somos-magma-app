/**
 * Verifica, contra el sheet REAL y sin escribir nada, que ubicar la factura por fila
 * agarra la correcta cuando un proyecto tiene adelanto + saldo.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { ubicarFilaFactura } from '../lib/factura-fila.js'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

const R=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'FACTURACION!A:AG',valueRenderOption:'FORMATTED_VALUE'})
const rows=R.data.values||[]; const h=rows[0]
const iP=h.indexOf('N° Presupuesto'), iF=h.indexOf('Precio FINAL'), iL=h.indexOf('Factura'), iN=h.indexOf('Nro de Factura')

let ok=0, fail=0
const check=(nombre,cond,detalle='')=>{ if(cond){ok++;console.log('  ✓ '+nombre)} else {fail++;console.log('  ✗ '+nombre+(detalle?' → '+detalle:''))} }

// El caso real con 2 filas
const porPresu={}
for(let i=1;i<rows.length;i++){const n=String(rows[i][iP]??'').trim(); if(n)(porPresu[n]||=[]).push(i+1)}
const multi=Object.entries(porPresu).filter(([,f])=>f.length>1)

console.log('== 1. Proyecto REAL con 2 facturas ==')
if(!multi.length){ console.log('  (no hay ninguno hoy — se prueba solo el resto)') }
for(const [nro,filas] of multi){
  console.log(`  #${nro} → filas ${filas.join(', ')}`)
  for(const f of filas){
    const u=ubicarFilaFactura({rows, fila:f, presupuestoNum:nro})
    check(`pedir fila ${f} devuelve la fila ${f} (${rows[f-1][iF]})`, u.fila===f, u.error)
  }
  const sinFila=ubicarFilaFactura({rows, presupuestoNum:nro})
  check('sin fila → error de ambiguo, NO elige a ciegas', !!sinFila.ambigua, JSON.stringify(sinFila).slice(0,80))
  const distintas=new Set(filas.map(f=>rows[f-1][iF]))
  check('cada fila tiene su propio monto', distintas.size===filas.length)
}

console.log('\n== 2. Proyecto con UNA sola factura (que no se rompa lo de siempre) ==')
const unico=Object.entries(porPresu).find(([,f])=>f.length===1 && String(rows[f[0]-1][iL]||'').trim())
const [nu,fu]=unico
const u1=ubicarFilaFactura({rows, presupuestoNum:nu})
check(`#${nu} sin fila sigue encontrando la fila ${fu[0]}`, u1.fila===fu[0], u1.error)
const u2=ubicarFilaFactura({rows, fila:fu[0], presupuestoNum:nu})
check('con fila devuelve la misma', u2.fila===fu[0], u2.error)

console.log('\n== 3. Guardas ==')
const otra=Object.entries(porPresu).find(([n])=>n!==nu)[1][0]
const g1=ubicarFilaFactura({rows, fila:otra, presupuestoNum:nu})
check('fila que ya no es de ese presupuesto → error, no escribe', !!g1.error && !g1.fila)
const g2=ubicarFilaFactura({rows, fila:99999, presupuestoNum:nu})
check('fila inexistente → error', !!g2.error && !g2.fila)
const g3=ubicarFilaFactura({rows, presupuestoNum:'000-no-existe'})
check('presupuesto inexistente → error', !!g3.error && !g3.fila)

console.log('\n== 4. Anuladas no cuentan como ambiguas ==')
const conAnulada=Object.entries(porPresu).filter(([,f])=>f.length>1 && f.some(x=>String(rows[x-1][iN]||'').toUpperCase().startsWith('ANULADA')))
console.log(conAnulada.length ? `  hay ${conAnulada.length} caso(s) con anulada` : '  (no hay casos hoy)')
const mk=(nro)=>{ const r=new Array(h.length).fill(''); r[iP]='7777'; r[iN]=nro; return r }
const fake=[h, mk('ANULADA - A-1'), mk('A-2')]
const uf=ubicarFilaFactura({rows:fake, presupuestoNum:'7777'})
check('con 1 anulada + 1 viva, encuentra la viva sin pedir fila', uf.fila===3, JSON.stringify(uf).slice(0,80))

console.log(`\n${fail===0?'TODO OK':'HAY FALLAS'} — ${ok} pasaron, ${fail} fallaron`)
process.exit(fail?1:0)
