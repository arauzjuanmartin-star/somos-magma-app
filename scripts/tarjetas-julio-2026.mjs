/**
 * TARJETAS JULIO 2026 — clasifica y carga los dos resúmenes (cierre 30/07, vto 07/08).
 *   · BBVA Visa Business  (Magma) — titulares Juan y Sofi
 *   · Master Galicia      (a nombre de Sofi, adicional Juan)
 *
 * Criterio: el mismo del lector de la app (pages/api/tarjeta-procesar.js).
 *   Empresa SOLO si es claramente producción/operación: nafta, movilidad (Cabify/DiDi),
 *   software de trabajo, ads, seguros, servicios de la oficina, insumos.
 *   Todo lo demás Personal. Ante la duda, Personal.
 * Precedentes respetados (cómo se cargó en meses anteriores): MercadoLibre/GangaHome/
 *   Svccomar/Gamestation/Bidcom = Empresa · La Segunda de Magma = Empresa · Netflix = Personal.
 *
 * Sin --escribir solo muestra el preview. Con --escribir toca el sheet.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth = new google.auth.GoogleAuth({ credentials:{ client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') }, scopes:['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version:'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')

const M = n => '$' + n.toLocaleString('es-AR',{ minimumFractionDigits:2, maximumFractionDigits:2 })
const U = n => 'USD ' + n.toLocaleString('es-AR',{ minimumFractionDigits:2, maximumFractionDigits:2 })
const MES = 7, ANIO = 2026, VTO = '07/08/2026'

// ─────────────────────────────────────────────────────────────────────────────
// BBVA VISA BUSINESS — cierre 30/07/2026
// [fecha, comercio, monto, moneda, categoria, rubro, cuota]
// ─────────────────────────────────────────────────────────────────────────────
const E='Empresa', P='Personal'
const NAFTA='Producción · Nafta', MOV='Producción · Movilidad', SOFT='Software · Edición/diseño'
const IA='Software · IA', WEB='Software · Web/productividad', ADS='Publicidad · Meta Ads'
const SEG='Seguros', OFI='Oficina · Servicios', NET='Oficina · Internet (tarjeta)'
const ML='Compras · Mercado Libre', INS='Compras · Insumos/equipos'
const BCO='Costos bancarios', PER='Percepciones a recuperar'

const JUAN = [
  ['16/04','MERPAGO*ROUGE (cuota 04/09)',              45000.00,'ARS',P,'Personal','4/9'],
  ['18/04','MERPAGO*CHIPOTE (cuota 04/06)',             2666.66,'ARS',P,'Personal','4/6'],
  ['30/04','MERPAGO*MERCADOLIBRE (cuota 03/06)',       28498.50,'ARS',E,ML,'3/6'],
  ['19/05','TOPPER ARGENTINA SA (cuota 03/03)',        26033.00,'ARS',P,'Personal','3/3'],
  ['22/05','MERPAGO*PASAJESCDP (cuota 03/03)',         59756.66,'ARS',P,'Personal','3/3'],
  ['22/05','EQUUS (cuota 03/06)',                      64616.62,'ARS',P,'Personal','3/6'],
  ['02/07','CABIFY AR',                                14285.55,'ARS',E,MOV,''],
  ['02/07','CABIFY AR',                                13156.61,'ARS',E,MOV,''],
  ['02/07','ABL 4108264 (oficina)',                    13791.09,'ARS',E,OFI,''],
  ['02/07','EDENOR DIGITAL (oficina)',                 34794.28,'ARS',E,OFI,''],
  ['02/07','METROGAS (oficina)',                       11184.55,'ARS',E,OFI,''],
  ['02/07','PVS*SUPER CRAMER',                         39800.00,'ARS',P,'Personal',''],
  ['03/07','PROPINA*RAPPI',                             1580.00,'ARS',P,'Personal',''],
  ['03/07','RAPPI',                                    20632.00,'ARS',P,'Personal',''],
  ['03/07','HERMOSILLA ADELA',                         68871.00,'ARS',P,'Personal',''],
  ['05/07','APPYPF 31058 COMBUST',                    100001.98,'ARS',E,NAFTA,''],
  ['06/07','MERPAGO*GALLIOELECTRO',                    19398.98,'ARS',P,'Personal',''],
  ['07/07','TOTAL POLLO',                              75667.00,'ARS',P,'Personal',''],
  ['08/07','3SM*SUP PROSPERO SA',                      53665.00,'ARS',P,'Personal',''],
  ['08/07','MERPAGO*ANCHORENA765',                     14000.00,'ARS',P,'Personal',''],
  ['08/07','DIA TIENDA 317',                           26483.74,'ARS',P,'Personal',''],
  ['08/07','APPYPF 00126 TIENDA',                      11300.00,'ARS',P,'Personal',''],
  ['08/07','MC DONALDS VIA',                           23100.00,'ARS',P,'Personal',''],
  ['09/07','3SM*SUP PROSPERO SA',                      27205.00,'ARS',P,'Personal',''],
  ['09/07','MERPAGO*CRISTIANDARIOCOLM',                 9629.10,'ARS',P,'Personal',''],
  ['09/07','MERPAGO*CRISTIANDARIOCOLM',                 7639.09,'ARS',P,'Personal',''],
  ['09/07','EL MUNDO DEL JUGUETE (cuota 01/03)',       27503.34,'ARS',P,'Personal','1/3'],
  ['09/07','DLO*RAPPI',                                39215.00,'ARS',P,'Personal',''],
  ['10/07','DIA TIENDA 317',                           29947.90,'ARS',P,'Personal',''],
  ['10/07','CABIFY AR',                                33981.84,'ARS',E,MOV,''],
  ['10/07','CABIFY AR',                                17104.24,'ARS',E,MOV,''],
  ['11/07','MERPAGO*ELECTRONICAELUNIV',                56000.00,'ARS',P,'Personal',''],
  ['11/07','PROPINA*RAPPI',                             1500.00,'ARS',P,'Personal',''],
  ['11/07','RAPPI',                                    43692.50,'ARS',P,'Personal',''],
  ['11/07','PROPINA*RAPPI',                             2620.00,'ARS',P,'Personal',''],
  ['11/07','RAPPI',                                    66855.50,'ARS',P,'Personal',''],
  ['12/07','MERPAGO*DMO',                              68400.00,'ARS',P,'Personal',''],
  ['12/07','APPYPF 00126 COMBUST',                     75012.09,'ARS',E,NAFTA,''],
  ['12/07','APPYPF 00126 TIENDA',                      23500.00,'ARS',P,'Personal',''],
  ['15/07','MERPAGO*DONGATOBAR',                       18000.00,'ARS',P,'Personal',''],
  ['15/07','DLO*RAPPI PRO',                             6490.00,'ARS',P,'Personal',''],
  ['17/07','MERPAGO*BROOKLYNDVTO',                     13000.00,'ARS',P,'Personal',''],
  ['18/07','MERPAGO*RAMONBRITEZ',                       7489.30,'ARS',P,'Personal',''],
  ['18/07','LA PEDRERAA',                              68000.00,'ARS',P,'Personal',''],
  ['18/07','APPYPF 00023 COMBUST',                     60478.05,'ARS',E,NAFTA,''],
  ['20/07','MERPAGO*MARIANALUCIABONAN',                85592.00,'ARS',P,'Personal',''],
  ['20/07','MERPAGO*APPYPFCOMB',                      106020.96,'ARS',E,NAFTA,''],
  ['20/07','MERPAGO*SOSSA',                           195070.00,'ARS',P,'Personal',''],
  ['20/07','ADOBE',                                    10392.69,'ARS',E,SOFT,''],
  ['22/07','LA PEDRERAA',                              75000.00,'ARS',P,'Personal',''],
  ['22/07','ADOBE',                                    59035.90,'ARS',E,SOFT,''],
  ['24/07','MERPAGO*APPYPFCOMB',                      106757.06,'ARS',E,NAFTA,''],
  ['24/07','MERPAGO*JUANCARLOSCHAKERJ',                13373.75,'ARS',P,'Personal',''],
  ['24/07','MERPAGO*OBOK',                             16000.00,'ARS',P,'Personal',''],
  ['24/07','LA SEGUNDA CIA0460990 (póliza Magma)',    391137.86,'ARS',E,SEG,''],
  ['24/07','LA SEGUNDA CIA0460990 (cobro duplicado)', 391137.86,'ARS',E,SEG,''],
  ['24/07','LA SEGUNDA CIA0460990 (reverso duplicado)',-391137.86,'ARS',E,SEG,''],
  ['24/07','LA SEGUNDA COO0290743 (póliza Magma)',     11595.00,'ARS',E,SEG,''],
  ['25/07','CABIFY AR',                                12478.68,'ARS',E,MOV,''],
  ['26/07','DIA TIENDA 317',                           12972.30,'ARS',P,'Personal',''],
  ['26/07','DIA TIENDA 522',                           27378.45,'ARS',P,'Personal',''],
  ['26/07','CABIFY AR',                                15297.42,'ARS',E,MOV,''],
  ['26/07','CABIFY AR',                                15582.48,'ARS',E,MOV,''],
  ['26/07','APPYPF 00126 COMBUST',                     91012.91,'ARS',E,NAFTA,''],
  ['26/07','Res Cris logo',                            55179.00,'ARS',P,'Personal',''],
  ['27/07','DIA TIENDA 317',                          118687.22,'ARS',P,'Personal',''],
  ['28/07','MERPAGO*MARIANALUCIABONAN',                85592.00,'ARS',P,'Personal',''],
  ['28/07','MERPAGO*JULIOCESARREGEL',                   7168.33,'ARS',P,'Personal',''],
  ['28/07','TOTAL POLLO',                              76496.00,'ARS',P,'Personal',''],
  // dólares
  ['04/07','GOOGLE *Google',                               9.99,'USD',E,WEB,''],
  ['04/07','NETFLIX.COM',                                 13.56,'USD',P,'Personal',''],
  ['07/07','FACEBK *HEMQLW9ZJ2',                           8.11,'USD',E,ADS,''],
  ['09/07','FACEBK *N796UWHZJ2',                           8.10,'USD',E,ADS,''],
  ['09/07','ANTHROPIC* CLAUDE',                          200.00,'USD',E,IA,''],
  ['12/07','FACEBK *CFJD4XHZJ2',                          17.72,'USD',E,ADS,''],
  ['15/07','FACEBK *FHD4WXVYJ2',                          21.58,'USD',E,ADS,''],
  ['15/07','ANTHROPIC* CLAUDE',                           20.00,'USD',E,IA,''],
  ['18/07','FACEBK *PNAYUXDZJ2',                          21.47,'USD',E,ADS,''],
  ['18/07','APPLE.COM/BILL',                               1.99,'USD',E,WEB,''],
  ['18/07','APPLE.COM/BILL',                               0.99,'USD',E,WEB,''],
  ['21/07','FACEBK *WM224Y5ZJ2',                          21.47,'USD',E,ADS,''],
  ['25/07','FACEBK *RV9PCYRZJ2',                          28.32,'USD',E,ADS,''],
  ['28/07','FACEBK *BMLPGYVZJ2',                          29.48,'USD',E,ADS,''],
]

const SOFI = [
  ['16/04','MERPAGO*GANGAHOME (cuota 04/09)',          20150.88,'ARS',E,ML,'4/9'],
  ['20/04','MERPAGO*FLORIAN (cuota 04/12)',            46325.00,'ARS',P,'Personal','4/12'],
  ['26/04','MERPAGO*LUBOLOQUE (cuota 04/06)',           8333.33,'ARS',P,'Personal','4/6'],
  ['08/05','47 STREET DOT (cuota 03/06)',              23091.38,'ARS',P,'Personal','3/6'],
  ['08/05','ZARA (cuota 03/03)',                       36550.96,'ARS',P,'Personal','3/3'],
  ['08/05','LAS PEPAS (cuota 03/03)',                  59966.66,'ARS',P,'Personal','3/3'],
  ['12/05','MERPAGO*TOYOTATREOS (cuota 03/03)',       158329.18,'ARS',P,'Personal','3/3'],
  ['31/05','MERPAGO*MISHKA (cuota 02/06)',             67465.56,'ARS',P,'Personal','2/6'],
  ['11/06','MERPAGO*SVCCOMAR (cuota 02/06)',           24405.32,'ARS',E,INS,'2/6'],
  ['11/06','MERPAGO*GAMESTATION (cuota 02/06)',        51416.50,'ARS',E,INS,'2/6'],
  ['03/07','DLO*DiDi',                                 11330.00,'ARS',E,MOV,''],
  ['04/07','ADOBE',                                    34727.00,'ARS',E,SOFT,''],
  ['04/07','DLO*DIDI',                                 13390.00,'ARS',E,MOV,''],
  ['06/07','PROPINA*RAPPI',                             1720.00,'ARS',P,'Personal',''],
  ['06/07','PROPINA*RAPPI',                             1640.00,'ARS',P,'Personal',''],
  ['06/07','DLO*RAPPI',                                29630.00,'ARS',P,'Personal',''],
  ['06/07','RAPPI',                                    22512.00,'ARS',P,'Personal',''],
  ['06/07','RAPPI',                                    14472.00,'ARS',P,'Personal',''],
  ['07/07','DIA TIENDA 317',                           37382.94,'ARS',P,'Personal',''],
  ['07/07','PROPINA*RAPPI',                             2540.00,'ARS',P,'Personal',''],
  ['07/07','RAPPI',                                    52438.00,'ARS',P,'Personal',''],
  ['08/07','EDENOR SA (oficina)',                      34794.28,'ARS',E,OFI,''],
  ['08/07','DLO*PedidosYa Camorra',                    36358.00,'ARS',P,'Personal',''],
  ['08/07','PROPINA*RAPPI',                             5040.00,'ARS',P,'Personal',''],
  ['08/07','RAPPI',                                    28392.00,'ARS',P,'Personal',''],
  ['09/07','DLO*PedidosYa Propina',                     1500.00,'ARS',P,'Personal',''],
  ['09/07','PROPINA*RAPPI',                             2720.00,'ARS',P,'Personal',''],
  ['09/07','PROPINA*RAPPI',                             2480.00,'ARS',P,'Personal',''],
  ['09/07','RAPPI',                                    25074.50,'ARS',P,'Personal',''],
  ['09/07','RAPPI',                                    31632.00,'ARS',P,'Personal',''],
  ['09/07','DLO*RAPPI',                                16112.00,'ARS',P,'Personal',''],
  ['10/07','PROPINA*RAPPI',                             2000.00,'ARS',P,'Personal',''],
  ['10/07','RAPPI',                                    22124.50,'ARS',P,'Personal',''],
  ['14/07','MERPAGO*JULIOCESARREGEL',                  11233.95,'ARS',P,'Personal',''],
  ['16/07','MERPAGO*PASSLINE',                         22000.00,'ARS',P,'Personal',''],
  ['16/07','MERPAGO*PASSLINE',                         28000.00,'ARS',P,'Personal',''],
  ['16/07','MERPAGO*PASSLINE',                         39000.00,'ARS',P,'Personal',''],
  ['16/07','MERPAGO*PASSLINE',                         23500.00,'ARS',P,'Personal',''],
  ['16/07','MERPAGO*PASSLINE',                         71000.00,'ARS',P,'Personal',''],
  ['16/07','MERPAGO*LUZMARIAVIGNOLA',                   5349.50,'ARS',P,'Personal',''],
  ['16/07','PROPINA*RAPPI',                              940.00,'ARS',P,'Personal',''],
  ['16/07','RAPPI',                                     8226.50,'ARS',P,'Personal',''],
  ['18/07','PROPINA*RAPPI',                             2580.00,'ARS',P,'Personal',''],
  ['18/07','RAPPI',                                    64390.00,'ARS',P,'Personal',''],
  ['24/07','PERSONAL FLOW (internet oficina)',         39683.46,'ARS',E,NET,''],
  ['24/07','PERSONAL FLOW (cobro duplicado)',          39683.46,'ARS',E,NET,''],
  ['24/07','PERSONAL FLOW (reverso duplicado)',       -39683.46,'ARS',E,NET,''],
  ['29/07','DIA TIENDA 317',                           41085.23,'ARS',P,'Personal',''],
  ['29/07','PROPINA*RAPPI',                             1320.00,'ARS',P,'Personal',''],
  ['29/07','RAPPI',                                    11390.00,'ARS',P,'Personal',''],
  // dólares
  ['13/07','APPLE.COM/BILL',                               2.99,'USD',E,WEB,''],
  ['24/07','OPENAI *CHATGPT (EUR 19,01)',                 21.96,'USD',E,IA,''],
  ['25/07','GOOGLE *YouTube Premium',                      3.05,'USD',P,'Personal',''],
  ['27/07','ANTHROPIC* CLAUDE',                           20.00,'USD',E,IA,''],
]

const CARGOS = [
  ['30/07','Costos bancarios (comisión $7.128,10 + IVA $1.496,90 + percep. IVA $213,84 + IIBB CABA $5.649,49)', 14488.33,'ARS',E,BCO,''],
  ['30/07','DB.RG 5617 30% — pago a cuenta, NO es gasto',                                                     202310.06,'ARS',E,PER,''],
]

// ─────────────────────────────────────────────────────────────────────────────
// MASTER GALICIA — cierre 30/07/2026
// ─────────────────────────────────────────────────────────────────────────────
const GAL_SOFI = [
  ['27/07','VENTI TICKETS',                           105000.00,'ARS',P,'Personal',''],
  ['27/07','VENTI TICKETS',                            15750.00,'ARS',P,'Personal',''],
]
const GAL_MAGMA = [
  ['12/05','BIDCOM (cuota 03/03)',                     32349.66,'ARS',E,INS,'3/3'],
  ['30/07','DEV PER RG 4815 30% — devolución percepción',-9729.13,'ARS',E,PER,''],
]

// ── control contra los totales impresos del resumen ──────────────────────────
const suma = (arr,mon) => arr.filter(m=>m[3]===mon).reduce((a,m)=>a+m[2],0)
const r2 = n => Math.round(n*100)/100
const controles = [
  ['BBVA · consumos Juan ARS',   r2(suma(JUAN,'ARS')),  3059366.18],
  ['BBVA · consumos Juan USD',   r2(suma(JUAN,'USD')),  402.78],
  ['BBVA · consumos Sofi ARS',   r2(suma(SOFI,'ARS')),  1295742.63],
  ['BBVA · consumos Sofi USD',   r2(suma(SOFI,'USD')),  48.00],
  ['BBVA · cargos ARS',          r2(suma(CARGOS,'ARS')),216798.39],
  ['Galicia · consumos ARS',     r2(suma(GAL_SOFI,'ARS')+suma(GAL_MAGMA,'ARS')+9729.13), 153099.66],
]
let ok = true
console.log('\n\x1b[1m■ CONTROL contra los totales impresos del resumen\x1b[0m')
controles.forEach(([n,calc,esp])=>{
  const bien = Math.abs(calc-esp) < 0.02
  if(!bien) ok = false
  console.log(`   ${bien?'\x1b[32m✓\x1b[0m':'\x1b[31m✗\x1b[0m'} ${n.padEnd(28)} calculado ${String(calc).padStart(14)}  ·  resumen ${String(esp).padStart(14)}`)
})
if(!ok){ console.log('\n\x1b[31mLos totales no cierran. No escribo nada.\x1b[0m\n'); process.exit(1) }

// ── preview ──────────────────────────────────────────────────────────────────
const linea = (m,tit) => `   ${(m[0]||'').padEnd(7)} ${m[1].slice(0,46).padEnd(48)} ${(m[3]==='USD'?U(m[2]):M(m[2])).padStart(16)}  ${m[4]==='Empresa'?'\x1b[36mEMPRESA\x1b[0m':'\x1b[33mpersonal\x1b[0m'}  ${m[5]===('Personal')?'':m[5]}`

const bloque = (titulo, movs, tit) => {
  console.log(`\n\x1b[1m${titulo}\x1b[0m`)
  const emp = movs.filter(m=>m[4]==='Empresa'), per = movs.filter(m=>m[4]==='Personal')
  console.log(`  \x1b[36m— EMPRESA (${emp.length})\x1b[0m`); emp.forEach(m=>console.log(linea(m,tit)))
  console.log(`  \x1b[33m— PERSONAL (${per.length})\x1b[0m`); per.forEach(m=>console.log(linea(m,tit)))
  const eA=r2(suma(emp,'ARS')), pA=r2(suma(per,'ARS')), eU=r2(suma(emp,'USD')), pU=r2(suma(per,'USD'))
  console.log(`  \x1b[1m  Empresa ${M(eA).padStart(16)} + ${U(eU)}   ·   Personal ${M(pA).padStart(16)} + ${U(pU)}\x1b[0m`)
  return {eA,pA,eU,pU}
}

console.log('\n\x1b[1m════════ BBVA VISA BUSINESS — julio 2026 (cierre 30/07, vto 07/08) ════════\x1b[0m')
const j = bloque('▸ JUAN MARTIN ARAUZ', JUAN, 'Juan')
const s = bloque('▸ SOFIA MARIA GRENIER', SOFI, 'Sofi')
const c = bloque('▸ CARGOS DEL BANCO', CARGOS, 'Magma')

console.log('\n\x1b[1m════════ MASTER GALICIA — julio 2026 (cierre 30/07, vto 07/08) ════════\x1b[0m')
const gs = bloque('▸ SOFI', GAL_SOFI, 'Sofi')
const gm = bloque('▸ MAGMA', GAL_MAGMA, 'Magma')

// ── resumen ejecutivo ────────────────────────────────────────────────────────
const totEmpA = j.eA+s.eA+c.eA+gs.eA+gm.eA, totPerA = j.pA+s.pA+gs.pA+gm.pA
const totEmpU = j.eU+s.eU, totPerU = j.pU+s.pU
console.log('\n\x1b[1m════════ RESUMEN ════════\x1b[0m')
console.log(`   EMPRESA  ${M(r2(totEmpA)).padStart(16)}  + ${U(r2(totEmpU))}`)
console.log(`   PERSONAL ${M(r2(totPerA)).padStart(16)}  + ${U(r2(totPerU))}`)
console.log(`   ${'─'.repeat(46)}`)
console.log(`   Personal de Juan  ${M(r2(j.pA)).padStart(16)}  + ${U(r2(j.pU))}   → va a su cuenta de socio`)
console.log(`   Personal de Sofi  ${M(r2(s.pA+gs.pA)).padStart(16)}  + ${U(r2(s.pU))}   → va a su cuenta de socio`)
const rappi = [...JUAN,...SOFI].filter(m=>/rappi|pedidosya/i.test(m[1])).reduce((a,m)=>a+m[2],0)
const super_ = [...JUAN,...SOFI].filter(m=>/dia tienda|super|prospero|cramer/i.test(m[1])).reduce((a,m)=>a+m[2],0)
console.log(`\n   Delivery (Rappi + PedidosYa) del mes:  ${M(r2(rappi))}`)
console.log(`   Supermercado del mes:                  ${M(r2(super_))}`)

if(!ESCRIBIR){ console.log('\n\x1b[33mPREVIEW — no escribí nada. Corré con --escribir para cargarlo.\x1b[0m\n'); process.exit(0) }

// ── escritura ────────────────────────────────────────────────────────────────
const norm = v => String(v||'').trim().toLowerCase()
const meta = await sheets.spreadsheets.get({ spreadsheetId:ID, fields:'sheets(properties(title,sheetId))' })
const sid = t => meta.data.sheets.find(x=>x.properties.title===t)?.properties.sheetId

// 1) MOVIMIENTOS_TARJETA — borra julio de ambas tarjetas y reescribe
const filas = []
const push = (tarjeta, tit, movs) => movs.forEach(m =>
  filas.push([tarjeta, MES, ANIO, m[0], tit, m[1], m[3], m[2], m[4], m[5], 'juan@somosmagma.com', m[4]==='Empresa'?`gastó ${tit}`:'']))
push('BBVA Visa','Juan',JUAN); push('BBVA Visa','Sofi',SOFI); push('BBVA Visa','Magma',CARGOS)
push('Master Galicia','Sofi',GAL_SOFI); push('Master Galicia','Magma',GAL_MAGMA)

const cur = (await sheets.spreadsheets.values.get({ spreadsheetId:ID, range:'MOVIMIENTOS_TARJETA!A:C' })).data.values || []
const del = cur.map((r,i)=>({r,i})).filter(({r},i)=> i>0 && ['bbva visa','master galicia'].includes(norm(r[0])) && String(r[1]).trim()===String(MES) && String(r[2]).includes(String(ANIO))).map(x=>x.i)
if(del.length){
  console.log(`\n   borrando ${del.length} filas de julio ya existentes en MOVIMIENTOS_TARJETA…`)
  await sheets.spreadsheets.batchUpdate({ spreadsheetId:ID, requestBody:{ requests: del.sort((a,b)=>b-a).map(i=>({ deleteDimension:{ range:{ sheetId:sid('MOVIMIENTOS_TARJETA'), dimension:'ROWS', startIndex:i, endIndex:i+1 } } })) } })
}
await sheets.spreadsheets.values.append({ spreadsheetId:ID, range:'MOVIMIENTOS_TARJETA!A:L', valueInputOption:'USER_ENTERED', insertDataOption:'INSERT_ROWS', requestBody:{ values: filas } })
console.log(`   ✓ MOVIMIENTOS_TARJETA: ${filas.length} filas`)

// 2) CUOTAS — reemplaza las de estas dos tarjetas con las de estos resúmenes
const cuotasDe = (tarjeta, tit, movs) => movs.filter(m=>m[6]).map(m=>{
  const [act,tot] = m[6].split('/').map(Number)
  const pers = m[4]==='Empresa' ? 'Magma' : tit
  return [m[1].replace(/\s*\(cuota[^)]*\)/,''), pers, tarjeta, m[4], m[2], act, tot, 8, ANIO, act<tot?'Activa':'Terminada','']
})
const filasC = [...cuotasDe('BBVA Visa','Juan',JUAN), ...cuotasDe('BBVA Visa','Sofi',SOFI), ...cuotasDe('Master Galicia','Magma',GAL_MAGMA)]
const curC = (await sheets.spreadsheets.values.get({ spreadsheetId:ID, range:'CUOTAS!A:K' })).data.values || []
const delC = curC.map((r,i)=>({r,i})).filter(({r},i)=> i>0 && ['bbva visa','master galicia'].includes(norm(r[2]))).map(x=>x.i)
if(delC.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId:ID, requestBody:{ requests: delC.sort((a,b)=>b-a).map(i=>({ deleteDimension:{ range:{ sheetId:sid('CUOTAS'), dimension:'ROWS', startIndex:i, endIndex:i+1 } } })) } })
await sheets.spreadsheets.values.append({ spreadsheetId:ID, range:'CUOTAS!A:K', valueInputOption:'USER_ENTERED', insertDataOption:'INSERT_ROWS', requestBody:{ values: filasC } })
const aVencer = filasC.filter(f=>f[9]==='Activa').reduce((a,f)=>a+f[4],0)
console.log(`   ✓ CUOTAS: ${filasC.length} filas (${filasC.filter(f=>f[9]==='Activa').length} activas · ${M(r2(aVencer))} a vencer en agosto)`)

// 3) TARJETAS — upsert del total del mes
const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)} return s }
const tr = (await sheets.spreadsheets.values.get({ spreadsheetId:ID, range:'TARJETAS!A:N' })).data.values || []
const th = tr[0], TH = n => th.indexOf(n)
const totales = [
  { tarjeta:'BBVA Visa',      ars:3789144.90, usd:450.78, nota:'Cierre 30/07. Incluye devolución CR.RG 5617 de -$782.762,30 (percepción que volvió).' },
  { tarjeta:'Master Galicia', ars:143370.53,  usd:0,      nota:'Cierre 30/07. Consumos $153.099,66 menos devolución RG 4815 de -$9.729,13. Se debita de la caja de ahorro de Sofi 0401448784.' },
]
for(const t of totales){
  const fila = tr.findIndex((row,i)=> i>0 && norm(row[TH('Tarjeta')])===norm(t.tarjeta) && String(row[TH('Mes')]).trim()===String(MES) && String(row[TH('Año')]).includes(String(ANIO)))
  if(fila>0){
    const ups=[]; const set=(n,v)=>{ if(TH(n)!==-1) ups.push({ range:`TARJETAS!${colLetra(TH(n))}${fila+1}`, values:[[v]] }) }
    set('Monto',t.ars); set('Monto USD',t.usd); set('Vencimiento',VTO); set('Notas',t.nota)
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId:ID, requestBody:{ valueInputOption:'USER_ENTERED', data:ups } })
    console.log(`   ✓ TARJETAS: ${t.tarjeta} 7/2026 actualizada`)
  } else {
    const nueva = new Array(Math.max(th.length,14)).fill('')
    const put=(n,v)=>{ if(TH(n)!==-1) nueva[TH(n)]=v }
    put('Tarjeta',t.tarjeta); put('Mes',MES); put('Año',ANIO); put('Monto',t.ars); put('Monto USD',t.usd)
    put('Vencimiento',VTO); put('Pagado','NO'); put('Notas',t.nota)
    await sheets.spreadsheets.values.append({ spreadsheetId:ID, range:'TARJETAS!A:N', valueInputOption:'USER_ENTERED', insertDataOption:'INSERT_ROWS', requestBody:{ values:[nueva] } })
    console.log(`   ✓ TARJETAS: ${t.tarjeta} 7/2026 creada`)
  }
}

await sheets.spreadsheets.values.append({ spreadsheetId:ID, range:'LOG!A:F', valueInputOption:'USER_ENTERED', requestBody:{ values:[[new Date().toISOString(),'juan@somosmagma.com','tarjetas-julio-2026','TARJETAS','BBVA Visa + Master Galicia',`7/2026 · ${filas.length} movimientos · ${filasC.length} cuotas`]] } })
console.log('\n\x1b[32m✓ Listo. Julio cargado en las dos tarjetas.\x1b[0m\n')
