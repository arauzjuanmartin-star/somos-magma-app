/**
 * Carga en GASTOS_FIJOS los costos bancarios extraídos del extracto BBVA (punto A.4 de Mariana).
 * Mariana: "los costos bancarios por la operatoria habitual son de ESTRUCTURA, no financieros"
 * → las comisiones van como Operativos; el impuesto ley 25.413 como Impuestos.
 * NO se carga el SIRCREB: es retención de IIBB (pago a cuenta), no un gasto.
 * Requiere --confirmar.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const CONFIRMAR=process.argv.includes('--confirmar')
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
// GASTOS_FIJOS: [0]Categoria [1]Concepto [2]Monto [3]Moneda [4]Frecuencia [5]Dia pago [6]Persona/Cuenta [7]Activo [8]Observacion [9]Mes carga
const NUEVAS=[
 ['Operativos','Costos bancarios BBVA (comisiones + IVA)',17739,'ARS','mensual','','BBVA Somos Magma','SI','Extraído del extracto CC 118-029419/7 jun-jul 2026. Estructura, no financiero (criterio Mariana).','07-2026'],
 ['Impuestos','Impuesto ley 25.413 (débitos y créditos)',507000,'ARS','mensual','','BBVA Somos Magma','SI','Promedio jun-jul 2026. Varía con el volumen. El 33% se computa contra Ganancias.','07-2026'],
]
const GAS=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'GASTOS_FIJOS',valueRenderOption:'FORMATTED_VALUE'})).data.values
const yaHay=GAS.slice(1).filter(r=>r&&/costos bancarios BBVA|ley 25\.413/i.test(txt(r[1])))
console.log(`\n■ CARGAR COSTOS BANCARIOS EN GASTOS_FIJOS\n`)
console.log(`   ${'categoría'.padEnd(12)}${'concepto'.padEnd(44)}${'monto/mes'.padStart(13)}`)
NUEVAS.forEach(n=>console.log(`   ${n[0].padEnd(12)}${n[1].padEnd(44)}${M(n[2]).padStart(13)}`))
console.log(`\n   suman ${M(NUEVAS.reduce((s,n)=>s+n[2],0))}/mes`)
if(yaHay.length){ console.log(`\n   ⚠️ ya existen ${yaHay.length} líneas similares — abortando para no duplicar`); process.exit(1) }
const antes=GAS.slice(1).reduce((s,r)=>{ if(!r||!/^s/i.test(txt(r[7])))return s
  const mon=txt(r[3]||'ARS').toUpperCase(); if(mon.includes('USD'))return s
  let m=num(r[2]); const fr=txt(r[4]||'mensual').toLowerCase()
  if(fr.includes('anual'))m/=12; else if(fr.includes('trimes'))m/=3; else if(fr.includes('semest'))m/=6
  return s+m },0)
console.log(`\n   estructura fija antes:   ${M(antes)}`)
console.log(`   estructura fija después: ${M(antes+NUEVAS.reduce((s,n)=>s+n[2],0))}`)
if(!CONFIRMAR){ console.log(`\n   SIMULACIÓN — ejecutar con --confirmar\n`); process.exit(0) }
await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'GASTOS_FIJOS!A:J',
  valueInputOption:'USER_ENTERED',insertDataOption:'INSERT_ROWS',requestBody:{values:NUEVAS}})
console.log(`\n   ✓ ${NUEVAS.length} líneas cargadas\n`)
