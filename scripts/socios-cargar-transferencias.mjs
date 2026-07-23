/**
 * Crea la solapa SOCIOS_MOVIMIENTOS (cuenta corriente de socios) y carga lo que
 * Magma le transfirió a Juan (BBVA + Banco Ciudad). Base para la cuenta de quién
 * le debe a quién. Preview + --go.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const GO=process.argv.includes('--go')
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const TAB='SOCIOS_MOVIMIENTOS'
const HEAD=['Fecha','Socio','Dirección','Concepto','Monto','Cuenta','Referencia','Notas','Fuente']

// [fecha, socio, dirección, concepto, monto, cuenta, referencia]
// Dirección: "Magma→Socio" = Magma le pagó al socio · "Socio→Magma" = el socio puso plata
const MOV=[
  // Banco Ciudad — PAGO DE HABERES (sueldo)
  ['18/5/2026','Juan','Magma→Socio','Sueldo (haberes)',3200000,'Banco Ciudad Juan','Haberes 99999999'],
  ['2/6/2026','Juan','Magma→Socio','Sueldo (haberes)',3200000,'Banco Ciudad Juan','Haberes 99999999'],
  ['29/6/2026','Juan','Magma→Socio','Sueldo (haberes)',2000000,'Banco Ciudad Juan','Haberes 99999999'],
  ['8/7/2026','Juan','Magma→Socio','Sueldo (haberes)',2000000,'Banco Ciudad Juan','Haberes 99999999'],
  ['17/7/2026','Juan','Magma→Socio','Sueldo (haberes)',1500000,'Banco Ciudad Juan','Haberes 99999999'],
  // BBVA — desde SOMOS MAGMA SRL
  ['25/3/2026','Juan','Magma→Socio','Pago (PAGPROV)',300000,'BBVA Juan','PAGPROVDN Somos Magma SRL'],
  ['14/4/2026','Juan','Magma→Socio','Pago (DEBIN)',1500000,'BBVA Juan','DEBIN Somos Magma SRL'],
  ['15/4/2026','Juan','Magma→Socio','Pago (DEBIN)',785000,'BBVA Juan','DEBIN Somos Magma SRL'],
  // Este NO es de Magma: viene de Grenier/Basavilbaso (Sofi). Se registra aparte.
  ['13/4/2026','Juan','Sofi→Juan','Transferencia de Sofi (revisar: ¿es de Magma?)',260000,'BBVA Juan','TRANSFER Grenier/Basavilbaso'],
]

const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties(title,sheetId))'})
const existe=meta.data.sheets.find(s=>s.properties.title===TAB)

console.log(`\n${GO?'APLICANDO':'PREVIEW'} — cuenta corriente de socios\n`)
console.log(`Solapa ${TAB}: ${existe?'ya existe':'se crea'}`)
console.log(`\n${HEAD.slice(0,5).join(' · ')}`)
const deMagma=MOV.filter(m=>m[2]==='Magma→Socio')
MOV.forEach(m=>console.log(`   ${m[0].padEnd(11)} ${m[1].padEnd(5)} ${m[2].padEnd(12)} ${money(m[4]).padStart(13)}  ${m[3]}`))
console.log(`\n   Magma → Juan (total): ${money(deMagma.reduce((s,m)=>s+m[4],0))} en ${deMagma.length} pagos`)
console.log(`   + 1 transferencia de Sofi ($260.000) a revisar`)
console.log(`\n   ⚠️ Banco Ciudad no dejó ver antes de mayo. Puede faltar histórico anterior.`)

if(!GO){ console.log(`\nPara aplicar: node scripts/socios-cargar-transferencias.mjs --go\n`); process.exit(0) }

if(!existe){
  await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[{addSheet:{properties:{title:TAB}}}]}})
  console.log(`\n✓ solapa ${TAB} creada`)
}
await sheets.spreadsheets.values.update({spreadsheetId:ID,range:`${TAB}!A1`,valueInputOption:'RAW',requestBody:{values:[HEAD]}})
const rows=MOV.map(m=>[m[0],m[1],m[2],m[3],m[4],m[5],m[6],'','Registro Juan 24/07/2026 (screenshots home banking)'])
await sheets.spreadsheets.values.append({spreadsheetId:ID,range:`${TAB}!A:I`,valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:rows}})
console.log(`✓ ${rows.length} movimientos cargados`)
