// Saca saltos de línea y espacios de los mails de RRHH.
//
// Apareció el 6/9/2026 al armar las fichas del equipo: seis mails tenían un "\n"
// o un espacio pegado y Drive los rechazaba. No es solo cosmético — ese mismo
// campo es el que usa la citación del Calendar para invitar al staff y el que
// usan los avisos de Edición. Un mail con basura al final es una invitación que
// no llega y nadie se entera.
//
//   node scripts/rrhh-limpiar-mails.mjs              → preview
//   node scripts/rrhh-limpiar-mails.mjs --escribir

import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim()
  if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1); return [l.slice(0,i).trim(), v]
}))
const auth = new google.auth.GoogleAuth({
  credentials:{ client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') },
  scopes:['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version:'v4', auth })
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const colLetra = c => { let s='', n=c+1; while(n>0){ n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26) } return s }

const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range:'RRHH!A:Z' })
const filas = r.data.values || []
const h = filas[0]
const iNom = h.indexOf('Nombre Apellido'), iMail = h.indexOf('Mail'), iCel = h.indexOf('Celular')

const sucios = []
filas.slice(1).forEach((f, i) => {
  const fila = i + 2
  ;[[iMail,'Mail'], [iCel,'Celular']].forEach(([col, nombre]) => {
    if (col < 0) return
    const v = f[col]
    if (typeof v !== 'string' || !v) return
    const limpio = v.trim()
    if (limpio !== v) sucios.push({ fila, col, nombre, quien: f[iNom] || '', antes: v, despues: limpio })
  })
})

console.log('════ MAILS Y CELULARES CON BASURA EN RRHH ════\n')
if (!sucios.length) { console.log('  ✓ Está todo limpio.'); process.exit(0) }
sucios.forEach(s => {
  const que = /\n/.test(s.antes) ? 'salto de línea' : 'espacio'
  console.log(`  ${String(s.quien).slice(0,26).padEnd(26)} ${s.nombre.padEnd(8)} ${colLetra(s.col)}${s.fila}  ${que}  →  "${s.despues}"`)
})
console.log(`\n  ${sucios.length} celdas para limpiar`)
console.log('  Ojo: este campo lo usan la citación del Calendar y los avisos de Edición.')

if (!ESCRIBIR) { console.log('\n👀 PREVIEW — nada se escribió. Corré con --escribir.'); process.exit(0) }

await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId: SHEET_ID,
  requestBody: { valueInputOption:'RAW', data: sucios.map(s => ({ range:`RRHH!${colLetra(s.col)}${s.fila}`, values:[[s.despues]] })) },
})
console.log(`\n✅ ${sucios.length} celdas limpiadas.`)
