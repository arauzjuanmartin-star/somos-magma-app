// Pasa un presupuesto a "fechas a confirmar": el trabajo está aprobado pero los días
// todavía no se ubicaron. Es el criterio de lib/fechas.js — Tipo Fechas = 'tentativa',
// y en el calendario de la app esos días salen en GRIS (no verde) y no cuentan como
// jornada agendada. En Google Calendar van como un bloque gris que no invita a nadie.
//
// Uso:  node scripts/presu-fechas-a-confirmar.mjs 2257            → preview
//       node scripts/presu-fechas-a-confirmar.mjs 2257 --escribir → aplica
//       node scripts/presu-fechas-a-confirmar.mjs 2257 --dias=5/10/2026,6/10/2026
//
// Después de escribir conviene abrir el presu en la app → "Editar datos" → Guardar:
// eso dispara la sincronización con Google Calendar (el script solo toca el sheet).
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
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

const args = process.argv.slice(2)
const num = args.find(a=>!a.startsWith('--'))
const escribir = args.includes('--escribir')
const diasArg = (args.find(a=>a.startsWith('--dias='))||'').slice(7)
if(!num){ console.log('Falta el N° de presupuesto. Ej: node scripts/presu-fechas-a-confirmar.mjs 2257'); process.exit(1) }

const r = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID, range:'PRESUPUESTOS!A:DP'})
const rows = r.data.values||[], h = rows[0]
const iTipo = h.indexOf('Tipo Fechas'), iAd = h.indexOf('Fechas Adicionales'), iCant = h.indexOf('Cant. Fechas')
if(iTipo<0||iAd<0){ console.log('No encuentro las columnas Tipo Fechas / Fechas Adicionales'); process.exit(1) }
const col = i => { let s='',n=i+1; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26) } return s }

let fila=-1, row=null
for(let i=1;i<rows.length;i++){ if(String(rows[i][0]||'').trim()===String(num).trim()){ fila=i+1; row=rows[i]; break } }
if(fila<0){ console.log(`No existe el presupuesto #${num}`); process.exit(1) }

// Los días: los que pasen por --dias, o el que ya tiene cargado como Fecha Evento
const dias = diasArg ? diasArg.split(',').map(s=>s.trim()).filter(Boolean) : [String(row[1]||'').trim()]
if(!dias.length || !dias[0]){ console.log('El presupuesto no tiene Fecha Evento y no pasaste --dias'); process.exit(1) }

// Todos sin confirmar = tipo 'tentativa', el primero en Fecha Evento y el resto en adicionales
const nuevo = { fechaEvento:dias[0], tipo:'tentativa', adicionales:dias.slice(1).join('|'), cant:dias.length }

console.log(`\n#${num} · ${row[5]||row[4]||''} — ${row[6]||''}   [${row[3]||''}]   fila ${fila}`)
console.log('\n                        ANTES                          →  DESPUÉS')
const linea = (lbl, antes, despues, colLetra) =>
  console.log(` ${lbl.padEnd(20)} ${String(antes||'(vacío)').padEnd(24)} →  ${String(despues||'(vacío)')}${colLetra?`   [col ${colLetra}]`:''}`)
linea('Fecha Evento', row[1], nuevo.fechaEvento, 'B')
linea('Tipo Fechas', row[iTipo], nuevo.tipo, col(iTipo))
linea('Fechas Adicionales', row[iAd], nuevo.adicionales, col(iAd))
if(iCant>=0) linea('Cant. Fechas', row[iCant], nuevo.cant, col(iCant))

console.log(`\nQueda: ${nuevo.cant} ${nuevo.cant===1?'día':'días'} SIN confirmar → en el calendario de la app se ve${nuevo.cant===1?'':'n'} en gris.`)
console.log('No cambia el estado, ni el precio, ni el staff. Solo las fechas.')

if(!escribir){ console.log('\n→ Preview. Para aplicarlo: node scripts/presu-fechas-a-confirmar.mjs '+num+' --escribir\n'); process.exit(0) }

const data = [
  { range:`PRESUPUESTOS!B${fila}`, values:[[nuevo.fechaEvento]] },
  { range:`PRESUPUESTOS!${col(iTipo)}${fila}`, values:[[nuevo.tipo]] },
  { range:`PRESUPUESTOS!${col(iAd)}${fila}`, values:[[nuevo.adicionales]] },
]
if(iCant>=0) data.push({ range:`PRESUPUESTOS!${col(iCant)}${fila}`, values:[[nuevo.cant]] })
await sheets.spreadsheets.values.batchUpdate({ spreadsheetId:SHEET_ID, requestBody:{ valueInputOption:'USER_ENTERED', data } })

// PROYECTOS lee la fecha por su cuenta: si el trabajo ya está aprobado, alinearla
const rp = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID, range:'PROYECTOS!A:D'})
const pr = rp.data.values||[]
for(let i=1;i<pr.length;i++){
  if(String(pr[i][2]||'').trim()===String(num).trim()){
    if(String(pr[i][3]||'').trim()!==nuevo.fechaEvento){
      await sheets.spreadsheets.values.update({spreadsheetId:SHEET_ID, range:`PROYECTOS!D${i+1}`, valueInputOption:'USER_ENTERED', requestBody:{values:[[nuevo.fechaEvento]]}})
      console.log(`PROYECTOS fila ${i+1}: Fecha Evento alineada a ${nuevo.fechaEvento}`)
    }
    break
  }
}

try{
  await sheets.spreadsheets.values.append({spreadsheetId:SHEET_ID, range:'LOG!A:F', valueInputOption:'USER_ENTERED',
    requestBody:{values:[[new Date().toISOString(),'script','fechas-a-confirmar','PRESUPUESTOS',String(num),`tipo=tentativa · ${nuevo.cant} día(s) sin confirmar`]]}})
}catch(e){}

// Verificar que quedó como se dijo
const rv = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID, range:`PRESUPUESTOS!A${fila}:DP${fila}`})
const v = (rv.data.values||[])[0]||[]
const ok = String(v[1]||'')===nuevo.fechaEvento && String(v[iTipo]||'')===nuevo.tipo && String(v[iAd]||'')===nuevo.adicionales
console.log(ok ? `\n✓ Escrito y verificado: ${v[1]} · ${v[iTipo]} · adicionales "${v[iAd]||''}"`
               : `\n✗ Quedó distinto de lo previsto: ${v[1]} · ${v[iTipo]} · "${v[iAd]||''}"`)
console.log('→ Abrí el presu en la app, "Editar datos" y Guardar para que el bloque gris llegue al Calendar.\n')
