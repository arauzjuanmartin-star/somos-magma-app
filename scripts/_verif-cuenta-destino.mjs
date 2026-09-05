/** Verifica la calidad del dato "Cuenta destino" en FACTURACION y COBROS 2026. Solo lectura. */
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
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const P = v => { if(!v) return 0; const n=parseFloat(String(v).replace(/[$,\s]/g,'')); return isNaN(n)?0:n }
const M = n => '$'+Math.round(n).toLocaleString('es-AR')
const anio = f => { const m=String(f||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m?+m[3]:null }
const get = async r => (await sheets.spreadsheets.values.get({spreadsheetId:ID, range:r})).data.values||[]
const tabla = rows => { const h=rows[0]||[]; return rows.slice(1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]]))) }

for (const tab of ['FACTURACION','COBROS','MOVIMIENTOS']) {
  const rows = await get(`${tab}!A1:BZ3000`)
  console.log(`\n${'='.repeat(80)}\n${tab} — headers: ${(rows[0]||[]).filter(Boolean).join(' | ')}\n${'='.repeat(80)}`)
  const t = tabla(rows)
  console.log(`filas totales: ${t.length}`)
  // primeras 3 filas crudas para ver formato
  t.slice(0,3).forEach((f,i)=>console.log(`  ej${i+1}:`, JSON.stringify(f).slice(0,320)))
  const campoF = ['Fecha cobro','Fecha','Fecha movimiento'].find(k=>k in (t[0]||{}))
  const campoC = ['Cuenta destino','Cuenta'].find(k=>k in (t[0]||{}))
  const campoM = ['Monto cobrado','Monto','Total','Importe'].find(k=>k in (t[0]||{}))
  console.log(`  campos usados → fecha:${campoF} cuenta:${campoC} monto:${campoM}`)
  if(!campoF||!campoC) continue
  let con=0,sin=0,mc=0,ms=0
  for (const f of t) {
    if (anio(f[campoF])!==2026) continue
    const m = P(f[campoM])
    if (String(f[campoC]||'').trim()) { con++; mc+=m } else { sin++; ms+=m }
  }
  console.log(`  2026 CON cuenta: ${con} filas · ${M(mc)}`)
  console.log(`  2026 SIN cuenta: ${sin} filas · ${M(ms)}`)
}
