/**
 * Detecta columnas CON DATOS pero SIN TÍTULO en las solapas que lee la app.
 * Ese caso rompe silenciosamente: el dato se guarda pero la app no lo puede leer
 * (lib/sheets.js mapea obj[header] = valor; si el header está vacío, la clave se pierde).
 * Solo lectura.
 *   node scripts/scan-headers-vacios.mjs
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const colL=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);}return s}

// mismas solapas que lee getAllData() en lib/sheets.js
const TABS=['PRESUPUESTOS','PROYECTOS','CARGAR STAFF','FACTURACION','RRHH','Contactos/agencias',
  'PAGOS_STAFF','SUELDOS','COSTOS_PROYECTO','CUENTAS','RESERVAS','COBROS','GASTOS_FIJOS',
  'TARJETAS','PRESTAMOS','MOVIMIENTOS_TARJETA','AGENCIAS','CLIENTES','listado','CUOTAS','MOVIMIENTOS']

let problemas=0
for(const tab of TABS){
  let vr
  try{ vr=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:`'${tab}'`,valueRenderOption:'FORMATTED_VALUE'}) }
  catch(e){ console.log(`  (no se pudo leer "${tab}": ${e.message.slice(0,60)})`); continue }
  const rows=vr.data.values||[]
  if(rows.length<2) continue
  const head=rows[0]
  const ancho=Math.max(...rows.map(r=>r.length))
  for(let c=0;c<ancho;c++){
    if(txt(head[c])) continue                       // tiene título, ok
    const conDato=rows.slice(1).filter(r=>txt(r[c])).length
    if(conDato===0) continue                        // sin título y sin datos, no molesta
    problemas++
    const ejemplos=rows.slice(1).filter(r=>txt(r[c])).slice(0,3).map(r=>txt(r[c]).slice(0,24))
    console.log(`\n⚠️  ${tab} · columna ${colL(c)} SIN TÍTULO pero con ${conDato} valores`)
    console.log(`    ejemplos: ${ejemplos.join(' | ')}`)
    console.log(`    → la app guarda ahí pero NO lo puede leer`)
  }
}
console.log(problemas?`\n${problemas} columna(s) con datos huérfanos.`:'\n✅ Todas las columnas con datos tienen título.')
