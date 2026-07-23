/**
 * Reemplaza los montos reconstruidos del Santander $7,5M por los REALES del banco
 * (cuotas 11-18, del detalle "Todas las cuotas"). Recalcula el capital para que
 * capital+interés+impuestos == monto real exacto. Preview + --go.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const GO=process.argv.includes('--go')
const txt=v=>String(v??'').trim()
const num=v=>{const s=txt(v).replace(/[^\d.]/g,'');return parseFloat(s)||0}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const colL=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);}return s}

// Montos reales del banco (Santander $7,5M, cuotas pendientes 11-18)
const REAL={11:695812.24,12:691492.12,13:686836.91,14:682159.58,15:677046.89,16:671821.40,17:666241.78,18:660307.98}

const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PRESTAMOS'})
const P=r.data.values||[], H=P[0]
const i=n=>H.findIndex(h=>txt(h).toLowerCase()===n.toLowerCase())

const updates=[]
console.log(`\n${GO?'APLICANDO':'PREVIEW'} — Santander $7,5M, montos reales:\n`)
P.forEach((row,idx)=>{
  if(idx===0||!/08128/.test(txt(row[i('Prestamo')])))return
  const m=txt(row[i('Cuota nro')]).match(/(\d+)/); if(!m)return
  const cn=+m[1]; const real=REAL[cn]; if(!real)return
  const fila=idx+1
  const intRec=num(row[i('Interes')]), impRec=num(row[i('Impuestos')])
  const capNuevo=Math.round((real-intRec-impRec)*100)/100   // capital cierra al monto real
  const viejo=num(row[i('Monto cuota')])
  updates.push({range:`PRESTAMOS!${colL(i('Monto cuota'))}${fila}`,values:[[real]]})
  updates.push({range:`PRESTAMOS!${colL(i('Capital'))}${fila}`,values:[[capNuevo]]})
  console.log(`   cuota ${cn}: ${money(viejo)} → ${money(real)}  (dif ${money(real-viejo)})`)
})
console.log(`\n${updates.length/2} cuotas a corregir · ${updates.length} celdas`)
if(!GO){ console.log(`\nPara aplicar: node scripts/santander-montos-reales.mjs --go\n`); process.exit(0) }
await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'RAW',data:updates}})
console.log('\n✅ montos reales cargados')
