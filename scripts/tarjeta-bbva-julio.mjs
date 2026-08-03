import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); let v = l.slice(i+1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1,-1); return [l.slice(0, i).trim(), v] })
)
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
const norm = v => String(v||'').trim().toLowerCase()
const fmt = n => Number(n).toLocaleString('es-AR',{minimumFractionDigits:2})
const DRY = process.argv.includes('--dry')
const TARJ = 'BBVA Visa'

const tr = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'TARJETAS!A:N' })
const rows = tr.data.values||[], th = rows[0]||[]
const TH = n => th.indexOf(n)

// B) completar el pago del mes 5 (ya SI, monto pagado incompleto)
const fMayo = rows.findIndex((r,i)=> i>0 && norm(r[TH('Tarjeta')])===norm(TARJ) && String(r[TH('Mes')]).trim()==='5' && String(r[TH('Año')]).includes('2026'))
console.log('=== B) MES PASADO (mes 5, ya pagado full 05/06) — completo monto pagado ===')
if (fMayo>0) {
  const upd = [
    { range:`TARJETAS!${colLetra(TH('Monto pagado'))}${fMayo+1}`, values:[[5097901.44]] },
    { range:`TARJETAS!${colLetra(TH('Monto pagado USD'))}${fMayo+1}`, values:[[247.07]] },
  ]
  console.log(`  fila ${fMayo+1}: Monto pagado = $5.097.901,44 + US$247,07 (pago full, ya estaba SI)`)
  if(!DRY){ await sheets.spreadsheets.values.batchUpdate({ spreadsheetId:SHEET_ID, requestBody:{ valueInputOption:'USER_ENTERED', data:upd } }); console.log('  ✓ actualizado') }
} else console.log('  ⚠ no encontré fila mes 5')

// C) registrar el TOTAL del resumen de julio (mes 6) — SIN split de items (se hace por la app)
console.log('\n=== C) RESUMEN JULIO (mes 6, vto 13/07) — solo total (split por la app) ===')
const TOTAL_ARS = 5399950.86, TOTAL_USD = 2073.27
const ya = rows.findIndex((r,i)=> i>0 && norm(r[TH('Tarjeta')])===norm(TARJ) && String(r[TH('Mes')]).trim()==='6' && String(r[TH('Año')]).includes('2026'))
const nota = 'Consumos Juan 1.984.036 + Sofi 2.582.550 + cargos netos 833.365 · SIN deuda financiada (mes ant. pagado full 05/06) · Split personal/Magma PENDIENTE (120 movs, incluye viaje Kansas/Montevideo a clasificar) → subir por la app'
const nueva = new Array(Math.max(th.length,14)).fill('')
const put = (name,val)=>{ if(TH(name)!==-1) nueva[TH(name)]=val }
put('Tarjeta',TARJ); put('Mes',6); put('Año',2026); put('Monto',TOTAL_ARS); put('Monto USD',TOTAL_USD)
put('Vencimiento','13/07/2026'); put('Pagado','NO'); put('Notas',nota)
console.log(`  TARJETAS: ${TARJ} · mes 6 · $${fmt(TOTAL_ARS)} + US$${TOTAL_USD} · vence 13/07/2026 · Pagado=NO`)
console.log(`  Notas: ${nota}`)
if(ya>0) console.log(`  (ya existe fila mes 6 en ${ya+1} — se omite)`)
else if(!DRY){ await sheets.spreadsheets.values.append({ spreadsheetId:SHEET_ID, range:'TARJETAS!A:N', valueInputOption:'USER_ENTERED', insertDataOption:'INSERT_ROWS', requestBody:{ values:[nueva] } }); console.log('  ✓ fila agregada') }

console.log('\n  (No cargo MOVIMIENTOS_TARJETA: el split de 120 items se hace subiendo el PDF por la app,')
console.log('   que lista todo y deja flipear Personal/Magma. Cargar un split mal leído sería peor.)')
if(DRY) console.log('\n(DRY RUN — no se escribió nada)')
