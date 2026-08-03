/**
 * Corrige el sueldo de socios en GASTOS_FIJOS a $3.000.000 (el acordado).
 * El $3.200.000 salía del recibo de sueldo de Juan (por hijo), no del acuerdo entre socios.
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
const NUEVO=3000000
const GAS=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'GASTOS_FIJOS',valueRenderOption:'FORMATTED_VALUE'})).data.values
const cambios=[]
GAS.slice(1).forEach((r,i)=>{ if(!r)return
  const con=txt(r[1])
  if(!/^sueldo\s+(juan|sofi)/i.test(con))return
  const actual=num(r[2])
  if(actual===NUEVO)return
  cambios.push({fila:i+2, con, actual}) })
console.log(`\n■ SUELDO DE SOCIOS EN GASTOS_FIJOS → ${M(NUEVO)}\n`)
if(!cambios.length){ console.log('   ya está en $3.000.000, nada que cambiar\n'); process.exit(0) }
cambios.forEach(c=>console.log(`   fila ${c.fila}  ${c.con.padEnd(16)} ${M(c.actual)}  →  ${M(NUEVO)}   (baja ${M(c.actual-NUEVO)})`))
const ahorro=cambios.reduce((s,c)=>s+(c.actual-NUEVO),0)
console.log(`\n   impacto en la estructura fija: ${M(ahorro)}/mes menos`)
if(!CONFIRMAR){ console.log(`\n   SIMULACIÓN — ejecutar con --confirmar\n`); process.exit(0) }
await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',
  data: cambios.map(c=>({range:`GASTOS_FIJOS!C${c.fila}`, values:[[NUEVO]]}))}})
console.log(`\n   ✓ ${cambios.length} filas corregidas\n`)
