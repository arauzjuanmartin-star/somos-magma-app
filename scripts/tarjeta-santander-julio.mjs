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

// ---------- B) marcar mes 5 (fila del mes pasado) como pagado ----------
const tr = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'TARJETAS!A:N' })
const rows = tr.data.values||[], th = rows[0]||[]
const TH = n => th.indexOf(n)
const filaMayoIdx = rows.findIndex((r,i)=> i>0 && norm(r[TH('Tarjeta')])==='santander visa' && String(r[TH('Mes')]).trim()==='5' && String(r[TH('Año')]).includes('2026'))

console.log('=== B) MES PASADO (mayo, vto 05/06) — marcar pagado ===')
if (filaMayoIdx > 0) {
  const setCol = (name,val)=>({ range:`TARJETAS!${colLetra(TH(name))}${filaMayoIdx+1}`, values:[[val]] })
  const notaMayo = 'Pago parcial 05/06: $744.044 + US$126,45. Quedaron $5.931.539 FINANCIADOS → arrastran al resumen de julio. Juan 1.596.518 · Sofi 153.333 · Empresa 403.290'
  const upsMayo = [
    setCol('Pagado','SI'),
    setCol('Fecha pago','05/06/2026'),
    setCol('Monto pagado', 744044.19),
    setCol('Monto pagado USD', 126.45),
    setCol('Notas', notaMayo),
  ]
  console.log(`  fila ${filaMayoIdx+1}: Pagado=SI · Fecha pago=05/06/2026 · Monto pagado=$744.044,19 + US$126,45`)
  console.log(`  Notas: ${notaMayo}`)
  if (!DRY) { await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody:{ valueInputOption:'USER_ENTERED', data: upsMayo } }); console.log('  ✓ actualizado') }
} else { console.log('  ⚠ no encontré la fila de mayo') }

// ---------- C) registrar resumen de julio (mes 6) ----------
console.log('\n=== C) RESUMEN JULIO (mes 6, vto 13/07) ===')
const TOTAL_ARS = 9531432.66, TOTAL_USD = 192.65
const yaMes6 = rows.findIndex((r,i)=> i>0 && norm(r[TH('Tarjeta')])==='santander visa' && String(r[TH('Mes')]).trim()==='6' && String(r[TH('Año')]).includes('2026'))
const notaJul = 'Personal Juan 2.611.516 · Magma 279.204 (+US$144) · Financiado mes ant. 5.931.539 · Cargos 709.174 · Total a pagar 9.531.433'
const nueva = new Array(Math.max(th.length,14)).fill('')
const put = (name,val)=>{ if(TH(name)!==-1) nueva[TH(name)]=val }
put('Tarjeta','Santander Visa'); put('Mes',6); put('Año',2026); put('Monto',TOTAL_ARS); put('Monto USD',TOTAL_USD)
put('Vencimiento','13/07/2026'); put('Pagado','NO'); put('Cuenta pago','Santander Sofi'); put('Notas',notaJul)
console.log(`  TARJETAS: Santander Visa · mes 6 · $${fmt(TOTAL_ARS)} + US$${TOTAL_USD} · vence 13/07/2026 · Pagado=NO`)
console.log(`  Notas: ${notaJul}`)
if (yaMes6 > 0) console.log(`  (ya existe fila mes 6 en ${yaMes6+1} — se omite append para no duplicar)`)
else if (!DRY) { await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range:'TARJETAS!A:N', valueInputOption:'USER_ENTERED', insertDataOption:'INSERT_ROWS', requestBody:{ values:[nueva] } }); console.log('  ✓ fila agregada') }

// ---------- movimientos del mes 6 ----------
// [Tarjeta, Mes, Año, Fecha, Descripcion(quién), Comercio, Moneda, Monto, Categoria, Subcategoria, Cargado por, Notas]
const M = 'Santander Visa', A = 2026, CB = 'juan (manual)'
const movs = [
  // Juan — personal
  [M,6,A,'','Juan','Pagos a personas (Delatorre 909k · Fridman 413k · Asoc.Vena 150k · Glikman · Darriba · R.Alfredo · Lola/Mora Arauz · Claudio · Andrea · Open25)','ARS',1728628.94,'Personal','Personal',CB,''],
  [M,6,A,'','Juan','Cuotas (Ailes SA 330.815 · PasajesCDP 62.108 · Chipote 6.178 · DF Festival 107.500)','ARS',506601.16,'Personal','Personal',CB,''],
  [M,6,A,'07/06','Juan','DF Entertainment (entradas)','ARS',112500,'Personal','Personal',CB,''],
  [M,6,A,'','Juan','Restaurantes (Fabric Sushi · La Cabaña)','ARS',131750,'Personal','Personal',CB,''],
  [M,6,A,'','Juan','Comida / Rappi','ARS',107795.40,'Personal','Personal',CB,''],
  [M,6,A,'20/06','Juan','Nafta/tienda personal (AppYPF Tienda)','ARS',19200,'Personal','Personal',CB,''],
  [M,6,A,'18/06','Juan','Estacionamiento (Parking)','ARS',5040,'Personal','Personal',CB,''],
  [M,6,A,'05/06','Juan','Skool (curso)','USD',49,'Personal','Personal',CB,''],
  // Magma — empresa
  [M,6,A,'','Magma','Combustible rodaje (AppYPF Comb + Shell)','ARS',234135.06,'Empresa','Producción · Nafta',CB,''],
  [M,6,A,'','Magma','Movilidad (Cabify)','ARS',24364.94,'Empresa','Producción · Movilidad',CB,''],
  [M,6,A,'15/06','Magma','MercadoPago CR','ARS',20703.96,'Empresa','Otros',CB,''],
  [M,6,A,'','Magma','Software (Apple/Google/OpenAI/Amazon/SQSP/Halls/Uber)','USD',143.65,'Empresa','Software · Suscripciones',CB,''],
  [M,6,A,'02/07','Magma','Cargos bancarios (int 509.462 + IVA + IIBB + DB.RG5617)','ARS',709174.05,'Empresa','Costos bancarios',CB,''],
]
const sumArs = movs.filter(m=>m[6]==='ARS').reduce((s,m)=>s+m[7],0)
const juanArs = movs.filter(m=>m[4]==='Juan'&&m[6]==='ARS').reduce((s,m)=>s+m[7],0)
const magmaArs = movs.filter(m=>m[4]==='Magma'&&m[6]==='ARS'&&m[9]!=='Costos bancarios').reduce((s,m)=>s+m[7],0)
console.log(`\n  MOVIMIENTOS_TARJETA: ${movs.length} filas`)
console.log(`    Juan personal ARS: $${fmt(juanArs)}`)
console.log(`    Magma ARS: $${fmt(magmaArs)}  (+ cargos $${fmt(709174.05)})`)
console.log(`    Suma ítems ARS: $${fmt(sumArs)}  → deuda financiada = ${fmt(TOTAL_ARS)} - ${fmt(sumArs)} = $${fmt(TOTAL_ARS-sumArs)}`)

// dedup mes 6 en MOVIMIENTOS_TARJETA
const mr = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'MOVIMIENTOS_TARJETA!A:C' })
const mrows = mr.data.values||[]
const dupMes6 = mrows.map((r,i)=>({r,i})).filter(({r},i)=> i>0 && norm(r[0])==='santander visa' && String(r[1]).trim()==='6' && String(r[2]).includes('2026'))
if (dupMes6.length) console.log(`  (ya hay ${dupMes6.length} movimientos mes 6 — se omite para no duplicar; borralos si querés recargar)`)
else if (!DRY) {
  await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range:'MOVIMIENTOS_TARJETA!A:L', valueInputOption:'USER_ENTERED', insertDataOption:'INSERT_ROWS', requestBody:{ values: movs } })
  console.log('  ✓ movimientos agregados')
}

if (DRY) console.log('\n(DRY RUN — no se escribió nada)')
