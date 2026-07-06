import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); let v = l.slice(i+1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1,-1); return [l.slice(0, i).trim(), v] })
)
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth = new google.auth.GoogleAuth({
  credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })
const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
const norm = v => String(v||'').trim().toLowerCase()
const fmt = n => Number(n).toLocaleString('es-AR',{minimumFractionDigits:2})
const DRY = process.argv.includes('--dry')
const TARJ = 'Master Galicia', ANIO = 2026, MES = 6

const tr = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'TARJETAS!A:N' })
const rows = tr.data.values||[], th = rows[0]||[]
const TH = n => th.indexOf(n)

// ---------- B) completar USD pagado del mes 5 (ya está pagado full) ----------
const filaMayoIdx = rows.findIndex((r,i)=> i>0 && norm(r[TH('Tarjeta')])===norm(TARJ) && String(r[TH('Mes')]).trim()==='5' && String(r[TH('Año')]).includes('2026'))
console.log('=== B) MES PASADO (mes 5, ya pagado full 05/06) — completo USD pagado ===')
if (filaMayoIdx > 0) {
  const upd = { range:`TARJETAS!${colLetra(TH('Monto pagado USD'))}${filaMayoIdx+1}`, values:[[44.55]] }
  console.log(`  fila ${filaMayoIdx+1}: Monto pagado USD = 44,55 (pago full ya marcado SI)`)
  if (!DRY) { await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody:{ valueInputOption:'USER_ENTERED', data:[upd] } }); console.log('  ✓ actualizado') }
} else { console.log('  ⚠ no encontré la fila de mes 5') }

// ---------- C) registrar resumen de julio (mes 6) ----------
console.log('\n=== C) RESUMEN JULIO (mes 6, vto 13/07) ===')
const TOTAL_ARS = 2442246.61, TOTAL_USD = 21.78
const yaMes6 = rows.findIndex((r,i)=> i>0 && norm(r[TH('Tarjeta')])===norm(TARJ) && String(r[TH('Mes')]).trim()===String(MES) && String(r[TH('Año')]).includes('2026'))
const notaJul = 'Personal Juan 1.431.637 · Magma 1.019.758 (+US$22) · Sofi 0 · Percep.AFIP neta -9.149 · SIN deuda financiada (mes ant. pagado full) · Total a pagar 2.442.247'
const nueva = new Array(Math.max(th.length,14)).fill('')
const put = (name,val)=>{ if(TH(name)!==-1) nueva[TH(name)]=val }
put('Tarjeta',TARJ); put('Mes',MES); put('Año',ANIO); put('Monto',TOTAL_ARS); put('Monto USD',TOTAL_USD)
put('Vencimiento','13/07/2026'); put('Pagado','NO'); put('Cuenta pago','Galicia Sofi'); put('Notas',notaJul)
console.log(`  TARJETAS: ${TARJ} · mes ${MES} · $${fmt(TOTAL_ARS)} + US$${TOTAL_USD} · vence 13/07/2026 · Pagado=NO`)
console.log(`  Notas: ${notaJul}`)
if (yaMes6 > 0) console.log(`  (ya existe fila mes 6 en ${yaMes6+1} — se omite append)`)
else if (!DRY) { await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range:'TARJETAS!A:N', valueInputOption:'USER_ENTERED', insertDataOption:'INSERT_ROWS', requestBody:{ values:[nueva] } }); console.log('  ✓ fila agregada') }

// ---------- movimientos del mes 6 ----------
const CB = 'juan (manual)'
const movs = [
  // Juan — personal (naranja)
  [TARJ,MES,ANIO,'01/04','Juan','Retiro Juan (cuota JUAN MARTIN ARAUZ 03/03, x2)','ARS',1333333.32,'Personal','Personal',CB,''],
  [TARJ,MES,ANIO,'19/06','Juan','Seguro auto Juan (La Segunda 04/40)','ARS',98304.00,'Personal','Personal',CB,''],
  // Magma — empresa (sin pintar)
  [TARJ,MES,ANIO,'','Magma','Adobe (x2)','ARS',118071.80,'Empresa','Software · Edición/diseño',CB,''],
  [TARJ,MES,ANIO,'05/06','Magma','PayU Uber','ARS',16766.00,'Empresa','Producción · Movilidad',CB,''],
  [TARJ,MES,ANIO,'24/06','Magma','PERSFLOW73610001 (débito auto)','ARS',38911.57,'Empresa','Otros',CB,''],
  [TARJ,MES,ANIO,'12/05','Magma','BIDCOM (cuota 02/03)','ARS',32349.66,'Empresa','Compras · Insumos/equipos',CB,''],
  [TARJ,MES,ANIO,'','Magma','Seguros Magma (La Segunda x3: 06/11/30)','ARS',813659.20,'Empresa','Seguros',CB,''],
  [TARJ,MES,ANIO,'24/06','Magma','OpenAI ChatGPT','USD',21.78,'Empresa','Software · IA',CB,''],
  // Cargos / percepciones (neto)
  [TARJ,MES,ANIO,'02/07','Magma','Percep. AFIP RG 4815 30%','ARS',9729.13,'Empresa','Costos bancarios',CB,''],
  [TARJ,MES,ANIO,'','Magma','Devolución percep. RG 4815 30%','ARS',-18878.07,'Empresa','Costos bancarios',CB,''],
]
const sumArs = movs.filter(m=>m[6]==='ARS').reduce((s,m)=>s+m[7],0)
const juanArs = movs.filter(m=>m[4]==='Juan'&&m[6]==='ARS').reduce((s,m)=>s+m[7],0)
const magmaArs = movs.filter(m=>m[4]==='Magma'&&m[6]==='ARS'&&m[9]!=='Costos bancarios').reduce((s,m)=>s+m[7],0)
console.log(`\n  MOVIMIENTOS_TARJETA: ${movs.length} filas`)
console.log(`    Juan personal ARS: $${fmt(juanArs)}`)
console.log(`    Magma ARS: $${fmt(magmaArs)}  (+ percep. neta $${fmt(9729.13-18878.07)})`)
console.log(`    Suma ítems ARS: $${fmt(sumArs)}  → deuda financiada = ${fmt(TOTAL_ARS)} - ${fmt(sumArs)} = $${fmt(TOTAL_ARS-sumArs)}`)

const mr = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'MOVIMIENTOS_TARJETA!A:C' })
const mrows = mr.data.values||[]
const dupMes6 = mrows.map((r,i)=>({r,i})).filter(({r},i)=> i>0 && norm(r[0])===norm(TARJ) && String(r[1]).trim()===String(MES) && String(r[2]).includes('2026'))
if (dupMes6.length) console.log(`  (ya hay ${dupMes6.length} movimientos mes 6 — se omite; borralos si querés recargar)`)
else if (!DRY) { await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range:'MOVIMIENTOS_TARJETA!A:L', valueInputOption:'USER_ENTERED', insertDataOption:'INSERT_ROWS', requestBody:{ values: movs } }); console.log('  ✓ movimientos agregados') }

if (DRY) console.log('\n(DRY RUN — no se escribió nada)')
