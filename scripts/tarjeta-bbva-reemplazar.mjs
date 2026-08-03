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
const TARJ='BBVA Visa', MES=6, ANIO=2026, CB='juan (manual)'
const TOTAL_ARS=5399950.86, CARGOS=833364.92, NAFTA=435741.71, TRAVEL=585303.85, MAGMA_USD=2059.23

// Juan personal — CONFIRMADO por Juan (suma $573.108,04 + US$14,04)
const juan = [
  ['16/04','MERPAGO*ROUGE (cuota 03/09)','ARS',45000],['18/04','MERPAGO*PASAJESCDP (cuota 03/03)','ARS',14275.83],
  ['18/04','MERPAGO*PASAJESCDP (cuota 03/03)','ARS',15348.33],['18/04','MERPAGO*CHIPOTE (cuota 03/06)','ARS',2666.66],
  ['18/04','GONZALEZ SILVINA (cuota 03/03)','ARS',11633.33],['19/05','TOPPER (cuota 02/03)','ARS',26033],
  ['22/05','MERPAGO*PASAJESCDP (cuota 02/03)','ARS',59756.66],['22/05','EQUUS (cuota 02/06)','ARS',64616.62],
  ['31/05','DISNEY PLUS','ARS',23999],['01/06','MERPAGO*MORAARAUZ','ARS',32097],
  ['02/06','ESTER EXPRESS','ARS',21012],['05/06','NETFLIX.COM','USD',14.04],
  ['06/06','MERPAGO*COTO','ARS',60427.80],['07/06','CP*FACTURAS CLARO','ARS',30587.60],
  ['08/06','MERPAGO*NEVERLAND','ARS',33900],['10/06','CP*FACTURAS CLARO','ARS',30551.69],
  ['18/06','LUCCIANOS','ARS',6800],['18/06','TOSTADO CAFE CLUB','ARS',24300],
  ['21/06','CARREFOUR GUALEGUAYCHU','ARS',38643.52],['21/06','MOSTAZA GUALEGUAYCHU','ARS',7460],
  ['30/06','DISNEY PLUS','ARS',23999],
]
// Sofi personal — LECTURA MÍA, falta que Juan confirme
const sofi = [
  ['16/04','MERPAGO*GANGAHOME (cuota 03/09)','ARS',20150.88],['20/04','MERPAGO*FLORIAN (cuota 03/12)','ARS',46325],
  ['23/04','MERPAGO*REINACASA (cuota 03/03)','ARS',34400],['26/04','MERPAGO*LUBOLOQUE (cuota 03/06)','ARS',8333.33],
  ['08/05','47 STREET (cuota 02/06)','ARS',23091.38],['08/05','ZARA (cuota 02/03)','ARS',36550.96],
  ['08/05','LAS PEPAS (cuota 02/03)','ARS',59966.66],['12/05','MERPAGO*TOYOTATREOS (cuota 02/03)','ARS',158329.18],
  ['29/05','MERPAGO*TOBICAR','ARS',65000],['31/05','MERPAGO*MISHKA (cuota 01/06)','ARS',67465.59],
  ['21/06','MERPAGO*CAPITALBRANDS','ARS',104958.68],['21/06','NOBLE ADA SA','ARS',42600],['29/06','MERPAGO*ALPINA','ARS',143856],
]
const juanArs = juan.filter(m=>m[2]==='ARS').reduce((s,m)=>s+m[3],0)
const sofiArs = sofi.filter(m=>m[2]==='ARS').reduce((s,m)=>s+m[3],0)
const RESTO = Math.round((TOTAL_ARS - CARGOS - juanArs - sofiArs - NAFTA - TRAVEL)*100)/100
const magmaArs = NAFTA + TRAVEL + RESTO
const movs = [
  ...juan.map(m=>[TARJ,MES,ANIO,m[0],'Juan',m[1],m[2],m[3],'Personal','Personal',CB,'']),
  ...sofi.map(m=>[TARJ,MES,ANIO,m[0],'Sofi',m[1],m[2],m[3],'Personal','Personal',CB,'']),
  [TARJ,MES,ANIO,'','Magma','Nafta (AppYPF/YPF x5)','ARS',NAFTA,'Empresa','Producción · Nafta',CB,''],
  [TARJ,MES,ANIO,'25/06','Magma','Travel Services (x2) — viaje Kansas/Montevideo','ARS',TRAVEL,'Empresa','Producción · Viajes',CB,'REVISAR si es laburo o personal de Sofi'],
  [TARJ,MES,ANIO,'','Magma','Resto Magma (comida, súper, Rappi, Didi/Cabify, software, restós, varios)','ARS',RESTO,'Empresa','Varios empresa',CB,''],
  [TARJ,MES,ANIO,'','Magma','Software/ads USD (Adobe/Anthropic/Google/Apple/Amazon/FB ads/Capcut)','USD',MAGMA_USD,'Empresa','Software · Suscripciones',CB,''],
  [TARJ,MES,ANIO,'02/07','Magma','Cargos bancarios netos (IVA+comisión+percep+DB.RG5617 − crédito CR.RG)','ARS',CARGOS,'Empresa','Costos bancarios',CB,''],
]
const sumArs = movs.filter(m=>m[6]==='ARS').reduce((s,m)=>s+m[7],0)
const sumUsd = movs.filter(m=>m[6]==='USD').reduce((s,m)=>s+m[7],0)

console.log(`Juan personal: $${fmt(juanArs)} + US$14,04  (esperado 573.108,04 → ${juanArs===573108.04?'OK ✓':'DIFERENCIA'})`)
console.log(`Sofi personal: $${fmt(sofiArs)} (mi lectura, a confirmar)`)
console.log(`Magma: $${fmt(magmaArs)} + US$${fmt(MAGMA_USD)}  ·  Cargos $${fmt(CARGOS)}`)
console.log(`Σ ARS ítems: $${fmt(sumArs)}  (total ${fmt(TOTAL_ARS)} → deuda ${fmt(TOTAL_ARS-sumArs)}) · Σ USD: ${fmt(sumUsd)}`)

const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties(title,sheetId))' })
const sid = meta.data.sheets.find(s=>s.properties.title==='MOVIMIENTOS_TARJETA').properties.sheetId
const cur = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'MOVIMIENTOS_TARJETA!A:L' })).data.values||[]
const delIdx = cur.map((r,i)=>({r,i})).filter(({r},i)=> i>0 && norm(r[0])===norm(TARJ) && String(r[1]).trim()===String(MES) && String(r[2]).includes('2026')).map(x=>x.i)
console.log(`\nBorrar ${delIdx.length} movs BBVA mes 6 actuales · Cargar ${movs.length} nuevos`)
if (!DRY) {
  if (delIdx.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: delIdx.sort((a,b)=>b-a).map(i=>({ deleteDimension:{ range:{ sheetId:sid, dimension:'ROWS', startIndex:i, endIndex:i+1 } } })) } })
  await sheets.spreadsheets.values.append({ spreadsheetId:SHEET_ID, range:'MOVIMIENTOS_TARJETA!A:L', valueInputOption:'USER_ENTERED', insertDataOption:'INSERT_ROWS', requestBody:{ values:movs } })
  const tr = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'TARJETAS!A:N' })
  const rows=tr.data.values||[], th=rows[0]||[], TH=n=>th.indexOf(n)
  const f6 = rows.findIndex((r,i)=> i>0 && norm(r[TH('Tarjeta')])===norm(TARJ) && String(r[TH('Mes')]).trim()===String(MES) && String(r[TH('Año')]).includes('2026'))
  const nota = `Personal Juan ${fmt(juanArs).split(',')[0]} (+US$14, CONFIRMADO) · Sofi ${fmt(sofiArs).split(',')[0]} (a confirmar) · Magma ${fmt(magmaArs).split(',')[0]} (+US$2.059) · cargos 833.365 · SIN deuda. Travel Services 585k a revisar`
  if (f6>0) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId:SHEET_ID, requestBody:{ valueInputOption:'USER_ENTERED', data:[{ range:`TARJETAS!${colLetra(TH('Notas'))}${f6+1}`, values:[[nota]] }] } })
  console.log('✓ reemplazado + nota actualizada')
} else console.log('(DRY)')
