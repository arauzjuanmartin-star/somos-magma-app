/** Reclasifica el PUENTE (compra de facturas) de Impuestos → Financieros. Criterio Mariana 14/08/2026. */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('='); let v=l.slice(i+1).trim(); if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1); return [l.slice(0,i).trim(),v]}))
const auth = new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets = google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')

const r = await sheets.spreadsheets.values.get({spreadsheetId:ID, range:'GASTOS_FIJOS!A1:S300'})
const rows=r.data.values||[]; const H=rows[0]
const iCat=H.indexOf('Categoria'), iTipo=H.indexOf('Tipo'), iCon=H.indexOf('Concepto')
const targets=[]
rows.forEach((f,i)=>{ if(i && /^puente/i.test(String(f[iCon]||'').trim())) targets.push({fila:i+1, con:f[iCon], cat:f[iCat], tipo:f[iTipo], monto:f[2]}) })

console.log(`\n=== ${ESCRIBIR?'ESCRIBIENDO':'PREVIEW'} — ${targets.length} filas ===`)
targets.forEach(t=>console.log(`  fila ${t.fila}  ${t.con} ($${t.monto})   Categoria: "${t.cat}" → "Financieros"   Tipo: "${t.tipo}" → "financiero"`))
if(!ESCRIBIR){ console.log('\n(nada escrito — correr con --escribir)'); process.exit(0) }

const col=n=>String.fromCharCode(65+n)
const data=targets.flatMap(t=>[
  {range:`GASTOS_FIJOS!${col(iCat)}${t.fila}`, values:[['Financieros']]},
  {range:`GASTOS_FIJOS!${col(iTipo)}${t.fila}`, values:[['financiero']]},
])
await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID, requestBody:{valueInputOption:'USER_ENTERED', data}})
const v = await sheets.spreadsheets.values.get({spreadsheetId:ID, range:'GASTOS_FIJOS!A1:S300'})
console.log('\n=== VERIFICACIÓN (releído del sheet) ===')
targets.forEach(t=>{ const f=v.data.values[t.fila-1]; console.log(`  fila ${t.fila}  ${f[iCon]}  Categoria=${f[iCat]}  Tipo=${f[iTipo]}  Monto=${f[2]}`) })
