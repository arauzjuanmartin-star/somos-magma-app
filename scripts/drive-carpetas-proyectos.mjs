// Crea las carpetas de Drive (CRUDO + ENTREGAS CLIENTES) de los proyectos que
// tienen edición abierta en la solapa EDICION. Es el "ponerse al día": de acá
// en adelante cada presupuesto aprobado crea las suyas solo.
//
//   node scripts/drive-carpetas-proyectos.mjs           → preview
//   node scripts/drive-carpetas-proyectos.mjs --escribir
//   node scripts/drive-carpetas-proyectos.mjs 2143 --escribir   → solo ese proyecto

import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { asegurarCarpetasProyecto } from '../lib/drive.js'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim()
  if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1)
  return [l.slice(0,i).trim(), v]
}))
process.env.GOOGLE_CLIENT_EMAIL = env.GOOGLE_CLIENT_EMAIL
process.env.GOOGLE_PRIVATE_KEY  = env.GOOGLE_PRIVATE_KEY
const auth = new google.auth.GoogleAuth({
  credentials:{ client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') },
  scopes:['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version:'v4', auth })
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const SOLO = process.argv.slice(2).find(a => /^\d+$/.test(a))

// Los proyectos con edición abierta (la solapa EDICION es la lista de trabajo vivo)
const rE = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'EDICION!A:R' })
const rows = rE.data.values || []
const h = rows[0] || []
const iNum = h.indexOf('N° presupuesto'), iEst = h.indexOf('Estado'), iCru = h.indexOf('Link crudo')
const nums = [...new Set(rows.slice(1)
  .filter(r => !['Entregado','Aprobado'].includes(String(r[iEst]||'').trim()))
  .filter(r => !String(r[iCru]||'').trim())
  .map(r => String(r[iNum]||'').trim()).filter(Boolean))]
const objetivo = SOLO ? [SOLO] : nums

console.log(`\n════ CARPETAS DE DRIVE ════`)
console.log(`${objetivo.length} proyecto(s) sin carpeta${SOLO ? ` (filtrado a #${SOLO})` : ''}\n`)

let ok = 0, err = 0
for (const num of objetivo) {
  try {
    const r = await asegurarCarpetasProyecto({ sheets, SHEET_ID, num, destinos: ['crudo','entregas'], dryRun: !ESCRIBIR })
    console.log(`#${num}`)
    r.pasos.forEach(p => console.log(`   ${p}`))
    if (!ESCRIBIR) console.log('')
    else { console.log(`   crudo:   ${r.crudo?.link || '—'}`); console.log(`   entrega: ${r.entregas?.link || '—'}\n`) }
    ok++
  } catch (e) { console.log(`#${num}  ⚠ ${e.message}\n`); err++ }
}
console.log(`${ok} ok · ${err} con error`)
console.log(ESCRIBIR ? '\n✅ Carpetas creadas y links guardados en PROYECTOS (ES/ET).' : '\n👀 PREVIEW — nada se creó. Corré con --escribir.')
