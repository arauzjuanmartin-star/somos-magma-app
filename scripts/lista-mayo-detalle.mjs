// Lista TODOS los proyectos de mayo con cada valor para ver discrepancia con suma a mano
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]})
)
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth = new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets = google.sheets({version:'v4',auth})

const parseMonto = v => { const s=String(v||'').replace(/[\s$]/g,''); if(s.includes(',')&&s.includes('.'))return s.lastIndexOf(',')>s.lastIndexOf('.')?Number(s.replace(/\./g,'').replace(',','.'))||0:Number(s.replace(/,/g,''))||0; if(s.includes(','))return Number(s.replace(',','.'))||0; return Number(s)||0 }
const fmt = n => Math.round(n).toLocaleString('es-AR')

const r = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PROYECTOS!A:CZ'})
const h = r.data.values[0]
const mayo = r.data.values.slice(1).filter(row => /\/5\/2026|\/05\/2026/.test(row[3]||''))

const idxNro = h.indexOf('N° presupuesto')
const idxCli = h.indexOf('Cliente')
const idxProy = h.indexOf('Proyecto')
const idxTotal = h.findIndex(x => String(x||'').trim()==='Total')      // col 7 "Total "
const idxFee = h.indexOf('Fee Agencia')
const idxSubtotal = h.indexOf('Subtotal')
const idxImpGan = h.indexOf('Imp. Ganancias')
const idxIIBB = h.indexOf('IIBB')
const idxDif = h.indexOf('Diferencia')

console.log(`\n=== LISTA COMPLETA PROYECTOS MAYO 2026 (${mayo.length} proyectos) ===\n`)
console.log('N°       | Cliente             | Proyecto                   | Total (col H) | Subtotal+Fee | Fee Magma  | Dif')
console.log('─'.repeat(140))

let sumTotal=0, sumSubFee=0, sumFee=0, sumSubt=0, sumImp=0, sumIIBB=0, sumDif=0, sumSM=0

mayo.sort((a,b)=>{const fa=String(a[3]||'').split('/');const fb=String(b[3]||'').split('/');return Number(fa[0])-Number(fb[0])})
mayo.forEach(row => {
  const nro = row[idxNro]||''
  const cli = (row[idxCli]||row[4]||'').slice(0,19).padEnd(19)
  const proy = (row[idxProy]||'').slice(0,26).padEnd(26)
  const total = parseMonto(row[idxTotal])
  const fee = parseMonto(row[idxFee])
  const subtotal = parseMonto(row[idxSubtotal])
  const impGan = parseMonto(row[idxImpGan])
  const iibb = parseMonto(row[idxIIBB])
  const dif = parseMonto(row[idxDif])
  const subFee = subtotal + fee
  // Sumar Somos Magma
  let sm = 0
  h.forEach((x,i)=>{ if(x==='Staff'||/^Staff \d+$/.test(String(x||'').trim())){ if(String(row[i]||'').trim()==='Somos Magma') sm += parseMonto(row[i-1]) } })

  sumTotal += total; sumSubFee += subFee; sumFee += fee; sumSubt += subtotal; sumImp += impGan; sumIIBB += iibb; sumDif += dif; sumSM += sm

  console.log(`${String(nro).padEnd(8)} | ${cli} | ${proy} | $${fmt(total).padStart(11)} | $${fmt(subFee).padStart(10)} | $${fmt(fee).padStart(9)} | ${dif?'$'+fmt(dif):''}`)
})

console.log('─'.repeat(140))
console.log(`SUMA:                                                                                  $${fmt(sumTotal).padStart(11)} | $${fmt(sumSubFee).padStart(10)} | $${fmt(sumFee).padStart(9)}`)
console.log(``)
console.log(`📊 INTERPRETACIÓN DE COLUMNAS:`)
console.log(`   - Total (col H del sheet): $${fmt(sumTotal)}  ← lo que vos ves en la app columna "Total"`)
console.log(`   - Subtotal + Fee:           $${fmt(sumSubFee)}  ← lo que cobra Magma al cliente sin recargos`)
console.log(`   - Subtotal:                 $${fmt(sumSubt)}  ← suma de servicios (costo + Somos Magma)`)
console.log(`   - Fee Magma:                $${fmt(sumFee)}  ← margen bruto`)
console.log(`   - Imp. Ganancias 35%:       $${fmt(sumImp)}`)
console.log(`   - IIBB 4%:                  $${fmt(sumIIBB)}`)
console.log(`   - Diferencia:               $${fmt(sumDif)}`)
console.log(`   - Servicios Somos Magma:    $${fmt(sumSM)}`)
console.log(``)
console.log(`✅ GANANCIA NETA REAL: Fee + Somos Magma + Dif = $${fmt(sumFee+sumSM+sumDif)}`)
console.log(``)
console.log(`💡 Lo que probablemente sumaste a mano ($58.885.000):`)
console.log(`   - ¿Suma del col "Total"? = $${fmt(sumTotal)}  ${Math.abs(sumTotal-58885000)<500000?'← podría ser!':''}`)
console.log(`   - ¿Total (sin IVA y sin impuestos)? = $${fmt(sumSubFee)}`)
console.log(`   - ¿Solo Fee Magma? = $${fmt(sumFee)}`)
