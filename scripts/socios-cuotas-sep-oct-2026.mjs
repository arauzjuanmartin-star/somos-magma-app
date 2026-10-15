// Carga en SOCIOS_MOVIMIENTOS la mitad de Sofi del Santander #810-03510008128/6 de septiembre y octubre 2026
// (cuotas 12/18 y 13/18, pagadas por Magma y nunca anotadas). Preview por default; --escribir para aplicar.
// lib/socios.mjs ya las toma solas desde PRESTAMOS: estas filas son para que el sheet quede completo,
// y al estar la fila con su Referencia la lib no las cuenta dos veces.
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')

const filas = [
  ['4/9/2026','Sofi','Magma→Socio','Cuota Santander compartido (50% que le toca a Sofi)',345746.06,'Santander Sofi','#810-03510008128/6 cuota 12/18','pagada 3/9/2026 · el otro 50% es deuda propia de Magma','Cronograma PRESTAMOS · faltaba cargar (15/10)','ARS'],
  ['4/10/2026','Sofi','Magma→Socio','Cuota Santander compartido (50% que le toca a Sofi)',342191.88,'Galicia Sofi','#810-03510008128/6 cuota 13/18','pagada 5/10/2026 · el otro 50% es deuda propia de Magma','Cronograma PRESTAMOS · faltaba cargar (15/10)','ARS'],
]

const SM = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'SOCIOS_MOVIMIENTOS!A:J' })).data.values || []
const nuevas = filas.filter(f => !SM.some(r => String(r[6] || '').includes(f[6])))
console.log(`SOCIOS_MOVIMIENTOS tiene ${SM.length - 1} filas. A agregar: ${nuevas.length} de ${filas.length}`)
nuevas.forEach(f => console.log(`  ${f[0]} · ${f[3]} · $${f[4].toLocaleString('es-AR')} · ${f[6]}`))
if (!nuevas.length) { console.log('Ya estaban cargadas, no hay nada que hacer.'); process.exit(0) }
if (!ESCRIBIR) { console.log('\nPREVIEW. Para cargarlas: node scripts/socios-cuotas-sep-oct-2026.mjs --escribir'); process.exit(0) }

// fechas como texto (RAW): con USER_ENTERED el sheet las convierte en número de serie
const r = await sheets.spreadsheets.values.append({ spreadsheetId: ID, range: 'SOCIOS_MOVIMIENTOS!A:J',
  valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: nuevas } })
console.log('\n✓ escrito en', r.data.updates.updatedRange)
const v = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: r.data.updates.updatedRange })).data.values
v.forEach(x => console.log('  ' + x.join(' | ')))
