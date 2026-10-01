/**
 * BBVA VISA BUSINESS — agosto 2026 (cierre 27/08, vto 07/09). Titular Somos Magma SRL, tarjetas de Juan y de Sofi.
 * Fuente: PDF "Statements.pdf" del resumen (cuenta 1390385315), que Juan pasó el 01/10/2026.
 *
 * Clasificación (Juan, 01/10/2026, al ver el preview): "BBVA es 100% de Magma, todo lo que esté ahí es de Magma. Salvo Venancio."
 *   · Todo Empresa: Hertz, las tres pólizas de La Segunda, Disney Plus, Farmacity, CH García y lo de Sofi incluidos.
 *   · MERPAGO*ASOCIACIONVENANCI es personal de Juan.
 *   · Siguen como personales las cuotas que el mismo Juan listó el 03/08 (son las mismas compras, cuota siguiente):
 *     Chipote, MercadoLibre, Equus, El Mundo del Juguete (Juan); Florian, Luboloque, 47 Street, Mishka (Sofi).
 *   · Comisión + IVA + percepciones → Magma, Costos bancarios. RG 5617 30% → Magma, Percepciones a recuperar.
 *
 * Además de MOVIMIENTOS_TARJETA y CUOTAS deja al día TARJETAS:
 *   · BBVA julio = pagado completo el 07/08 (lo dice este resumen: "su pago en pesos -3.789.144,90").
 *   · BBVA agosto = fila nueva. Débito automático del total de la CC BBVA el 07/09: se confirma con el resumen de septiembre.
 *   · Master Galicia y Santander Amex: nota de que ya no se usan (Juan, 01/10/2026). Amex agosto: sin consumos, $197.822,21 a favor.
 *
 * Sin --escribir solo muestra el preview y cómo quedaría la cuenta de socios.
 */
import { google } from 'googleapis'
import { readFileSync, writeFileSync } from 'fs'
import { RANGOS_SOCIOS, calcularCuentaSocios, fraseSaldo } from '../lib/socios.mjs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID=env.SHEET_ID||'1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR=process.argv.includes('--escribir')
const M=n=>'$'+n.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})
const r2=n=>Math.round(n*100)/100
const TARJETA='BBVA Visa', MES=8, ANIO=2026, VTO='07/09/2026', MES_CUOTA=9
const TOTAL=4928067.42, TOTAL_USD=879.81, CUOTAS_SEP=483724.41
const E='Empresa', P='Personal', PP='Personal'
const COM='Producción · Comida de rodaje/equipo', MOV='Producción · Movilidad', NAF='Producción · Nafta', FRE='Producción · Freelancers/proveedores'
const SUP='Compras · Súper/almacén', INS='Compras · Insumos/equipos', ML='Compras · Mercado Libre'
const EDI='Software · Edición/diseño', WEB='Software · Web/productividad', IA='Software · IA', ADS='Publicidad · Meta Ads'
const SEG='Seguros', OFS='Oficina · Servicios', NET='Oficina · Internet (tarjeta)', OTR='Otros', SUS='Software · Suscripciones'
const BCO='Costos bancarios', PER='Percepciones a recuperar'

// [fecha, comercio, monto, moneda, titular, categoria, rubro, cuota, aviso]
const MOVS=[
  // ── tarjeta de Juan ──
  ['16/04/2026','MERPAGO*ROUGE (cuota 05/09)',            45000.00,'ARS','Juan',E,INS,'5/9'],
  ['18/04/2026','MERPAGO*CHIPOTE (cuota 05/06)',           2666.66,'ARS','Juan',P,PP,'5/6'],
  ['30/04/2026','MERPAGO*MERCADOLIBRE (cuota 04/06)',     28498.50,'ARS','Juan',P,PP,'4/6'],
  ['22/05/2026','EQUUS (cuota 04/06)',                    64616.62,'ARS','Juan',P,PP,'4/6'],
  ['09/07/2026','EL MUNDO DEL JUGUETE (cuota 02/03)',     27503.33,'ARS','Juan',P,PP,'2/3'],
  ['30/07/2026','DISNEY PLUS',                            23999.00,'ARS','Juan',E,SUS,''],
  ['30/07/2026','MERPAGO*LEBLE',                          20500.00,'ARS','Juan',E,COM,''],
  ['31/07/2026','PVS*SUPER CRAMER N 3626-L',              81400.00,'ARS','Juan',E,SUP,''],
  ['31/07/2026','PEDIDOSYA*RAPANUI MONRO',                43790.00,'ARS','Juan',E,COM,''],
  ['31/07/2026','TOTAL POLLO',                            66209.00,'ARS','Juan',E,COM,''],
  ['01/08/2026','DLO*PedidosYa Propina',                   1200.00,'ARS','Juan',E,COM,''],
  ['01/08/2026','CAPCUT',                                    13.99,'USD','Juan',E,EDI,''],
  ['02/08/2026','APPYPF 31058 COMBUST',                   70031.89,'ARS','Juan',E,NAF,''],
  ['02/08/2026','FACEBK *PQETAZRZJ2',                        31.31,'USD','Juan',E,ADS,''],
  ['03/08/2026','MERPAGO*ROXANAVANESAFE',                 64194.00,'ARS','Juan',E,FRE,''],
  ['04/08/2026','GOOGLE *Google One',                         9.99,'USD','Juan',E,WEB,''],
  ['05/08/2026','MERPAGO*MARIANALUCIABONAN',              85592.00,'ARS','Juan',E,FRE,''],
  ['05/08/2026','MERPAGO*ASOCIACIONVENANCI',              74893.00,'ARS','Juan',P,PP,''],
  ['05/08/2026','MERPAGO*MENDOZAPARKINGSA',               22500.00,'ARS','Juan',E,MOV,''],
  ['07/08/2026','MERPAGO*SUPERDIA',                       19922.10,'ARS','Juan',E,SUP,''],
  ['07/08/2026','HERTZ ARGENTINA',                       294230.78,'ARS','Juan',E,MOV,''],
  ['07/08/2026','PROPINA*RAPPI',                           2000.00,'ARS','Juan',E,COM,''],
  ['07/08/2026','RAPPI',                                  27552.00,'ARS','Juan',E,COM,''],
  ['07/08/2026','FACEBK *SH62TZRZJ2',                        31.13,'USD','Juan',E,ADS,''],
  ['09/08/2026','APPYPF 31058 COMBUST',                  107019.96,'ARS','Juan',E,NAF,''],
  ['09/08/2026','ANTHROPIC* CLAUDE',                        200.00,'USD','Juan',E,IA,''],
  ['10/08/2026','MERPAGO*HERTZARG',                        7294.98,'ARS','Juan',E,MOV,''],
  ['10/08/2026','SERVICENTRO DEL SOL',                     2900.00,'ARS','Juan',E,NAF,''],
  ['10/08/2026','SERVICENTRO DEL SOL',                    37500.00,'ARS','Juan',E,NAF,''],
  ['10/08/2026','APPYPF 01571 COMBUST',                   90032.00,'ARS','Juan',E,NAF,''],
  ['11/08/2026','MERPAGO*MELINAIRIELMARTIN',              10699.00,'ARS','Juan',E,FRE,''],
  ['11/08/2026','CLF TACOS BAR',                          50800.00,'ARS','Juan',E,COM,''],
  ['11/08/2026','EL ALMACEN',                             39500.00,'ARS','Juan',E,COM,''],
  ['11/08/2026','FACEBK *44VCL22ZJ4',                        31.11,'USD','Juan',E,ADS,''],
  ['12/08/2026','MERPAGO*APPYPFCOMB',                     73006.00,'ARS','Juan',E,NAF,''],
  ['12/08/2026','CABIFY AR',                              18978.86,'ARS','Juan',E,MOV,''],
  ['12/08/2026','APPYPF 01702 TIENDA',                    36900.00,'ARS','Juan',E,NAF,''],
  ['12/08/2026','APPYPF 01173 TIENDA',                    12300.00,'ARS','Juan',E,NAF,''],
  ['12/08/2026','FACEBK *6A53N2EZJ4',                         6.03,'USD','Juan',E,ADS,''],
  ['13/08/2026','MERPAGO*HERTZARG',                       86595.09,'ARS','Juan',E,MOV,''],
  ['13/08/2026','MERPAGO*LAROBLE',                         9400.00,'ARS','Juan',E,COM,''],
  ['13/08/2026','MERPAGO*MARIANALUCIABONAN',              85592.00,'ARS','Juan',E,FRE,''],
  ['13/08/2026','CH GARCIA',                             122000.00,'ARS','Juan',E,OTR,''],
  ['14/08/2026','MC DONALDS CAN Y STA F',                 61900.00,'ARS','Juan',E,COM,''],
  ['14/08/2026','HIGGSFIELD INC.',                          117.99,'USD','Juan',E,IA,''],
  ['17/08/2026','MERPAGO*APPYPFCOMB',                     80016.09,'ARS','Juan',E,NAF,''],
  ['17/08/2026','FACEBK *Z4SKD32ZJ4',                        31.35,'USD','Juan',E,ADS,''],
  ['18/08/2026','ANTHROPIC* CLAUDE',                         20.00,'USD','Juan',E,IA,''],
  ['18/08/2026','APPLE.COM/BILL',                             1.99,'USD','Juan',E,WEB,''],
  ['18/08/2026','APPLE.COM/BILL',                             0.99,'USD','Juan',E,WEB,''],
  ['19/08/2026','DIA TIENDA 317',                         10148.95,'ARS','Juan',E,SUP,''],
  ['19/08/2026','DON AGUSTIN',                            35940.00,'ARS','Juan',E,COM,''],
  ['20/08/2026','MERPAGO*CARREFOUR',                      70058.04,'ARS','Juan',E,SUP,''],
  ['20/08/2026','ADOBE',                                  10392.69,'ARS','Juan',E,EDI,''],
  ['21/08/2026','LA SEGUNDA CIA0540468 (cuota 01/06 de la póliza)', 314031.77,'ARS','Juan',E,SEG,''],
  ['22/08/2026','ADOBE',                                  59035.90,'ARS','Juan',E,EDI,''],
  ['22/08/2026','FARMACITY 69',                           21187.00,'ARS','Juan',E,SUP,''],
  ['22/08/2026','FACEBK *44HGV3AZJ4',                        31.12,'USD','Juan',E,ADS,''],
  ['23/08/2026','LA PEDRERAA',                            84000.00,'ARS','Juan',E,COM,''],
  ['23/08/2026','MOSHU-MOSHU',                            88110.00,'ARS','Juan',E,COM,''],
  ['24/08/2026','MERPAGO*MERCADOLIBRE',                   15511.60,'ARS','Juan',E,ML,''],
  ['24/08/2026','MERPAGO*POWERFOTO',                     238763.35,'ARS','Juan',E,INS,''],
  ['24/08/2026','LA SEGUNDA COO0210395 (cuota 01/05 de la póliza)', 262164.71,'ARS','Juan',E,SEG,''],
  ['24/08/2026','LA SEGUNDA COO0316390 (cuota 01/06 de la póliza)',  13130.85,'ARS','Juan',E,SEG,''],
  ['25/08/2026','MASIVOS-SUP.H.MARKET',                   34000.00,'ARS','Juan',E,SUP,''],
  ['26/08/2026','MERPAGO*CLAUDIAINESSALUZZ',              25677.60,'ARS','Juan',E,FRE,''],
  ['26/08/2026','MERPAGO*MEGAFOTO (cuota 01/06)',         63901.54,'ARS','Juan',E,INS,'1/6'],
  ['26/08/2026','CABIFY AR',                               8621.13,'ARS','Juan',E,MOV,''],
  ['26/08/2026','CABIFY AR',                              13972.34,'ARS','Juan',E,MOV,''],
  ['26/08/2026','CABIFY AR',                              12220.33,'ARS','Juan',E,MOV,''],
  ['26/08/2026','LA ROBLE PANADERIA',                     13000.00,'ARS','Juan',E,COM,''],
  ['26/08/2026','FACEBK *77X594JZJ4',                        30.84,'USD','Juan',E,ADS,''],
  // ── tarjeta de Sofi ──
  ['16/04/2026','MERPAGO*GANGAHOME (cuota 05/09)',        20150.88,'ARS','Sofi',E,ML,'5/9'],
  ['20/04/2026','MERPAGO*FLORIAN (cuota 05/12)',          46325.00,'ARS','Sofi',P,PP,'5/12'],
  ['26/04/2026','MERPAGO*LUBOLOQUE (cuota 05/06)',         8333.33,'ARS','Sofi',P,PP,'5/6'],
  ['08/05/2026','47 STREET DOT (cuota 04/06)',            23091.38,'ARS','Sofi',P,PP,'4/6'],
  ['31/05/2026','MERPAGO*MISHKA (cuota 03/06)',           67465.56,'ARS','Sofi',P,PP,'3/6'],
  ['11/06/2026','MERPAGO*SVCCOMAR (cuota 03/06)',         24405.32,'ARS','Sofi',E,INS,'3/6'],
  ['11/06/2026','MERPAGO*GAMESTATION (cuota 03/06)',      51416.50,'ARS','Sofi',E,INS,'3/6'],
  ['30/07/2026','ADOBE',                                  59035.90,'ARS','Sofi',E,EDI,''],
  ['31/07/2026','MERPAGO*LAROBLE',                        19400.00,'ARS','Sofi',E,COM,''],
  ['31/07/2026','DIA TIENDA 317',                         36325.85,'ARS','Sofi',E,SUP,''],
  ['31/07/2026','DIA TIENDA 317',                         27665.45,'ARS','Sofi',E,SUP,''],
  ['31/07/2026','PROPINA*RAPPI',                           2900.00,'ARS','Sofi',E,COM,''],
  ['31/07/2026','RAPPI',                                  30878.00,'ARS','Sofi',E,COM,''],
  ['01/08/2026','GOOGLE WORKSPACE',                         248.48,'USD','Sofi',E,WEB,''],
  ['03/08/2026','MERPAGO*PANADERIALAEXPOSI',              32000.00,'ARS','Sofi',E,COM,''],
  ['03/08/2026','CABIFY AR',                              10548.43,'ARS','Sofi',E,MOV,''],
  ['03/08/2026','CABIFY AR',                               8844.86,'ARS','Sofi',E,MOV,''],
  ['03/08/2026','CABIFY AR',                              28283.39,'ARS','Sofi',E,MOV,''],
  ['04/08/2026','ADOBE',                                  34727.00,'ARS','Sofi',E,EDI,''],
  ['06/08/2026','RAPPI',                                  23234.00,'ARS','Sofi',E,COM,''],
  ['06/08/2026','PROPINA*RAPPI',                           2540.00,'ARS','Sofi',E,COM,''],
  ['06/08/2026','RAPPI',                                  42815.00,'ARS','Sofi',E,COM,''],
  ['07/08/2026','MERPAGO*MECUBROCOM',                      6216.88,'ARS','Sofi',E,SEG,''],
  ['07/08/2026','EDENOR SA (oficina)',                    12470.17,'ARS','Sofi',E,OFS,''],
  ['08/08/2026','CABIFY AR',                              17750.22,'ARS','Sofi',E,MOV,''],
  ['09/08/2026','YPF AVSOL DEBEVEDETIO',                  72996.06,'ARS','Sofi',E,NAF,''],
  ['11/08/2026','MERPAGO*AZULADORURAL',                   36200.00,'ARS','Sofi',E,OTR,''],
  ['11/08/2026','CABIFY AR',                              11122.86,'ARS','Sofi',E,MOV,''],
  ['11/08/2026','CABIFY AR',                              10835.48,'ARS','Sofi',E,MOV,''],
  ['12/08/2026','MERPAGO*LALINDAFRAGAN',                  39541.00,'ARS','Sofi',E,OTR,''],
  ['12/08/2026','DLO*DiDi',                                9300.00,'ARS','Sofi',E,MOV,''],
  ['12/08/2026','PROPINA*RAPPI',                           2040.00,'ARS','Sofi',E,COM,''],
  ['12/08/2026','PROPINA*RAPPI',                           2480.00,'ARS','Sofi',E,COM,''],
  ['12/08/2026','RAPPI',                                  17590.00,'ARS','Sofi',E,COM,''],
  ['12/08/2026','RAPPI',                                  21275.00,'ARS','Sofi',E,COM,''],
  ['12/08/2026','APPLE.COM/BILL',                             2.99,'USD','Sofi',E,WEB,''],
  ['13/08/2026','ANTHROPIC* CLAUDE',                         45.00,'USD','Sofi',E,IA,''],
  ['14/08/2026','MERPAGO*SKIPIT',                         41000.00,'ARS','Sofi',E,OTR,''],
  ['17/08/2026','PROPINA*RAPPI',                           2600.00,'ARS','Sofi',E,COM,''],
  ['17/08/2026','RAPPI',                                  44372.00,'ARS','Sofi',E,COM,''],
  ['20/08/2026','MERPAGO*TECNOFAST',                       1539.64,'ARS','Sofi',E,INS,''],
  ['20/08/2026','MERPAGO*TECNOFAST (cuota 01/06)',        10349.85,'ARS','Sofi',E,INS,'1/6'],
  ['20/08/2026','DIA TIENDA 317',                          8517.93,'ARS','Sofi',E,SUP,''],
  ['20/08/2026','TOTAL POLLO',                            55532.00,'ARS','Sofi',E,COM,''],
  ['21/08/2026','PROPINA*RAPPI',                           1140.00,'ARS','Sofi',E,COM,''],
  ['21/08/2026','RAPPI',                                   9842.00,'ARS','Sofi',E,COM,''],
  ['23/08/2026','DIA TIENDA 317',                          9788.00,'ARS','Sofi',E,SUP,''],
  ['24/08/2026','OPENAI *CHATGPT (EUR 19,01)',               22.48,'USD','Sofi',E,IA,''],
  ['25/08/2026','PERSONAL FLOW (internet oficina)',       40626.32,'ARS','Sofi',E,NET,''],
  ['25/08/2026','GOOGLE *YouTube Premium',                    3.02,'USD','Sofi',E,WEB,''],
  ['26/08/2026','CABIFY AR',                              35091.55,'ARS','Sofi',E,MOV,''],
  // ── cargos del banco (27/08) ──
  ['27/08/2026','Costos bancarios (comisión $7.128,10 + IVA $1.496,90 + percep. IVA $213,84 + IIBB CABA $6.415,41)', 15254.25,'ARS','Magma',E,BCO,''],
  ['27/08/2026','DB.RG 5617 30% — pago a cuenta, NO es gasto',                                                      399609.70,'ARS','Magma',E,PER,''],
]

// ── control contra los totales impresos ──
const suma=(f,mon)=>MOVS.filter(m=>f(m)&&m[3]===mon).reduce((a,m)=>a+m[2],0)
const cuotasQueSiguen=r2(MOVS.filter(m=>m[7]&&(([a,t])=>a<t)(m[7].split('/').map(Number))).reduce((a,m)=>a+m[2],0))
const controles=[
  ['Consumos de Juan ARS',  r2(suma(m=>m[4]==='Juan','ARS')), 3392600.66, 0.02],
  ['Consumos de Juan USD',  r2(suma(m=>m[4]==='Juan','USD')),     557.84, 0.02],
  ['Consumos de Sofi ARS',  r2(suma(m=>m[4]==='Sofi','ARS')), 1120602.81, 0.02],
  ['Consumos de Sofi USD',  r2(suma(m=>m[4]==='Sofi','USD')),     321.97, 0.02],
  ['Cargos del banco',      r2(suma(m=>m[4]==='Magma','ARS')), 414863.95, 0.02],
  ['Saldo actual ARS (el anterior se pagó entero)', r2(suma(m=>true,'ARS')), TOTAL, 0.02],
  ['Saldo actual USD',      r2(suma(m=>true,'USD')), TOTAL_USD, 0.02],
  ['Cuotas a vencer en septiembre (redondeo de centavos)', cuotasQueSiguen, CUOTAS_SEP, 0.10],
]
let ok=true
console.log('\n\x1b[1m■ CONTROL contra los totales impresos del resumen\x1b[0m')
controles.forEach(([n,c,e,tol])=>{const b=Math.abs(c-e)<tol; if(!b)ok=false
  console.log(`   ${b?'\x1b[32m✓\x1b[0m':'\x1b[31m✗\x1b[0m'} ${n.padEnd(56)} calculado ${String(c).padStart(13)}  ·  resumen ${String(e).padStart(13)}`)})
if(!ok){ console.log('\n\x1b[31mNo cierra. No escribo nada.\x1b[0m\n'); process.exit(1) }

// ── preview ──
const porRubro=tit=>{const o={}; MOVS.filter(m=>m[4]===tit&&m[5]===E&&m[3]==='ARS').forEach(m=>o[m[6]]=(o[m[6]]||0)+m[2]); return Object.entries(o).sort((a,b)=>b[1]-a[1])}
console.log(`\n\x1b[1m════════ BBVA VISA — agosto 2026 (cierre 27/08, vto 07/09) ════════\x1b[0m`)
for(const [tit,lbl] of [['Juan','TARJETA DE JUAN'],['Sofi','TARJETA DE SOFI'],['Magma','CARGOS DEL BANCO']]){
  const ms=MOVS.filter(m=>m[4]===tit); const per=ms.filter(m=>m[5]===P)
  console.log(`\n\x1b[1m▸ ${lbl} (${ms.length} movimientos)\x1b[0m`)
  console.log(`  \x1b[36m— EMPRESA por rubro\x1b[0m`)
  porRubro(tit).forEach(([r,v])=>console.log(`   ${r.padEnd(40)} ${M(r2(v)).padStart(15)}`))
  if(per.length){ console.log(`  \x1b[33m— PERSONAL (${per.length})\x1b[0m`)
    per.forEach(m=>console.log(`   ${m[0].slice(0,5).padEnd(7)} ${m[1].slice(0,44).padEnd(46)} ${M(m[2]).padStart(13)}`)) }
  console.log(`  \x1b[1m  Empresa ${M(r2(suma(m=>m[4]===tit&&m[5]===E,'ARS'))).padStart(14)} + USD ${r2(suma(m=>m[4]===tit&&m[5]===E,'USD'))}  ·  Personal ${M(r2(suma(m=>m[4]===tit&&m[5]===P,'ARS'))).padStart(12)}\x1b[0m`)
}
const dudosos=MOVS.filter(m=>m[8])
if(dudosos.length) console.log(`\n\x1b[1m▸ PARA QUE MIRES (van con la regla de julio, se cambian en la app si no)\x1b[0m`)
dudosos.forEach(m=>console.log(`   ${m[0].slice(0,5)}  ${m[1].slice(0,30).padEnd(32)} ${M(m[2]).padStart(13)}  → ${m[5]} (${m[4]})   ${m[8]}`))
const empARS=r2(suma(m=>m[5]===E,'ARS')), perJuan=r2(suma(m=>m[4]==='Juan'&&m[5]===P,'ARS')), perSofi=r2(suma(m=>m[4]==='Sofi'&&m[5]===P,'ARS'))
console.log(`\n\x1b[1m════════ RESUMEN ════════\x1b[0m`)
console.log(`   EMPRESA          ${M(empARS).padStart(15)}  + USD ${r2(suma(m=>m[5]===E,'USD'))}`)
console.log(`   PERSONAL de Juan ${M(perJuan).padStart(15)}`)
console.log(`   PERSONAL de Sofi ${M(perSofi).padStart(15)}`)
console.log(`\n   Total del resumen: ${M(TOTAL)} + USD ${TOTAL_USD} · vencía 07/09 · débito automático del total de la CC BBVA (se confirma con el resumen de septiembre)`)

// ── cómo quedaría la cuenta de socios con esto cargado (misma función que la app, sin escribir) ──
const nota=m=>m[8]?`revisar: ${m[8]}`:(m[5]===E?`gastó ${m[4]} · BBVA es 100% de Magma (Juan 01/10/2026)`:(/VENANCI/.test(m[1])?'personal de Juan: única excepción que marcó el 01/10/2026':'cuota de una compra personal (lista de Juan 03/08)'))
const filas=MOVS.map(m=>[TARJETA,MES,ANIO,m[0],m[4],m[1],m[3],m[2],m[5],m[6],'juan@somosmagma.com',nota(m)])
const RS=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:RANGOS_SOCIOS,valueRenderOption:'FORMATTED_VALUE'})
const [SM,MT,PRE,PRO]=RS.data.valueRanges.map(v=>v.values||[])
const MTsin=[MT[0],...MT.slice(1).filter(r=>!(String(r[0]).trim().toLowerCase()===TARJETA.toLowerCase()&&String(r[1]).trim()===String(MES)&&String(r[2]).includes(String(ANIO))))]
const antes=calcularCuentaSocios([SM,MTsin,PRE,PRO]), despues=calcularCuentaSocios([SM,[...MTsin,...filas],PRE,PRO])
console.log(`\n\x1b[1m════════ CUENTA DE SOCIOS · antes → después de cargar BBVA agosto (tarjetas en uso cargadas hasta ${despues.tarjetasCargadas.hasta}) ════════\x1b[0m`)
antes.socios.forEach((s,i)=>console.log(`   ${s.nombre.padEnd(6)} ${M(s.saldo).padStart(15)}  →  ${M(despues.socios[i].saldo).padStart(15)}   ${fraseSaldo(despues.socios[i])}`))
despues.tarjetasCargadas.lista.forEach(x=>console.log(`   \x1b[2m${x.tarjeta.padEnd(16)} hasta ${x.texto}${x.deBaja?'  (ya no se usa, no cuenta)':''}\x1b[0m`))

if(!ESCRIBIR){ console.log('\n\x1b[33mPREVIEW — no escribí nada.\x1b[0m\n'); process.exit(0) }

// ── escritura ──
const norm=v=>String(v||'').trim().toLowerCase()
const colLetra=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)}return s}
const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties(title,sheetId))'})
const sid=t=>meta.data.sheets.find(x=>x.properties.title===t)?.properties.sheetId
const hoyISO=new Date().toISOString(), QUIEN='juan@somosmagma.com'
const log=[]
// copia de lo que se va a tocar, por si hay que volver atrás (scripts/.rollback-tarjeta-bbva-agosto-2026.json)
{ const RB=['MOVIMIENTOS_TARJETA','CUOTAS','TARJETAS']
  const rb=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:RB,valueRenderOption:'FORMULA'})
  writeFileSync(new URL('./.rollback-tarjeta-bbva-agosto-2026.json',import.meta.url),JSON.stringify({cuando:hoyISO,solapas:Object.fromEntries(rb.data.valueRanges.map((v,i)=>[RB[i],v.values||[]]))}))
  console.log(`\n   ✓ copia previa guardada en scripts/.rollback-tarjeta-bbva-agosto-2026.json`) }

// 1) MOVIMIENTOS_TARJETA: reemplaza lo que haya de BBVA Visa mes 8
const cur=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'MOVIMIENTOS_TARJETA!A:C'})).data.values||[]
const del=cur.map((r,i)=>({r,i})).filter(({r},i)=>i>0&&norm(r[0])===norm(TARJETA)&&String(r[1]).trim()===String(MES)&&String(r[2]).includes(String(ANIO))).map(x=>x.i)
if(del.length) await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:del.sort((a,b)=>b-a).map(i=>({deleteDimension:{range:{sheetId:sid('MOVIMIENTOS_TARJETA'),dimension:'ROWS',startIndex:i,endIndex:i+1}}}))}})
await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'MOVIMIENTOS_TARJETA!A:L',valueInputOption:'USER_ENTERED',insertDataOption:'INSERT_ROWS',requestBody:{values:filas}})
console.log(`\n   ✓ MOVIMIENTOS_TARJETA: ${filas.length} filas (${del.length} previas reemplazadas)`)
log.push(['MOVIMIENTOS_TARJETA',TARJETA,`${MES}/${ANIO} · ${filas.length} movimientos`])

// 2) CUOTAS: reemplaza las de esta tarjeta por las vigentes según este resumen
const filasC=MOVS.filter(m=>m[7]).map(m=>{const [a,t]=m[7].split('/').map(Number)
  return [m[1].replace(/\s*\(cuota[^)]*\)/,''), m[5]===E?'Magma':m[4], TARJETA, m[5], m[2], a, t, MES_CUOTA, ANIO, a<t?'Activa':'Terminada','']})
const curC=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'CUOTAS!A:K'})).data.values||[]
const delC=curC.map((r,i)=>({r,i})).filter(({r},i)=>i>0&&norm(r[2])===norm(TARJETA)).map(x=>x.i)
if(delC.length) await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:delC.sort((a,b)=>b-a).map(i=>({deleteDimension:{range:{sheetId:sid('CUOTAS'),dimension:'ROWS',startIndex:i,endIndex:i+1}}}))}})
await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'CUOTAS!A:K',valueInputOption:'USER_ENTERED',insertDataOption:'INSERT_ROWS',requestBody:{values:filasC}})
console.log(`   ✓ CUOTAS: ${filasC.length} de ${TARJETA} (${delC.length} previas reemplazadas)`)
log.push(['CUOTAS',TARJETA,`${filasC.length} cuotas vigentes al resumen de agosto`])

// 3) TARJETAS: julio pagado entero · agosto nuevo · Galicia y Amex fuera de uso
const tr=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'TARJETAS!A:N'})).data.values||[]
const th=tr[0], TH=n=>th.indexOf(n)
const filaDe=(tarj,mes)=>tr.findIndex((row,i)=>i>0&&norm(row[TH('Tarjeta')])===norm(tarj)&&String(row[TH('Mes')]).trim()===String(mes)&&String(row[TH('Año')]).includes(String(ANIO)))
const ups=[]; const set=(fila,n,v)=>{if(TH(n)!==-1)ups.push({range:`TARJETAS!${colLetra(TH(n))}${fila+1}`,values:[[v]]})}
const sumarNota=(fila,texto,marca)=>{const n=String(tr[fila][TH('Notas')]||'').trim(); if(!n.includes(marca)) set(fila,'Notas',(n?n+' · ':'')+texto)}
const f7=filaDe(TARJETA,7)
if(f7>0){ set(f7,'Pagado','SI'); set(f7,'Fecha pago','07/08/2026'); set(f7,'Cuenta pago','BBVA Somos Magma'); set(f7,'Monto pagado',3789144.90); set(f7,'Monto pagado USD',450.78)
  sumarNota(f7,'Pagado entero el 07/08 ($3.789.144,90 + USD 450,78), según el resumen de agosto.','Pagado entero el 07/08') }
const fG=filaDe('Master Galicia',7); if(fG>0) sumarNota(fG,'TARJETA FUERA DE USO: Juan avisó el 01/10/2026 que la Master Galicia ya no se usa. Este es el último resumen cargado.','FUERA DE USO')
const fA=filaDe('Santander Amex',7); if(fA>0) sumarNota(fA,'TARJETA FUERA DE USO (Juan, 01/10/2026). Resumen de agosto (cierre 27/08): sin consumos, quedó un saldo A FAVOR de $197.822,21 por la devolución RG 5617 del 10/08.','FUERA DE USO')
if(ups.length) await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data:ups}})
const nota8=`Titular Magma (SRL). Cierre 27/08, vence 07/09. Del resumen: empresa ${M(empARS)} (incluye $399.609,70 de percepción RG 5617 a recuperar) · personal de Juan ${M(perJuan)} · personal de Sofi ${M(perSofi)}. Débito automático del total de la CC BBVA el 07/09: falta confirmarlo con el resumen de septiembre.`
const campos8=[['Monto',TOTAL],['Monto USD',TOTAL_USD],['Vencimiento',VTO],['Pagado','NO'],['Notas',nota8]]
const f8=filaDe(TARJETA,8)
if(f8>0){ const u=campos8.filter(([n])=>TH(n)!==-1).map(([n,v])=>({range:`TARJETAS!${colLetra(TH(n))}${f8+1}`,values:[[v]]}))
  await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data:u}}); console.log(`   ✓ TARJETAS: ${TARJETA} 8/2026 actualizada`)
}else{
  const nueva=new Array(Math.max(th.length,14)).fill(''); const put=(n,v)=>{if(TH(n)!==-1)nueva[TH(n)]=v}
  put('Tarjeta',TARJETA); put('Persona','Magma (SRL)'); put('Mes',MES); put('Año',ANIO); campos8.forEach(([n,v])=>put(n,v))
  await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'TARJETAS!A:N',valueInputOption:'USER_ENTERED',insertDataOption:'INSERT_ROWS',requestBody:{values:[nueva]}}); console.log(`   ✓ TARJETAS: ${TARJETA} 8/2026 creada`)
}
console.log(`   ✓ TARJETAS: BBVA julio = pagado entero el 07/08 · Master Galicia y Amex = nota de fuera de uso`)
log.push(['TARJETAS',TARJETA,`8/2026 creada · 7/2026 pagado entero · Master Galicia y Amex fuera de uso`])

await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',requestBody:{values:log.map(l=>[hoyISO,QUIEN,'tarjeta-bbva-agosto',...l])}})

// ── verificación: releo del sheet y comparo contra el resumen ──
const v=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'MOVIMIENTOS_TARJETA!A:L',valueRenderOption:'UNFORMATTED_VALUE'})).data.values||[]
const mias=v.filter((r,i)=>i>0&&norm(r[0])===norm(TARJETA)&&Number(r[1])===MES&&Number(r[2])===ANIO)
const sA=r2(mias.filter(r=>r[6]==='ARS').reduce((a,r)=>a+Number(r[7]||0),0)), sU=r2(mias.filter(r=>r[6]==='USD').reduce((a,r)=>a+Number(r[7]||0),0))
const bien=mias.length===filas.length&&Math.abs(sA-TOTAL)<0.02&&Math.abs(sU-TOTAL_USD)<0.02
console.log(`\n   ${bien?'\x1b[32m✓':'\x1b[31m✗'} Releído del sheet: ${mias.length} filas · ARS ${sA} (resumen ${TOTAL}) · USD ${sU} (resumen ${TOTAL_USD})\x1b[0m`)
if(!bien){ console.log('\x1b[31m   Lo que quedó en el sheet NO coincide con el resumen. Revisar.\x1b[0m\n'); process.exit(1) }
console.log('\n\x1b[32m✓ BBVA Visa de agosto cargada.\x1b[0m\n')
