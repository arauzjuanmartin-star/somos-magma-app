/**
 * Le pone N° de presupuesto al proyecto "Lanzamiento: Crímenes en línea - DIRECT TV"
 * (8/4, Austral) que hoy está SIN número en PROYECTOS (fila 91) y PAGOS_STAFF (fila 826).
 * Usa el próximo número libre. Preview por defecto; aplica con --go.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const GO = process.argv.includes('--go')
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets'+(GO?'':'.readonly')]})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const PROY_ROW=91, PROY_COL='C'   // N° presupuesto (col índice 2)
const PAG_ROW=826, PAG_COL='D'    // N° Presupuesto (col índice 3)
const NEEDLE=/crimenes|crímenes/i

const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PRESUPUESTOS!A:A','PROYECTOS','FACTURACION!B:B','PAGOS_STAFF'],valueRenderOption:'FORMATTED_VALUE'})
const [PRE,PROY,FAC,PAG]=r.data.valueRanges.map(v=>v.values||[])
// max número libre
const ex=new Set(); let maxN=0
const add=n=>{n=txt(n);if(n){ex.add(n);if(/^\d+$/.test(n)&&+n<100000)maxN=Math.max(maxN,+n)}} // ignora números gigantes (CAE/factura mal cargados)
PRE.forEach(row=>add(row[0])); PROY.slice(1).forEach(row=>add(row[2])); FAC.forEach(row=>add(row[0])); PAG.slice(1).forEach(row=>add(row[3]))
let n=maxN; do{n++}while(ex.has(String(n))); const NUEVO=String(n)

// verificación de seguridad
const pr=PROY[PROY_ROW-1]||[], pg=PAG[PAG_ROW-1]||[]
const okProy = NEEDLE.test(txt(pr[6])) && !txt(pr[2])
const okPag  = NEEDLE.test(txt(pg[4])) && !txt(pg[3])
console.log(`\n  PROYECTOS fila ${PROY_ROW}: "${txt(pr[6])}" · N° actual="${txt(pr[2])}"  -> ${okProy?'OK (vacío y coincide)':'⚠️ NO coincide o ya tiene número'}`)
console.log(`  PAGOS_STAFF fila ${PAG_ROW}: "${txt(pg[4])}" · N° actual="${txt(pg[3])}"  -> ${okPag?'OK (vacío y coincide)':'⚠️ NO coincide o ya tiene número'}`)
console.log(`\n  Próximo N° libre a asignar: ${NUEVO}`)

if(!okProy||!okPag){ console.log(`\n  ✋ Freno: alguna fila no coincide. Reviso antes de tocar.`); process.exit(1) }
if(!GO){ console.log(`\n  ▶ PREVIEW. Para aplicar: node scripts/assign-numero-crimenes.mjs --go\n`); process.exit(0) }

await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'RAW',data:[
  {range:`PROYECTOS!${PROY_COL}${PROY_ROW}`,values:[[NUEVO]]},
  {range:`PAGOS_STAFF!${PAG_COL}${PAG_ROW}`,values:[[NUEVO]]},
]}})
console.log(`\n  ✅ Asignado N° ${NUEVO} a las 2 filas (PROYECTOS y PAGOS_STAFF).\n`)
