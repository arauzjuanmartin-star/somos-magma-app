/**
 * Repara celdas de Contactos/agencias que quedaron en #ERROR!
 *
 * Causa: un valor que arranca con "+" (ej: "+54 9 11 6408-2926") Google Sheets
 * lo interpreta como fórmula, no puede calcularlo y deja la celda en #ERROR!.
 * El texto original NO se pierde: sigue accesible con valueRenderOption:'FORMULA'.
 *
 * Este script lee el texto original y lo reescribe con RAW (= texto literal).
 *
 *   node scripts/fix-telefonos-error.mjs        -> preview, no escribe nada
 *   node scripts/fix-telefonos-error.mjs --go   -> aplica los cambios
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
    const i=l.indexOf('='); let v=l.slice(i+1).trim()
    if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1)
    return [l.slice(0,i).trim(),v]
  })
)
const auth = new google.auth.GoogleAuth({
  credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},
  scopes:['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({version:'v4',auth})
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const TAB = 'Contactos/agencias'
const GO = process.argv.includes('--go')

const ERR = /^#(ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)/
const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

const [val, fml] = await Promise.all([
  sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID, range:TAB, valueRenderOption:'FORMATTED_VALUE'}),
  sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID, range:TAB, valueRenderOption:'FORMULA'}),
])
const rows = val.data.values||[], frows = fml.data.values||[]
const head = rows[0]

const updates = []
rows.forEach((r,i)=>{
  if(i===0) return
  r.forEach((cell,j)=>{
    if(typeof cell!=='string' || !ERR.test(cell.trim())) return
    const original = (frows[i]||[])[j]
    if(original===undefined || original===null || String(original).trim()===''){
      console.log(`  ⚠ fila ${i+1} col "${head[j]}" (${r[0]}): roto y SIN texto recuperable — se saltea`)
      return
    }
    updates.push({
      fila: i+1, col: head[j], nombre: r[0], agencia: r[2]||'',
      range: `${TAB}!${colLetra(j)}${i+1}`,
      values: [[String(original)]],
    })
  })
})

if(!updates.length){ console.log('✅ No hay celdas rotas. Nada que hacer.'); process.exit(0) }

console.log(`\n${GO?'APLICANDO':'PREVIEW (no escribe nada)'} — ${updates.length} celda(s) a reparar:\n`)
updates.forEach(u=>{
  console.log(`  ${u.range.padEnd(28)} ${u.nombre}${u.agencia?` (${u.agencia})`:''}`)
  console.log(`  ${''.padEnd(28)} #ERROR!  ->  ${u.values[0][0]}\n`)
})

if(!GO){ console.log('Para aplicar:  node scripts/fix-telefonos-error.mjs --go'); process.exit(0) }

await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId: SHEET_ID,
  requestBody: { valueInputOption: 'RAW', data: updates.map(({range,values})=>({range,values})) },
})
console.log(`✅ Listo: ${updates.length} celda(s) reparada(s).`)

// Verificación: releer y confirmar que no quedó ninguna rota
const check = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID, range:TAB, valueRenderOption:'FORMATTED_VALUE'})
const quedan = (check.data.values||[]).slice(1).flatMap((r,i)=>r.filter(c=>typeof c==='string'&&ERR.test(c.trim())).map(()=>i+2))
console.log(quedan.length ? `⚠ Quedan celdas rotas en filas: ${quedan.join(', ')}` : '✅ Verificado: no queda ninguna celda en #ERROR!')
