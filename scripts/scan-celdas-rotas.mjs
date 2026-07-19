/**
 * Escanea TODAS las solapas buscando celdas rotas (#ERROR!, #REF!, #N/A...).
 * Solo lectura — no escribe nada.
 *   node scripts/scan-celdas-rotas.mjs
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
  scopes:['https://www.googleapis.com/auth/spreadsheets.readonly'],
})
const sheets = google.sheets({version:'v4',auth})
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ERR = /^#(ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)/

const meta = await sheets.spreadsheets.get({spreadsheetId:SHEET_ID})
const tabs = meta.data.sheets.map(s=>s.properties.title)

let total = 0
for (const tab of tabs) {
  let val, fml
  try {
    ;[val, fml] = await Promise.all([
      sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID, range:`'${tab}'`, valueRenderOption:'FORMATTED_VALUE'}),
      sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID, range:`'${tab}'`, valueRenderOption:'FORMULA'}),
    ])
  } catch(e) { console.log(`  (no se pudo leer "${tab}": ${e.message})`); continue }

  const rows = val.data.values||[], frows = fml.data.values||[]
  const head = rows[0]||[]
  const hits = []
  rows.forEach((r,i)=>{
    if(i===0) return
    r.forEach((c,j)=>{
      if(typeof c==='string' && ERR.test(c.trim())){
        const orig = (frows[i]||[])[j]
        // Solo cuenta como "recuperable" si el texto original no arranca con = (fórmula real)
        const recuperable = orig!==undefined && !String(orig).trim().startsWith('=')
        hits.push({fila:i+1, col:head[j]||`col${j+1}`, ref:r[0]||'', orig, recuperable})
      }
    })
  })
  if(hits.length){
    total += hits.length
    console.log(`\n### ${tab} — ${hits.length} celda(s) rota(s)`)
    hits.slice(0,25).forEach(h=>{
      console.log(`  fila ${h.fila} · ${h.col} · "${h.ref}"  ->  ${h.recuperable?`RECUPERABLE: ${h.orig}`:`fórmula real: ${h.orig}`}`)
    })
    if(hits.length>25) console.log(`  ... y ${hits.length-25} más`)
  }
}
console.log(total ? `\nTOTAL: ${total} celda(s) rota(s) en todo el sheet.` : '\n✅ No hay celdas rotas en ninguna solapa.')
