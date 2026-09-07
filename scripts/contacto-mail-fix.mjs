/**
 * Corrige el mail de un contacto en la solapa Contactos/agencias.
 * Uso: node scripts/contacto-mail-fix.mjs "<celda>" "<mail nuevo>" [--escribir]
 * Ej:  node scripts/contacto-mail-fix.mjs B125 florencia.gomez@magneticalatam.com --escribir
 * Sin --escribir muestra qué hay hoy y qué quedaría.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const [celda, nuevo] = process.argv.slice(2)
const ESCRIBIR = process.argv.includes('--escribir')
if (!celda || !nuevo || !/@/.test(nuevo)) { console.error('Uso: node scripts/contacto-mail-fix.mjs B125 mail@dominio.com [--escribir]'); process.exit(1) }
const fila = parseInt(celda.replace(/\D/g,''))
const R = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: `Contactos/agencias!A${fila}:D${fila}` })
const r = (R.data.values||[])[0]||[]
console.log(`\nfila ${fila} — ${r[0]||'(sin nombre)'} · ${r[2]||''}`)
console.log(`   antes : ${r[1]||'(vacío)'}`)
console.log(`   queda : ${nuevo}`)
if (!ESCRIBIR) { console.log('\n(preview — agregá --escribir para aplicar)\n'); process.exit(0) }
await sheets.spreadsheets.values.update({ spreadsheetId: ID, range: `Contactos/agencias!${celda}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[nuevo]] } })
const V = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: `Contactos/agencias!${celda}` })).data.values?.[0]?.[0] || ''
console.log(V === nuevo ? `\n✓ escrito y verificado: ${V}\n` : `\n✗ quedó "${V}"\n`)
