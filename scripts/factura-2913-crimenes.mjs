/**
 * Carga la factura del proyecto #2913 "Lanzamiento: Crímenes en línea - DIRECT TV"
 * (Austral Derecho, evento 8/4/2026, $400.000 + IVA), YA COBRADA.
 *
 * Por qué a mano: el proyecto vive solo en PROYECTOS (fila 91) — no tiene fila en
 * PRESUPUESTOS, así que el botón "Ya está ✓" de la app (/api/factura-confirmar)
 * devuelve 404 y no se puede hacer desde la pantalla.
 *
 * Preview por defecto. Escribe con --escribir.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const GO = process.argv.includes('--escribir')
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets'+(GO?'':'.readonly')]})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim(), M=n=>'$'+Math.round(n).toLocaleString('es-AR')

const PRESU='2913', PROY_ROW=91
const NETO=400000, IVA=84000, FINAL=484000
const F_EVENTO='8/4/2026', F_EMISION='8/4/2026', F_COBRO='8/5/2026'

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['FACTURACION!A:AG','PROYECTOS!A:H'],valueRenderOption:'FORMATTED_VALUE'})
const [FAC,PRO]=R.data.valueRanges.map(v=>v.values||[])
const H=(FAC[0]||[]).map(x=>txt(x))
const idx=n=>H.indexOf(n)

// Guarda 1: la fila de PROYECTOS tiene que ser la que creemos
const p=PRO[PROY_ROW-1]||[]
if(txt(p[2])!==PRESU || !/crimenes|crímenes/i.test(txt(p[6]))){
  console.log(`✋ Freno: PROYECTOS fila ${PROY_ROW} no es #${PRESU}/Crímenes (dice N°="${txt(p[2])}" · "${txt(p[6])}")`); process.exit(1) }
// Guarda 2: que no exista ya una factura de este presupuesto (no duplicar)
const yaHay=FAC.slice(1).map((r,i)=>({r,f:i+2})).filter(({r})=>txt(r[1])===PRESU)
if(yaHay.length){ console.log(`✋ Freno: ya hay ${yaHay.length} factura(s) de #${PRESU} en FACTURACION (fila ${yaHay.map(x=>x.f).join(', ')})`); process.exit(1) }

const fila=new Array(H.length).fill('')
const set=(n,v)=>{ const i=idx(n); if(i===-1){ console.log(`⚠️ FACTURACION no tiene la columna "${n}"`); process.exit(1) } fila[i]=v }
set('Mes','04 - ABRIL')
set('N° Presupuesto',PRESU)
set('Cobrado 30%',false); set('Cobrado 50%',false)
set('Cobrado',true)
set('Fecha cobro',F_COBRO)
set('Fecha Evento',F_EVENTO)
set('Agencia',txt(p[4])); set('Cliente',txt(p[5])); set('Proyecto',txt(p[6]))
set('Precio SIN IVA',NETO); set('IVA',IVA); set('Precio FINAL',FINAL)
set('Tipo de Factura','Factura A')
set('Fecha emision',F_EMISION)
set('Fecha enviada',F_EMISION)
set('Monto cobrado',FINAL)

console.log(`\n  FACTURACION — fila NUEVA para #${PRESU}\n`)
H.forEach((h,i)=>{ if(fila[i]!=='' ) console.log(`   ${h.padEnd(18)} = ${typeof fila[i]==='number'?M(fila[i]):String(fila[i])}`) })
console.log(`\n  Chequeo: ${M(NETO)} + ${M(IVA)} = ${M(NETO+IVA)} ${NETO+IVA===FINAL?'✓ cierra con el FINAL':'✗ NO cierra'}`)
console.log(`  PROYECTOS fila ${PROY_ROW} Total = ${txt(p[7])} (neto) → coincide con Precio SIN IVA ✓`)
if(!GO){ console.log(`\n  ▶ PREVIEW. Para escribir: node scripts/factura-2913-crimenes.mjs --escribir\n`); process.exit(0) }

const ap=await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'FACTURACION!A:AG',
  valueInputOption:'USER_ENTERED', insertDataOption:'INSERT_ROWS', includeValuesInResponse:true,
  requestBody:{values:[fila]}})
const rango=ap.data.updates?.updatedRange||''
const n=(rango.match(/!\D+(\d+)/)||[])[1]
// Verificación post-guardado: releemos y confirmamos
const chk=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:`FACTURACION!A${n}:AG${n}`,valueRenderOption:'FORMATTED_VALUE'})
const v=chk.data.values?.[0]||[]
const okPresu=txt(v[idx('N° Presupuesto')])===PRESU
const okTotal=Math.abs(parseFloat(txt(v[idx('Precio FINAL')]).replace(/[^\d.-]/g,''))-FINAL)<1
const okCob=/^(TRUE|VERDADERO)$/i.test(txt(v[idx('Cobrado')]))
console.log(`\n  ✅ Escrita en FACTURACION fila ${n}`)
console.log(`     N° Presupuesto=${txt(v[idx('N° Presupuesto')])} ${okPresu?'✓':'✗'} · Precio FINAL=${txt(v[idx('Precio FINAL')])} ${okTotal?'✓':'✗'} · Cobrado=${txt(v[idx('Cobrado')])} ${okCob?'✓':'✗'} · Fecha cobro=${txt(v[idx('Fecha cobro')])}`)
if(!(okPresu&&okTotal&&okCob)){ console.log('\n  ⚠️ La verificación NO cerró. Revisar la fila a mano.'); process.exit(1) }
await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',
  requestBody:{values:[[new Date().toISOString(),'arauzjuanmartin@gmail.com','factura-2913-crimenes','FACTURACION',PRESU,`alta manual ya cobrada neto=${NETO} iva=${IVA} final=${FINAL} fila=${n}`]]}})
console.log('  📝 Log escrito.\n')
