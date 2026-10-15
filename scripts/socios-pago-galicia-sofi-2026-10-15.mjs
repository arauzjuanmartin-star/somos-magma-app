// Registra en SOCIOS_MOVIMIENTOS los $3.900.000 que Magma le pasa a Sofi el 15/10/2026 para pagar su Visa Galicia
// (resumen cierre 24/09, quedaba financiado ~$7,9M al 80% anual). Es un pago a Sofi: baja lo que Magma le debe.
// Preview por default; --escribir para aplicar. No duplica si ya está.
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')

const REF = 'Visa Galicia resumen cierre 24/09/2026 · pago 15/10'
const fila = ['15/10/2026','Sofi','Magma→Socio','Pago tarjeta Visa Galicia (personal de Sofi)',3900000,'',REF,'Magma le transfiere a Sofi para pagar su tarjeta (Juan 15/10)','Pedido de Juan 15/10','ARS']

const SM = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'SOCIOS_MOVIMIENTOS!A:J' })).data.values || []
if (SM.some(r => String(r[6] || '') === REF)) { console.log('Ya estaba cargado, no hay nada que hacer.'); process.exit(0) }
console.log(`A agregar: ${fila[0]} · ${fila[1]} · ${fila[3]} · $${fila[4].toLocaleString('es-AR')}`)
if (!ESCRIBIR) { console.log('\nPREVIEW. Para cargarlo: node scripts/socios-pago-galicia-sofi-2026-10-15.mjs --escribir'); process.exit(0) }

// fecha como texto (RAW): con USER_ENTERED el sheet la convierte en número de serie
const r = await sheets.spreadsheets.values.append({ spreadsheetId: ID, range: 'SOCIOS_MOVIMIENTOS!A:J',
  valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [fila] } })
console.log('✓ escrito en', r.data.updates.updatedRange)
const v = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: r.data.updates.updatedRange })).data.values
v.forEach(x => console.log('  ' + x.join(' | ')))
