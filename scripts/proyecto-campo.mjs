// Corregir a mano uno o más campos de un proyecto en PROYECTOS, con preview y
// bitácora en LOG. Es el hermano de edicion-campo.mjs. Para cuando un link o un dato
// quedó apuntando a otro lado (ej: #2303 tenía Drive Crudo en una carpeta vacía de la
// unidad CRUDO y el material estaba subido adentro de ENTREGAS).
//
//   node scripts/proyecto-campo.mjs 2303 "Drive Crudo=https://drive.google.com/…"              → preview
//   node scripts/proyecto-campo.mjs 2303 "Drive Crudo=https://drive.google.com/…" --escribir   → aplica y verifica
//
// El nombre del campo es el del header de PROYECTOS. Se niega sobre una celda con
// fórmula (pisarla rompe lo que se calcula solo) y si el N° está en más de una fila.

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
const [NUM, ...pares] = args.filter(a => a !== '--escribir')
if (!NUM || !pares.length) { console.log('uso: node scripts/proyecto-campo.mjs <N° presupuesto> Campo=valor [Campo2=valor2] [--escribir]'); process.exit(1) }
const cambios = pares.map(p => { const i = p.indexOf('='); if (i < 0) { console.error(`✗ "${p}" no es Campo=valor`); process.exit(1) } return [p.slice(0,i).trim(), p.slice(i+1)] })

const colLetra = n => { let s=''; n++; while (n>0) { const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26) } return s }
const leer = async render => (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A1:FZ', valueRenderOption: render })).data.values || []
const datos = await leer('FORMATTED_VALUE'), formulas = await leer('FORMULA')
const H = datos[0], cNum = H.indexOf('N° presupuesto')
const filas = datos.map((r, i) => i > 0 && String(r[cNum] || '').trim() === NUM ? i : -1).filter(i => i > 0)
if (!filas.length) { console.error(`✗ el #${NUM} no está en PROYECTOS`); process.exit(1) }
if (filas.length > 1) { console.error(`✗ el #${NUM} está en ${filas.length} filas (${filas.map(i => i + 1).join(', ')}): no sé cuál corregir`); process.exit(1) }
const idx = filas[0], fila = idx + 1, row = datos[idx]
const v = c => String(row[H.indexOf(c)] ?? '')

console.log(`\n#${NUM}  fila ${fila}  ${v('Agencia')} · ${v('Cliente')} · ${v('Proyecto')}`)
const updates = []
for (const [campo, nuevo] of cambios) {
  const c = H.indexOf(campo)
  if (c < 0) { console.error(`✗ PROYECTOS no tiene la columna "${campo}"`); process.exit(1) }
  if (String(formulas[idx]?.[c] ?? '').startsWith('=')) { console.error(`✗ "${campo}" es una fórmula en esa fila (${formulas[idx][c].slice(0, 60)}): no se pisa`); process.exit(1) }
  const actual = v(campo)
  console.log(`  ${campo} (${colLetra(c)}${fila}): "${actual}" → "${nuevo}"${actual === nuevo ? '  (sin cambio)' : ''}`)
  if (actual !== nuevo) updates.push({ range: `PROYECTOS!${colLetra(c)}${fila}`, values: [[nuevo]], campo, actual, nuevo })
}
if (!updates.length) { console.log('\nnada para cambiar'); process.exit(0) }
if (!ESCRIBIR) { console.log('\n(preview) agregá --escribir para aplicar'); process.exit(0) }

await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates.map(({range, values}) => ({ range, values })) } })
await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
  requestBody: { values: [[new Date().toISOString(), 'script', 'proyecto-campo', 'PROYECTOS', NUM, updates.map(u => `${u.campo}: "${u.actual}" → "${u.nuevo}"`).join(' · ')]] } })

// verificar releyendo, y que la fila siga siendo la del mismo proyecto
const after = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `PROYECTOS!A${fila}:FZ${fila}` })).data.values?.[0] || []
const mal = updates.filter(u => String(after[H.indexOf(u.campo)] ?? '') !== u.nuevo)
if (String(after[cNum] || '').trim() !== NUM) console.log(`\n✗ OJO: la fila ${fila} ahora es el #${after[cNum]}, no el #${NUM}`)
console.log(mal.length ? `\n✗ no quedó como se pidió: ${mal.map(u=>u.campo).join(', ')}` : `\n✓ #${NUM} corregido y anotado en LOG`)
