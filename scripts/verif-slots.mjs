// Chequea que SLOT_PRESU/SLOT_PROY de lib/sheets.js apunten a la columna correcta del sheet real
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { MAX_SLOTS, SLOT_PRESU, SLOT_PROY, ANCHO_PRESU, ANCHO_PROY } from '../lib/sheets.js'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const b=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PRESUPUESTOS!A1:ER1','PROYECTOS!A1:ER1']})
const HP=b.data.valueRanges[0].values[0], HY=b.data.valueRanges[1].values[0]
let fallas=0
const chk=(real,esp,q)=>{ const ok=(real||'').trim()===esp || (esp==='Precio 1'&&(real||'').trim()==='Precio'); if(!ok){console.log(`   🔴 ${q}: el sheet dice "${real}" y esperaba "${esp}"`); fallas++} }
console.log(`MAX_SLOTS=${MAX_SLOTS} · ANCHO_PRESU=${ANCHO_PRESU} (sheet ${HP.length}) · ANCHO_PROY=${ANCHO_PROY} (sheet ${HY.length})\n`)
console.log('PRESUPUESTOS:')
for(let n=1;n<=MAX_SLOTS;n++){ const s=SLOT_PRESU(n); chk(HP[s.pedido],`Pedido ${n}`,`slot ${n} pedido`); chk(HP[s.precio],`Precio ${n}`,`slot ${n} precio`) }
console.log('PROYECTOS:')
for(let n=1;n<=MAX_SLOTS;n++){ const s=SLOT_PROY(n); chk(HY[s.pedido],`Pedido ${n}`,`slot ${n} pedido`)
  const pr=(HY[s.precio]||'').trim(), st=(HY[s.staff]||'').trim()
  if(pr!==`Precio ${n}` && pr!=='Precio'){console.log(`   🔴 slot ${n} precio: "${pr}"`);fallas++}
  if(st!==`Staff ${n}` && st!=='Staff'){console.log(`   🔴 slot ${n} staff: "${st}"`);fallas++} }
console.log(fallas===0?'\n✅ Los 40 slots de las dos solapas apuntan a la columna correcta':`\n🔴 ${fallas} desalineaciones`)
process.exit(fallas?1:0)
