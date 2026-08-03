/**
 * #2078 Stadium · Lanzamiento — el evento no fue el 19/7: se hizo en dos fechas,
 * el 3 y el 5 de agosto (Juan, 03/08/2026).
 *
 * Toca las tres cosas que hay que mover juntas, si no queda desincronizado:
 *   · PRESUPUESTOS: Fecha Evento + Tipo Fechas = multi + Fechas Adicionales + Cant. Fechas
 *   · PROYECTOS:    Fecha Evento + Mes (que la app usa para el calendario y los cortes)
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
const colLetra=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)}return s}

const NRO='2078', F1='3/8/2026', F2='5/8/2026', MES='08 - AGOSTO'

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PRESUPUESTOS!A:BZ','PROYECTOS!A:CI'],valueRenderOption:'FORMATTED_VALUE'})
const [PRE,PRO]=R.data.valueRanges.map(v=>v.values||[])
const PH=PRE[0], OH=PRO[0]
const iPre=PRE.findIndex((r,i)=>i>0&&txt(r[0])===NRO)
const iPro=PRO.findIndex((r,i)=>i>0&&txt(r[2])===NRO)
if(iPre<0||iPro<0){ console.log('\x1b[31mNo encontré #'+NRO+'\x1b[0m'); process.exit(1) }

const cambios=[
  ['PRESUPUESTOS', iPre+1, 'Fecha Evento',        PH.indexOf('Fecha Evento'),        txt(PRE[iPre][PH.indexOf('Fecha Evento')]),        F1],
  ['PRESUPUESTOS', iPre+1, 'Tipo Fechas',         PH.indexOf('Tipo Fechas'),         txt(PRE[iPre][PH.indexOf('Tipo Fechas')])||'(vacío)','multi'],
  ['PRESUPUESTOS', iPre+1, 'Fechas Adicionales',  PH.indexOf('Fechas Adicionales'),  txt(PRE[iPre][PH.indexOf('Fechas Adicionales')])||'(vacío)', F2],
  ['PRESUPUESTOS', iPre+1, 'Cant. Fechas',        PH.indexOf('Cant. Fechas'),        txt(PRE[iPre][PH.indexOf('Cant. Fechas')]),        '2'],
  ['PROYECTOS',    iPro+1, 'Fecha Evento',        3,                                 txt(PRO[iPro][3]),                                 F1],
  ['PROYECTOS',    iPro+1, 'Mes',                 0,                                 txt(PRO[iPro][0]),                                 MES],
]

console.log(`\n\x1b[1m■ #${NRO} · ${txt(PRO[iPro][4])} · ${txt(PRO[iPro][6])}\x1b[0m`)
console.log(`  El evento se hizo en dos fechas: ${F1} y ${F2}\n`)
console.log(`  ${'solapa'.padEnd(15)}${'fila'.padStart(5)}  ${'campo'.padEnd(20)}${'ahora'.padEnd(14)}→  queda`)
console.log(`  ${'─'.repeat(74)}`)
cambios.forEach(([so,fi,ca,idx,ant,nue])=>{
  if(idx<0){ console.log(`  \x1b[31m${so} no tiene la columna "${ca}"\x1b[0m`); return }
  console.log(`  ${so.padEnd(15)}${String(fi).padStart(5)}  ${ca.padEnd(20)}${ant.padEnd(14)}→  \x1b[32m${nue}\x1b[0m`)})
console.log(`\n  Con esto el proyecto deja de figurar como "hecho el 19/7 y sin facturar hace 15 días"`)
console.log(`  y pasa a ser un evento de agosto, que es lo que fue. El calendario de la app va a`)
console.log(`  mostrar los dos días.`)

if(!ESCRIBIR){ console.log('\n\x1b[33mPREVIEW — no escribí nada.\x1b[0m\n'); process.exit(0) }

const data=cambios.filter(([,,,idx])=>idx>=0).map(([so,fi,,idx,,nue])=>
  ({ range:`${so}!${colLetra(idx)}${fi}`, values:[[nue]] }))
await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data}})
await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',
  requestBody:{values:[[new Date().toISOString(),'juan@somosmagma.com','fix-2078-multifecha','PRESUPUESTOS+PROYECTOS',NRO,`fecha 19/7 → ${F1} + ${F2} (multi, 2 fechas) · mes → ${MES}`]]}})
console.log(`\n\x1b[32m✓ #${NRO} quedó como evento multifecha del ${F1} y ${F2}.\x1b[0m\n`)
