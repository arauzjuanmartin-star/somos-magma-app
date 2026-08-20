/**
 * Marca como PAGADO el IVA período 2026-05 ($3.943.254,84) desde BBVA Somos Magma
 * y descuenta el saldo de la cuenta, igual que hace el toggle de la app.
 * Confirmado por Juan el 20/08/2026. Idempotente: si ya está pagado, no vuelve a descontar.
 * Sin --escribir solo muestra el preview.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('='); let v=l.slice(i+1).trim(); if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1); return [l.slice(0,i).trim(),v]}))
const auth = new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets = google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')

const CONCEPTO='IVA periodo 2026-05', CUENTA='BBVA Somos Magma', FECHA='20/8/2026', MES_KEY='8/2026'
const col=n=>{let s='',x=n+1;while(x>0){x--;s=String.fromCharCode(65+(x%26))+s;x=Math.floor(x/26)}return s}
const num=v=>parseFloat(String(v||'0').replace(/[^\d.-]/g,''))||0
const M=n=>'$'+n.toLocaleString('es-AR',{minimumFractionDigits:2, maximumFractionDigits:2})

const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID, ranges:['GASTOS_FIJOS!A:Q','CUENTAS!A:N']})
const [GF,CU]=r.data.valueRanges.map(v=>v.values||[])
const H=GF[0], HC=CU[0]
const iCon=H.indexOf('Concepto'), iMon=H.indexOf('Monto'), iPag=H.indexOf('Pagado'), iFp=H.indexOf('Fecha pago'), iCp=H.indexOf('Cuenta pago'), iMp=H.indexOf('Meses pagados')
const idx=GF.findIndex((f,i)=>i && String(f[iCon]||'').trim()===CONCEPTO)
if(idx<0){ console.log(`✗ No encontré "${CONCEPTO}" en GASTOS_FIJOS`); process.exit(1) }
const fila=idx+1, monto=num(GF[idx][iMon]), yaPagado=/^(si|sí|true)$/i.test(String(GF[idx][iPag]||''))

const iN=HC.indexOf('Nombre'), iS=HC.indexOf('Saldo actual'), iAct=HC.indexOf('Última actualización')
const ic=CU.findIndex((f,i)=>i && String(f[iN]||'').trim().toLowerCase()===CUENTA.toLowerCase())
if(ic<0){ console.log(`✗ No encontré la cuenta "${CUENTA}"`); process.exit(1) }
const saldo=num(CU[ic][iS]), nuevo=saldo-monto

console.log(`\n=== ${ESCRIBIR?'ESCRIBIENDO':'PREVIEW'} ===`)
console.log(`  GASTOS_FIJOS fila ${fila}: ${CONCEPTO} ${M(monto)}`)
console.log(`    Pagado: "${GF[idx][iPag]||''}" → "SI"   Fecha pago → ${FECHA}   Cuenta pago → ${CUENTA}   Meses pagados → ${MES_KEY}`)
if(yaPagado) console.log(`    ⚠️  YA figuraba pagado: NO se vuelve a descontar de la cuenta`)
else console.log(`  CUENTAS "${CUENTA}": ${M(saldo)} → ${M(nuevo)}   (−${M(monto)})`)
if(!ESCRIBIR){ console.log('\n(nada escrito — correr con --escribir)'); process.exit(0) }

const data=[
  {range:`GASTOS_FIJOS!${col(iPag)}${fila}`, values:[['SI']]},
  {range:`GASTOS_FIJOS!${col(iFp)}${fila}`, values:[[FECHA]]},
  {range:`GASTOS_FIJOS!${col(iCp)}${fila}`, values:[[CUENTA]]},
  {range:`GASTOS_FIJOS!${col(iMp)}${fila}`, values:[[MES_KEY]]},
]
if(!yaPagado){
  data.push({range:`CUENTAS!${col(iS)}${ic+1}`, values:[[nuevo]]})
  if(iAct>=0) data.push({range:`CUENTAS!${col(iAct)}${ic+1}`, values:[[FECHA]]})
}
await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID, requestBody:{valueInputOption:'USER_ENTERED', data}})
await sheets.spreadsheets.values.append({spreadsheetId:ID, range:'LOG!A:F', valueInputOption:'USER_ENTERED', requestBody:{values:[[new Date().toISOString(),'juan@somosmagma.com','marcar-pago-script','GASTOS_FIJOS',CONCEPTO,`PAGADO ${CUENTA} ${monto} (${MES_KEY})`]]}})

const v=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID, ranges:['GASTOS_FIJOS!A:Q','CUENTAS!A:N']})
const [G2,C2]=v.data.valueRanges.map(x=>x.values||[])
console.log('\n=== VERIFICACIÓN (releído del sheet) ===')
const f2=G2[idx]
console.log(`  fila ${fila}: ${f2[iCon]}  Pagado=${f2[iPag]}  Fecha=${f2[iFp]}  Cuenta=${f2[iCp]}  Meses=${f2[iMp]}`)
console.log(`  ${CUENTA}: ${M(num(C2[ic][iS]))}`)
