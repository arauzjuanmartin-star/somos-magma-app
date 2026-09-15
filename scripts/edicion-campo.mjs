// Corregir a mano uno o más campos de una tarea del tablero de Edición, con
// preview y bitácora en LOG. Para cuando un script o un sync dejó un valor
// que no es (ej: #2231-3 quedó con la protagonista del video como editora).
//
//   node scripts/edicion-campo.mjs 2231-3 Editor= "Aparecen=Sí: Sol Calbero"              → preview
//   node scripts/edicion-campo.mjs 2231-3 Editor= "Aparecen=Sí: Sol Calbero" --escribir   → aplica y verifica
//
// "Campo=" (vacío) borra el valor. El nombre del campo es el del header de EDICION.

import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim()
  if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1)
  return [l.slice(0,i).trim(), v]
}))
const auth = new google.auth.GoogleAuth({
  credentials:{ client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') },
  scopes:['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version:'v4', auth })
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

const args = process.argv.slice(2)
const ESCRIBIR = args.includes('--escribir')
const [ID, ...pares] = args.filter(a => a !== '--escribir')
if (!ID || !pares.length) { console.log('uso: node scripts/edicion-campo.mjs <ID> Campo=valor [Campo2=valor2] [--escribir]'); process.exit(1) }
const cambios = pares.map(p => { const i = p.indexOf('='); if (i < 0) { console.error(`✗ "${p}" no es Campo=valor`); process.exit(1) } return [p.slice(0,i).trim(), p.slice(i+1)] })

const colLetra = n => { let s=''; n++; while (n>0) { const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26) } return s }
const datos = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'EDICION!A1:AZ' })).data.values || []
const H = datos[0]
const idx = datos.findIndex((r, i) => i > 0 && String(r[0] || '').trim() === ID)
if (idx < 0) { console.error(`✗ no existe la tarea ${ID} en EDICION`); process.exit(1) }
const fila = idx + 1, row = datos[idx]
const v = c => String(row[H.indexOf(c)] ?? '')

console.log(`\n${ID}  fila ${fila}  ${v('Cliente')} · ${v('Proyecto')} · ${v('Entregable')} · ${v('Estado')}`)
const updates = []
for (const [campo, nuevo] of cambios) {
  const c = H.indexOf(campo)
  if (c < 0) { console.error(`✗ EDICION no tiene la columna "${campo}"`); process.exit(1) }
  const actual = v(campo)
  console.log(`  ${campo}: "${actual}" → "${nuevo}"${actual === nuevo ? '  (sin cambio)' : ''}`)
  if (actual !== nuevo) updates.push({ range: `EDICION!${colLetra(c)}${fila}`, values: [[nuevo]], campo, actual, nuevo })
}
if (!updates.length) { console.log('\nnada para cambiar'); process.exit(0) }
if (!ESCRIBIR) { console.log('\n(preview) agregá --escribir para aplicar'); process.exit(0) }

const cA = H.indexOf('Actualizado'), cP = H.indexOf('Por')
const extra = []
if (cA >= 0) extra.push({ range: `EDICION!${colLetra(cA)}${fila}`, values: [[new Date().toISOString()]] })
if (cP >= 0) extra.push({ range: `EDICION!${colLetra(cP)}${fila}`, values: [['script']] })
await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: [...updates, ...extra].map(({range, values}) => ({ range, values })) } })
await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
  requestBody: { values: [[new Date().toISOString(), 'script', 'edicion-campo', 'EDICION', ID, updates.map(u => `${u.campo}: "${u.actual}" → "${u.nuevo}"`).join(' · ')]] } })

// verificar releyendo
const after = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `EDICION!A${fila}:AZ${fila}` })).data.values?.[0] || []
const mal = updates.filter(u => String(after[H.indexOf(u.campo)] ?? '') !== u.nuevo)
console.log(mal.length ? `\n✗ no quedó como se pidió: ${mal.map(u=>u.campo).join(', ')}` : `\n✓ ${ID} corregida y anotada en LOG`)
