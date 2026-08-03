/**
 * Deja SOCIOS_MOVIMIENTOS como fuente única de los dos socios.
 *
 * Antes: los movimientos de Sofi estaban en el sheet pero el cálculo los ignoraba
 * (usaba una lista fija en el código + el cronograma de PRESTAMOS). Consecuencia:
 * lo que se cargara desde la app para Sofi no impactaba su saldo.
 *
 * Este script deja el sheet completo para que el cálculo pueda leer de ahí:
 *   1) carga las cuotas de préstamo de agosto que Magma paga por Sofi (faltaban)
 *   2) restaura "Sueldo Sofi" en GASTOS_FIJOS a $3.000.000 (el compromiso mensual)
 *   3) registra el retiro real de $671.600 que se había anotado pisando ese sueldo
 *
 * Sin --escribir solo muestra el preview.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR=process.argv.includes('--escribir')
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const colLetra=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)}return s}
const SANT_COMPARTIDO='Santander #810-03510008128/6', SANT_PERSONAL='Santander #810-03510008035/1'

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['SOCIOS_MOVIMIENTOS!A:J','PRESTAMOS!A:Q','GASTOS_FIJOS!A:H'],valueRenderOption:'FORMATTED_VALUE'})
const [SM,PRE,GAS]=R.data.valueRanges.map(v=>v.values||[])

// ── 1) cuotas de agosto que Magma paga por Sofi ──
const cuotaAgo=(pres)=>{let v=null
  PRE.slice(1).forEach(r=>{if(!r||txt(r[0])!==pres)return
    const f=fecha(r[3]); if(!f||f.getFullYear()!==2026||f.getMonth()+1!==8)return
    v={monto:num(r[4]), fecha:txt(r[3])}})
  return v}
const c1=cuotaAgo(SANT_COMPARTIDO), c2=cuotaAgo(SANT_PERSONAL)
const yaEsta=(conc,mes)=>SM.slice(1).some(r=>{const f=fecha(r[0]); return f&&f.getMonth()+1===mes&&/sof/i.test(r[1]||'')&&txt(r[3]).includes(conc)})
const nuevas=[]
if(c1 && !yaEsta('Santander compartido',8)) nuevas.push([c1.fecha,'Sofi','Magma→Socio','Cuota Santander compartido (50% que le toca a Sofi)',c1.monto/2,'','','','Cronograma PRESTAMOS · socios-fuente-unica','ARS'])
if(c2 && !yaEsta('Santander personal',8))   nuevas.push([c2.fecha,'Sofi','Magma→Socio','Cuota Santander personal (100% Sofi)',c2.monto,'','','','Cronograma PRESTAMOS · socios-fuente-unica','ARS'])

// ── 2) el sueldo de Sofi en GASTOS_FIJOS ──
const gh=GAS[0], iCon=gh.indexOf('Concepto'), iMon=gh.indexOf('Monto')
let filaSueldo=null, montoActual=0
GAS.forEach((r,i)=>{ if(i===0||!r)return; if(/^sueldo sofi$/i.test(txt(r[iCon]))){ filaSueldo=i+1; montoActual=num(r[iMon]) } })
const RETIRO=montoActual   // lo que se había puesto pisando el sueldo es lo que ella sacó

console.log(`\n\x1b[1m■ 1) Cuotas de agosto de Sofi que faltaban en SOCIOS_MOVIMIENTOS\x1b[0m`)
if(!nuevas.length) console.log('   (ya estaban cargadas)')
nuevas.forEach(n=>console.log(`   ${n[0].padEnd(11)} ${n[3].slice(0,46).padEnd(48)} ${M(n[4]).padStart(13)}`))

console.log(`\n\x1b[1m■ 2) GASTOS_FIJOS · "Sueldo Sofi" (fila ${filaSueldo})\x1b[0m`)
console.log(`   ahora dice   ${M(montoActual).padStart(14)}   ← es lo que se le pagó, no el compromiso`)
console.log(`   va a decir   ${M(3000000).padStart(14)}   ← el sueldo acordado`)

console.log(`\n\x1b[1m■ 3) El retiro se registra donde corresponde\x1b[0m`)
console.log(`   Sofi · Magma→Socio · ${M(RETIRO)} · "Retiro (cobrado a cuenta del sueldo)"`)
console.log(`   → le baja el saldo a favor en ${M(RETIRO)}, que es lo correcto: ya cobró esa plata.`)

if(!ESCRIBIR){ console.log('\n\x1b[33mPREVIEW — no escribí nada.\x1b[0m\n'); process.exit(0) }

if(nuevas.length) await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'SOCIOS_MOVIMIENTOS!A:J',valueInputOption:'USER_ENTERED',insertDataOption:'INSERT_ROWS',requestBody:{values:nuevas}})
const hoy=new Date()
await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'SOCIOS_MOVIMIENTOS!A:J',valueInputOption:'USER_ENTERED',insertDataOption:'INSERT_ROWS',
  requestBody:{values:[[`${hoy.getDate()}/${hoy.getMonth()+1}/${hoy.getFullYear()}`,'Sofi','Magma→Socio','Retiro (cobrado a cuenta del sueldo)',RETIRO,'','','','Registrado por Juan 03/08 — estaba anotado pisando el Sueldo Sofi de GASTOS_FIJOS','ARS']]}})
await sheets.spreadsheets.values.update({spreadsheetId:ID,range:`GASTOS_FIJOS!${colLetra(iMon)}${filaSueldo}`,valueInputOption:'USER_ENTERED',requestBody:{values:[[3000000]]}})
await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',
  requestBody:{values:[[new Date().toISOString(),'juan@somosmagma.com','socios-fuente-unica','SOCIOS_MOVIMIENTOS+GASTOS_FIJOS','Sofi',`retiro ${M(RETIRO)} registrado · sueldo restaurado a $3.000.000 · ${nuevas.length} cuotas de agosto`]]}})
console.log(`\n\x1b[32m✓ Listo: ${nuevas.length} cuotas de agosto + retiro de ${M(RETIRO)} + sueldo restaurado.\x1b[0m\n`)
