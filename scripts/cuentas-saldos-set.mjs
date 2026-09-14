// Carga los saldos REALES (los del home banking) en la solapa CUENTAS.
// Preview por default; con --escribir aplica y verifica releyendo el sheet.
//
// Editá TARGETS con lo que ves en el banco y corré:
//   node scripts/cuentas-saldos-set.mjs            → muestra qué cambiaría
//   node scripts/cuentas-saldos-set.mjs --escribir → escribe Saldo actual + fecha + Hist saldos + LOG
//
// Desde el 14/09/2026 esto mismo se hace desde el Dashboard ("ver cuentas" → "Actualizar saldos").
// El script queda para cargas masivas o si la app no está a mano.
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const ESCRIBIR = process.argv.includes('--escribir')

// ── Lo que dijo Juan el 14/09/2026 ─────────────────────────────────────────
const TARGETS = [
  { nombre: 'Galicia Sofi',     saldo: 4000000 },
  { nombre: 'BBVA Somos Magma', saldo: 5365195 },
  { nombre: 'Santander Lucia',  saldo: 2383511 },   // "Santander" = la de Lulu; Santander Sofi está inactiva
  { nombre: 'Efectivo',         saldo: 1070000 },
]
// La fila Efectivo tenía basura en Alias/CBU (un script viejo escribió "Saldo USD"/"Hist" en I/J
// cuando esas columnas todavía no existían). Se limpia y el dato viejo pasa al historial.
const LIMPIAR_EFECTIVO = { alias: '500', cbuEmpiezaCon: '20/5/2026' }

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth = new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets = google.sheets({version:'v4',auth})
const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
const ars = n => (n<0?'-':'')+'$'+Math.round(Math.abs(n)).toLocaleString('es-AR')
const num = v => { const n=parseFloat(String(v??'').replace(/[$,\s]/g,'')); return isNaN(n)?0:n }
const esActiva = v => ['SÍ','SI','TRUE'].includes(String(v||'').toUpperCase())

const leer = async () => {
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CUENTAS!A:N' })
  const rows = r.data.values || []
  const h = rows[0] || []
  const idx = k => { const i=h.indexOf(k); if(i<0) throw new Error(`CUENTAS no tiene la columna "${k}"`); return i }
  return { rows, h, I: { nombre: idx('Nombre'), saldo: idx('Saldo actual'), fecha: idx('Última actualización'), activa: idx('Activa'), alias: idx('Alias'), cbu: idx('CBU'), hist: idx('Hist saldos') } }
}

const { rows, I } = await leer()
const ahora = new Date()
const hoy = ahora.toLocaleDateString('es-AR'), hora = ahora.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})
const updates = []
let totalAntes = 0, totalDespues = 0

console.log(`\n${ESCRIBIR?'✍️  ESCRIBIENDO':'👀 PREVIEW (sin --escribir no toca nada)'} — CUENTAS al ${hoy} ${hora}\n`)
console.log('  Cuenta                 │ Saldo en el sheet   │ Saldo real (banco)  │ Diferencia')
console.log('  ───────────────────────┼─────────────────────┼─────────────────────┼──────────────────')
rows.slice(1).forEach((row, i) => {
  if (!row[I.nombre] || !esActiva(row[I.activa])) return
  const fila = i + 2
  const antes = num(row[I.saldo])
  const t = TARGETS.find(x => x.nombre === row[I.nombre])
  const despues = t ? t.saldo : antes
  totalAntes += antes; totalDespues += despues
  console.log(`  ${row[I.nombre].padEnd(22)} │ ${ars(antes).padStart(19)} │ ${(t?ars(despues):'(sin cambio)').padStart(19)} │ ${t?ars(despues-antes).padStart(16):''}`)
  if (!t) return
  updates.push({ range: `CUENTAS!${colLetra(I.saldo)}${fila}`, values: [[t.saldo]] })
  updates.push({ range: `CUENTAS!${colLetra(I.fecha)}${fila}`, values: [[`${hoy} ${hora}`]] })
  let prevHist = row[I.hist] || ''
  if (t.nombre === 'Efectivo') {
    const alias = row[I.alias] || '', cbu = row[I.cbu] || ''
    if (alias === LIMPIAR_EFECTIVO.alias) updates.push({ range: `CUENTAS!${colLetra(I.alias)}${fila}`, values: [['']] })
    if (cbu.startsWith(LIMPIAR_EFECTIVO.cbuEmpiezaCon)) {
      updates.push({ range: `CUENTAS!${colLetra(I.cbu)}${fila}`, values: [['']] })
      prevHist = (cbu.trim() + (prevHist ? '\n' + prevHist : '')).trim()   // el dato viejo vive en el historial, no en el CBU
    }
  }
  const linea = `${hoy} ${hora} [script]: ${ars(t.saldo)}`
  const nuevoHist = (prevHist + (prevHist ? '\n' : '') + linea).split('\n').slice(-15).join('\n')
  updates.push({ range: `CUENTAS!${colLetra(I.hist)}${fila}`, values: [[nuevoHist]] })
})
console.log('  ───────────────────────┼─────────────────────┼─────────────────────┼──────────────────')
console.log(`  ${'EN CAJA (activas)'.padEnd(22)} │ ${ars(totalAntes).padStart(19)} │ ${ars(totalDespues).padStart(19)} │ ${ars(totalDespues-totalAntes).padStart(16)}`)
const faltan = TARGETS.filter(t => !rows.some((r,i)=>i>0 && r[I.nombre]===t.nombre))
if (faltan.length) { console.error(`\n❌ No existe en CUENTAS: ${faltan.map(f=>f.nombre).join(', ')}. No se escribe nada.`); process.exit(1) }
console.log(`\n  ${updates.length} celdas a escribir (saldo + fecha + historial por cuenta${updates.some(u=>u.values[0][0]==='')?' + limpieza Alias/CBU de Efectivo':''}).`)

if (!ESCRIBIR) { console.log('\n  Para aplicar: node scripts/cuentas-saldos-set.mjs --escribir\n'); process.exit(0) }

await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates } })
try {
  await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
    requestBody: { values: TARGETS.map(t => [ahora.toISOString(), 'script:cuentas-saldos-set', 'cuenta-saldo-update', 'CUENTAS', t.nombre, `ars=${t.saldo} (saldo real del banco)`]) } })
} catch (e) { console.warn('  (no se pudo escribir el LOG:', e.message, ')') }

// ── Verificación: releer y comparar ────────────────────────────────────────
const v = await leer()
let ok = true
console.log('\n  Verificación releyendo el sheet:')
TARGETS.forEach(t => {
  const row = v.rows.find((r,i)=>i>0 && r[I.nombre]===t.nombre)
  const leido = num(row?.[v.I.saldo])
  const bien = Math.abs(leido - t.saldo) < 0.01
  ok = ok && bien
  console.log(`   ${bien?'✓':'✗'} ${t.nombre.padEnd(20)} ${ars(leido).padStart(16)}  (${row?.[v.I.fecha]})`)
})
const total = v.rows.slice(1).filter(r=>esActiva(r[v.I.activa])).reduce((s,r)=>s+num(r[v.I.saldo]),0)
console.log(`\n  💰 En caja (cuentas activas): ${ars(total)}  → es lo que va a mostrar el Dashboard como "Disponible real"\n`)
if (!ok) { console.error('❌ Algún saldo no quedó como se pidió. Revisar CUENTAS a mano.'); process.exit(1) }
