/**
 * SANTANDER VISA — agosto 2026 (cierre 27/08, vto 04/09). Titular Sofía, adicional Juan.
 * Fuente: PDF del resumen N° 000449206 + CSV "Último resumen - Visa 7665" + resumen de cuenta Santander de Sofi (31/07–27/08)
 * + movimientos de la cuenta 01/09–24/09 (Juan los pasó el 24/09/2026).
 *
 * Misma clasificación que dio Juan el 03/08/2026 para julio:
 *   · Tarjeta 7665 (Sofi): TODO es de Magma salvo AILES S.A (cuota 08/09), que es de Juan.
 *   · Tarjeta 2355 (Juan): TODO es de Juan salvo Amazon Prime, que es de Magma.
 *   · Intereses + IVA + percepciones → Magma, Costos bancarios. RG 5617 30% → Magma, Percepciones a recuperar.
 *
 * Además de MOVIMIENTOS_TARJETA y CUOTAS, deja al día lo que dice el banco:
 *   · TARJETAS: julio pagado solo el mínimo (07/08), agosto pagado $290.727,48 (débito 04/09), Amex jun+jul pagadas (06-07/08).
 *   · PRESTAMOS: 8128/6 cuota 11/18 pagada (05-06/08 en dos partes), 8035/1 cuota 12/12 pagada (13/08): préstamo cancelado.
 *   · NO toca SOCIOS_MOVIMIENTOS (ver pregunta en el preview).
 *
 * Sin --escribir solo muestra el preview y cómo quedaría la cuenta de socios.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { RANGOS_SOCIOS, calcularCuentaSocios, fraseSaldo } from '../lib/socios.mjs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID=env.SHEET_ID||'1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR=process.argv.includes('--escribir')
const M=n=>'$'+n.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})
const r2=n=>Math.round(n*100)/100
const TARJETA='Santander Visa', MES=8, ANIO=2026, VTO='04/09/2026', MES_CUOTA=9
const E='Empresa', P='Personal'
const MOV='Producción · Movilidad', WEB='Software · Web/productividad', OFI='Compras · Súper/almacén'
const BCO='Costos bancarios', PER='Percepciones a recuperar'
const TOTAL=8004342.63, TOTAL_USD=473.71, PAGADO_0409=290727.48

// [fecha, comercio, monto, moneda, titular, categoria, rubro, cuota, aviso]
const MOVS=[
  // ── tarjeta 7665 · Sofi: todo Magma salvo AILES, que es de Juan ──
  ['29/12','AILES S.A (cuota 08/09)',            304148.88,'ARS','Juan', P,'Personal','8/9'],
  ['01/08','CABIFY 2631ZYDH2T0K',                   377.25,'ARS','Sofi', E,MOV,''],
  ['14/08','GOOGLE ONE',                              9.99,'USD','Sofi', E,WEB,''],
  ['15/08','COTO SUCURSAL 108',                  190739.32,'ARS','Sofi', E,OFI,'','¿compra de oficina o personal de Sofi?'],
  ['15/08','SQSP* WEBSITE (Squarespace)',            14.00,'USD','Sofi', E,WEB,''],
  // ── tarjeta 2355 · Juan: todo suyo salvo Amazon Prime ──
  ['03/03','AILES S.A (cuota 06/09)',              26666.11,'ARS','Juan', P,'Personal','6/9'],
  ['07/06','711704*DF FESTIVAL (cuota 03/06)',    107500.00,'ARS','Juan', P,'Personal','3/6'],
  ['12/06','MERPAGO*CHIPOTE (cuota 03/09)',         6177.77,'ARS','Juan', P,'Personal','3/9'],
  ['30/07','MERPAGO*HUALIN',                        6205.42,'ARS','Juan', P,'Personal',''],
  ['31/07','MERPAGO*CARNAL',                       30000.00,'ARS','Juan', P,'Personal',''],
  ['02/08','MERPAGO*CHIPOTE',                      47200.00,'ARS','Juan', P,'Personal',''],
  ['03/08','PERSONAL (telefonía)',                116995.52,'ARS','Juan', P,'Personal','','¿línea personal o de Magma?'],
  ['03/08','PVS*SUPER CRAMER N 3626-L',            21200.00,'ARS','Juan', P,'Personal',''],
  ['04/08','MERPAGO*DANIELAVERONICACO',             3744.65,'ARS','Juan', P,'Personal',''],
  ['04/08','MERPAGO*LAROBLE',                      14000.00,'ARS','Juan', P,'Personal',''],
  ['04/08','PVS*SUPER CRAMER N 3626-L',            38900.00,'ARS','Juan', P,'Personal',''],
  ['04/08','APPLE.COM/BILL',                           2.99,'USD','Juan', P,'Personal',''],
  ['05/08','MERPAGO*LOLAARAUZ',                    32097.00,'ARS','Juan', P,'Personal',''],
  ['05/08','MERPAGO*PAGODEDEUDA',                  15383.82,'ARS','Juan', P,'Personal',''],
  ['05/08','MERPAGO*BRAIANEMANUELU',              267475.00,'ARS','Juan', P,'Personal','','¿pago a alguien de un rodaje?'],
  ['05/08','MERPAGO*MORAARAUZ',                    32097.00,'ARS','Juan', P,'Personal',''],
  ['06/08','MERPAGO*ELIZABETHNOEMICID',             5884.45,'ARS','Juan', P,'Personal',''],
  ['06/08','EST DE SERV CABILDO',                   6000.00,'ARS','Juan', P,'Personal',''],
  ['06/08','PROPINA*RAPPI',                         2900.00,'ARS','Juan', P,'Personal',''],
  ['06/08','PROPINA*RAPPI',                         2800.00,'ARS','Juan', P,'Personal',''],
  ['06/08','RAPPI',                                43185.50,'ARS','Juan', P,'Personal',''],
  ['06/08','RAPPI',                                47967.00,'ARS','Juan', P,'Personal',''],
  ['07/08','CP*FACTURAS CLARO',                    16397.92,'ARS','Juan', P,'Personal','','¿línea personal o de Magma?'],
  ['07/08','CP*FACTURAS CLARO',                    33785.38,'ARS','Juan', P,'Personal','','¿línea personal o de Magma?'],
  ['07/08','WDW PKG RESDIGITAL (Disney)',            200.00,'USD','Juan', P,'Personal',''],
  ['08/08','MERPAGO*JUANJOSEBELLAGAMB',            13908.70,'ARS','Juan', P,'Personal',''],
  ['08/08','MERPAGO*MORAARAUZ',                     2139.80,'ARS','Juan', P,'Personal',''],
  ['08/08','MERPAGO*CHIPOTE (cuota 01/06)',         5700.00,'ARS','Juan', P,'Personal','1/6'],
  ['08/08','CARREFOUR GUALEGUAYCHU',               87130.50,'ARS','Juan', P,'Personal','','los súper en tu tarjeta van como personal por tu regla de julio (en BBVA van como Magma)'],
  ['08/08','PVS*SUPER AV PRIMERA JUNT',            25539.99,'ARS','Juan', P,'Personal',''],
  ['09/08','MERPAGO*LAUTAROJESUSSO',               34771.75,'ARS','Juan', P,'Personal',''],
  ['09/08','SUPER MALAMBO RIVADAVI',               28721.35,'ARS','Juan', P,'Personal',''],
  ['09/08','UNIVERSAL STDS VAC REG 7 (Universal)',   200.00,'USD','Juan', P,'Personal',''],
  ['12/08','PROPINA*RAPPI',                         1380.00,'ARS','Juan', P,'Personal',''],
  ['12/08','RAPPI',                                17767.00,'ARS','Juan', P,'Personal',''],
  ['12/08','APPLE.COM/BILL',                           9.49,'USD','Juan', P,'Personal',''],
  ['13/08','MERPAGO*ELIZABETHNOEMICID',             2032.81,'ARS','Juan', P,'Personal',''],
  ['14/08','MERPAGO*PASSLINE',                     26000.00,'ARS','Juan', P,'Personal',''],
  ['14/08','MERPAGO*PASSLINE',                     12500.00,'ARS','Juan', P,'Personal',''],
  ['14/08','APPYPF 31058 COMBUST',                 92004.98,'ARS','Juan', P,'Personal',''],
  ['14/08','AMAZON PRIME*909',                        16.26,'USD','Juan', E,WEB,''],
  ['15/08','MERPAGO*LAVISIONF',                    30848.00,'ARS','Juan', P,'Personal',''],
  ['15/08','RAPPI',                                42182.50,'ARS','Juan', P,'Personal',''],
  ['15/08','RAPPI',                                15267.00,'ARS','Juan', P,'Personal',''],
  ['15/08','PROPINA*RAPPI',                         2540.00,'ARS','Juan', P,'Personal',''],
  ['15/08','RAPPI',                                31575.50,'ARS','Juan', P,'Personal',''],
  ['16/08','MERPAGO*GONZALODOMINGUEZ',              4814.55,'ARS','Juan', P,'Personal',''],
  ['16/08','MERPAGO*LEIVASERNESTO',                16048.50,'ARS','Juan', P,'Personal',''],
  ['16/08','MERPAGO*CASIANGELES',                  43242.00,'ARS','Juan', P,'Personal',''],
  ['16/08','574-CARREFOUR EXPRESS-GAR',             3415.00,'ARS','Juan', P,'Personal',''],
  ['16/08','PROPINA*DANDY SAAVEDRA 1',             15740.00,'ARS','Juan', P,'Personal',''],
  ['16/08','DANDY SAAVEDRA 1',                    157400.00,'ARS','Juan', P,'Personal','','¿comida de equipo o personal?'],
  ['16/08','RAPPI',                                44793.07,'ARS','Juan', P,'Personal',''],
  ['16/08','DLO*RAPPI PRO',                         6490.00,'ARS','Juan', P,'Personal',''],
  ['17/08','MC DONALDS NUÑEZ',                     18000.00,'ARS','Juan', P,'Personal',''],
  ['17/08','PROPINA*RAPPI',                         1000.00,'ARS','Juan', P,'Personal',''],
  ['17/08','RAPPI',                                13151.00,'ARS','Juan', P,'Personal',''],
  ['17/08','APPLE.COM/BILL',                          13.99,'USD','Juan', P,'Personal',''],
  ['18/08','DIA TIENDA 317',                        9625.60,'ARS','Juan', P,'Personal',''],
  ['18/08','MERPAGO*ASOCIACIONVENA',               74893.00,'ARS','Juan', P,'Personal',''],
  ['18/08','PROPINA*RAPPI',                         2220.00,'ARS','Juan', P,'Personal',''],
  ['18/08','RAPPI',                                54974.00,'ARS','Juan', P,'Personal',''],
  ['18/08','DLO*RAPPI',                            19342.00,'ARS','Juan', P,'Personal',''],
  ['20/08','MERPAGO*FRIDMANESTELABER',            251426.50,'ARS','Juan', P,'Personal','','20/08: 9 pagos a personas, $1.083.504 en un día ¿rodaje?'],
  ['20/08','MERPAGO*MORAARAUZ',                    16048.50,'ARS','Juan', P,'Personal',''],
  ['20/08','MERPAGO*SOLTEWILDEMARI',               55105.20,'ARS','Juan', P,'Personal','','ídem 20/08'],
  ['20/08','MERPAGO*SANCHEZMARIAVI',               92011.40,'ARS','Juan', P,'Personal','','ídem 20/08'],
  ['20/08','MERPAGO*MARIANASABRINC',               69543.50,'ARS','Juan', P,'Personal','','ídem 20/08'],
  ['20/08','MERPAGO*ANAHERNANDEZ',                145506.40,'ARS','Juan', P,'Personal','','ídem 20/08'],
  ['20/08','MERPAGO*RICARDOALFREDO',               85592.00,'ARS','Juan', P,'Personal','','ídem 20/08'],
  ['20/08','MERPAGO*DIEGOJORGEGIRA',              235378.00,'ARS','Juan', P,'Personal','','ídem 20/08'],
  ['20/08','MERPAGO*JULIANNUNEZ',                  74893.00,'ARS','Juan', P,'Personal','','ídem 20/08'],
  ['22/08','MERPAGO*JUANCERDA',                   160485.00,'ARS','Juan', P,'Personal',''],
  ['22/08','MERPAGO*CARTU724',                      5700.00,'ARS','Juan', P,'Personal',''],
  ['22/08','MERPAGO*ELTEATRO',                     17000.00,'ARS','Juan', P,'Personal',''],
  ['22/08','PROPINA*RAPPI',                         1440.00,'ARS','Juan', P,'Personal',''],
  ['22/08','RAPPI',                                42513.97,'ARS','Juan', P,'Personal',''],
  ['23/08','MERPAGO*NANOBIKE',                     35000.00,'ARS','Juan', P,'Personal',''],
  ['23/08','MERPAGO*LUISALBERTOSTO',               37446.50,'ARS','Juan', P,'Personal',''],
  ['24/08','DIA TIENDA 317',                        8279.00,'ARS','Juan', P,'Personal',''],
  ['25/08','MERPAGO*DELFINAMARIALA',               53495.00,'ARS','Juan', P,'Personal',''],
  ['25/08','MERPAGO*MARQUESEZEQUIE',               42796.00,'ARS','Juan', P,'Personal',''],
  ['26/08','MERPAGO*STELLAMARISROSSAT',             2995.72,'ARS','Juan', P,'Personal',''],
  ['26/08','APPLE.COM/BILL',                           6.99,'USD','Juan', P,'Personal',''],
  // ── cargos del banco (27/08) ──
  ['27/08','Costos bancarios (intereses por financiar julio $221.348 + IVA $46.483,08 + IIBB $1.081,88 + IVA RG4240 $11.359,99)', 280272.95,'ARS','Magma',E,BCO,''],
  ['27/08','DB.RG 5617 30% — pago a cuenta, NO es gasto',                                                                        215159.08,'ARS','Magma',E,PER,''],
]

// ── control contra los totales impresos ──
const suma=(f,mon)=>MOVS.filter(m=>f(m)&&m[3]===mon).reduce((a,m)=>a+m[2],0)
const enSofi=m=>m[4]==='Sofi'||m[1].includes('08/09')       // la cuota 08/09 de AILES figura en la tarjeta de Sofi
const enJuan=m=>m[4]==='Juan'&&!m[1].includes('08/09')
const controles=[
  ['Tarjeta 7665 (Sofía) ARS', r2(suma(enSofi,'ARS')),  495265.45],
  ['Tarjeta 7665 (Sofía) USD', r2(suma(enSofi,'USD')),      23.99],
  ['Tarjeta 2355 (Juan) ARS',  r2(suma(enJuan,'ARS')), 3314376.83],
  ['Tarjeta 2355 (Juan) USD',  r2(suma(enJuan,'USD')),     449.72],
  ['Cargos del banco',         r2(suma(m=>m[4]==='Magma','ARS')), 495432.03],
  ['Total del resumen (consumos + cargos + $3.699.268,32 financiado de julio)', r2(suma(m=>true,'ARS')+3699268.32), TOTAL],
]
let ok=true
console.log('\n\x1b[1m■ CONTROL contra los totales impresos del resumen\x1b[0m')
controles.forEach(([n,c,e])=>{const b=Math.abs(c-e)<0.02; if(!b)ok=false
  console.log(`   ${b?'\x1b[32m✓\x1b[0m':'\x1b[31m✗\x1b[0m'} ${n.padEnd(72)} calculado ${String(c).padStart(13)}  ·  resumen ${String(e).padStart(13)}`)})
if(!ok){ console.log('\n\x1b[31mNo cierra. No escribo nada.\x1b[0m\n'); process.exit(1) }

// ── preview ──
console.log(`\n\x1b[1m════════ SANTANDER VISA — agosto 2026 (cierre 27/08, vto 04/09) ════════\x1b[0m`)
for(const [tit,lbl] of [['Sofi','SOFI'],['Juan','JUAN'],['Magma','CARGOS DEL BANCO']]){
  const ms=MOVS.filter(m=>m[4]===tit); if(!ms.length)continue
  const emp=ms.filter(m=>m[5]===E), per=ms.filter(m=>m[5]===P)
  console.log(`\n\x1b[1m▸ ${lbl}\x1b[0m`)
  if(emp.length){ console.log(`  \x1b[36m— EMPRESA (${emp.length})\x1b[0m`)
    emp.forEach(m=>console.log(`   ${m[0].padEnd(7)} ${m[1].slice(0,60).padEnd(62)} ${(m[3]==='USD'?'USD '+m[2]:M(m[2])).padStart(15)}  ${m[6]}`)) }
  if(per.length){ console.log(`  \x1b[33m— PERSONAL (${per.length})\x1b[0m`)
    per.slice(0,5).forEach(m=>console.log(`   ${m[0].padEnd(7)} ${m[1].slice(0,60).padEnd(62)} ${(m[3]==='USD'?'USD '+m[2]:M(m[2])).padStart(15)}`))
    if(per.length>5) console.log(`   … y ${per.length-5} más`) }
  console.log(`  \x1b[1m  Empresa ${M(r2(suma(m=>m[4]===tit&&m[5]===E,'ARS'))).padStart(14)}  ·  Personal ${M(r2(suma(m=>m[4]===tit&&m[5]===P,'ARS'))).padStart(14)}\x1b[0m`)
}
const dudosos=MOVS.filter(m=>m[8])
console.log(`\n\x1b[1m▸ PARA QUE MIRES (van con la regla de julio, se cambian en la app si no)\x1b[0m`)
dudosos.forEach(m=>console.log(`   ${m[0]}  ${m[1].slice(0,32).padEnd(34)} ${M(m[2]).padStart(13)}  → ${m[5]} de ${m[4]}   ${m[8]}`))
const perJuan=r2(suma(m=>m[4]==='Juan'&&m[5]===P,'ARS'))
console.log(`\n\x1b[1m════════ RESUMEN ════════\x1b[0m`)
console.log(`   EMPRESA   ${M(r2(suma(m=>m[5]===E,'ARS'))).padStart(15)}  + USD ${r2(suma(m=>m[5]===E,'USD'))}`)
console.log(`   PERSONAL  ${M(r2(suma(m=>m[5]===P,'ARS'))).padStart(15)}  + USD ${r2(suma(m=>m[5]===P,'USD'))}`)
console.log(`   \x1b[33mTodo el personal es de Juan: ${M(perJuan)}\x1b[0m  → va a su cuenta de socio. Sofi no tiene consumo personal.`)
console.log(`\n   Total del resumen: ${M(TOTAL)} + USD ${TOTAL_USD} · vencía 04/09 · pagado 04/09 ${M(PAGADO_0409)} (débito, lo que había en la cuenta)`)
console.log(`   Queda financiado: ${M(r2(TOTAL-PAGADO_0409))} + USD ${TOTAL_USD} · próximo cierre 01/10, vence 09/10`)

// ── cómo quedaría la cuenta de socios con esto cargado (misma función que la app, sin escribir) ──
const filas=MOVS.map(m=>[TARJETA,MES,ANIO,m[0],m[4],m[1],m[3],m[2],m[5],m[6],'juan@somosmagma.com',
  m[1].includes('08/09')?'figura en la tarjeta de Sofi pero es gasto de Juan':(m[8]?`revisar: ${m[8]}`:(m[5]===E?`gastó ${m[4]}`:''))])
const RS=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:RANGOS_SOCIOS,valueRenderOption:'FORMATTED_VALUE'})
const [SM,MT,PRE,PRO]=RS.data.valueRanges.map(v=>v.values||[])
const MTsin=[MT[0],...MT.slice(1).filter(r=>!(String(r[0]).trim().toLowerCase()===TARJETA.toLowerCase()&&String(r[1]).trim()===String(MES)&&String(r[2]).includes(String(ANIO))))]
const antes=calcularCuentaSocios([SM,MTsin,PRE,PRO]), despues=calcularCuentaSocios([SM,[...MTsin,...filas],PRE,PRO])
console.log(`\n\x1b[1m════════ CUENTA DE SOCIOS · antes → después de cargar agosto (tarjetas hasta ${despues.tarjetasCargadas.hasta}) ════════\x1b[0m`)
antes.socios.forEach((s,i)=>console.log(`   ${s.nombre.padEnd(6)} ${M(s.saldo).padStart(15)}  →  ${M(despues.socios[i].saldo).padStart(15)}   ${fraseSaldo(despues.socios[i])}`))
console.log(`   \x1b[2m(sigue faltando septiembre de las 4 tarjetas y agosto de BBVA Visa, Master Galicia y Santander Amex)\x1b[0m`)

if(!ESCRIBIR){ console.log('\n\x1b[33mPREVIEW — no escribí nada.\x1b[0m\n'); process.exit(0) }

// ── escritura ──
const norm=v=>String(v||'').trim().toLowerCase()
const colLetra=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)}return s}
const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties(title,sheetId))'})
const sid=t=>meta.data.sheets.find(x=>x.properties.title===t)?.properties.sheetId
const hoyISO=new Date().toISOString(), QUIEN='juan@somosmagma.com'
const log=[]

// 1) MOVIMIENTOS_TARJETA: reemplaza lo que haya de Santander Visa mes 8
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
console.log(`   ✓ CUOTAS: ${filasC.length} filas`)

// 3) TARJETAS: julio pagado solo el mínimo · agosto nuevo con el pago parcial · Amex jun+jul pagadas
const tr=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'TARJETAS!A:N'})).data.values||[]
const th=tr[0], TH=n=>th.indexOf(n)
const filaDe=(tarj,mes)=>tr.findIndex((row,i)=>i>0&&norm(row[TH('Tarjeta')])===norm(tarj)&&String(row[TH('Mes')]).trim()===String(mes)&&String(row[TH('Año')]).includes(String(ANIO)))
const ups=[]; const set=(fila,n,v)=>{if(TH(n)!==-1)ups.push({range:`TARJETAS!${colLetra(TH(n))}${fila+1}`,values:[[v]]})}
const f7=filaDe(TARJETA,7)
if(f7>0){ set(f7,'Pagado','SI'); set(f7,'Fecha pago','07/08/2026'); set(f7,'Cuenta pago','Santander Sofi'); set(f7,'Monto pagado',213550); set(f7,'Monto pagado USD',195.72)
  set(f7,'Notas','Cierre 30/07. Se pagó SOLO EL MÍNIMO $213.550 + USD 195,72 el 07/08. Los $3.699.268,32 restantes pasaron financiados al resumen de agosto (interés $221.348 + IVA). Clasificación de Juan 03/08: tarjeta de Sofi toda Magma salvo AILES; la de Juan toda suya salvo Dragonpass y Amazon Prime.') }
for(const mes of [6,7]){ const f=filaDe('Santander Amex',mes); if(f<0)continue
  set(f,'Pagado','SI'); set(f,'Fecha pago','07/08/2026'); set(f,'Cuenta pago','Santander Sofi')
  if(mes===7){ set(f,'Monto pagado',299920); set(f,'Monto pagado USD',388.5); set(f,'Notas','Pagado 07/08 $299.920 (pesos) + 06/08 USD 388,50. Incluía el saldo de junio. Quedó a favor -$197.822,21 por la devolución RG 5617 del 10/08.') }
  else set(f,'Notas','Se pagó adentro del resumen de julio (07/08/2026).') }
if(ups.length) await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data:ups}})
const nota8=`Cierre 27/08, vence 04/09. Consumos: Sofi (Magma) $191.116,57 + AILES de Juan $304.148,88 · Juan $3.314.376,83 · cargos $495.432,03 · + $3.699.268,32 financiado de julio. El 04/09 el débito automático tomó solo ${M(PAGADO_0409)} (lo que había en la cuenta): quedan ${M(r2(TOTAL-PAGADO_0409))} + USD ${TOTAL_USD} financiados al 78% TNA. Mínimo era $851.880: NO se cubrió.`
const f8=filaDe(TARJETA,8)
if(f8>0){ const u=[]; const s8=(n,v)=>{if(TH(n)!==-1)u.push({range:`TARJETAS!${colLetra(TH(n))}${f8+1}`,values:[[v]]})}
  s8('Monto',TOTAL); s8('Monto USD',TOTAL_USD); s8('Vencimiento',VTO); s8('Pagado','NO'); s8('Fecha pago','04/09/2026'); s8('Cuenta pago','Santander Sofi'); s8('Monto pagado',PAGADO_0409); s8('Monto pagado USD',0); s8('Notas',nota8)
  await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data:u}}); console.log(`   ✓ TARJETAS: ${TARJETA} 8/2026 actualizada`)
}else{
  const nueva=new Array(Math.max(th.length,14)).fill(''); const put=(n,v)=>{if(TH(n)!==-1)nueva[TH(n)]=v}
  put('Tarjeta',TARJETA); put('Persona','Sofi (adic. Juan)'); put('Mes',MES); put('Año',ANIO); put('Monto',TOTAL); put('Monto USD',TOTAL_USD)
  put('Vencimiento',VTO); put('Pagado','NO'); put('Fecha pago','04/09/2026'); put('Cuenta pago','Santander Sofi'); put('Monto pagado',PAGADO_0409); put('Monto pagado USD',0); put('Notas',nota8)
  await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'TARJETAS!A:N',valueInputOption:'USER_ENTERED',insertDataOption:'INSERT_ROWS',requestBody:{values:[nueva]}}); console.log(`   ✓ TARJETAS: ${TARJETA} 8/2026 creada`)
}
console.log(`   ✓ TARJETAS: julio Visa = pagado el mínimo · Amex 6 y 7 = pagadas`)
log.push(['TARJETAS',TARJETA,`8/2026 creada · 7/2026 pagado el mínimo · Amex 6-7 pagadas`])

// 4) PRESTAMOS: lo que dice el resumen de cuenta de Sofi
const pr=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PRESTAMOS!A:T'})).data.values||[]
const ph=pr[0], PH=n=>ph.indexOf(n)
const filaP=(nombre,cuota)=>pr.findIndex((row,i)=>i>0&&String(row[PH('Prestamo')]).includes(nombre)&&String(row[PH('Cuota nro')]).includes(cuota))
const upsP=[]; const setP=(fila,n,v)=>{if(PH(n)!==-1)upsP.push({range:`PRESTAMOS!${colLetra(PH(n))}${fila+1}`,values:[[v]]})}
const p11=filaP('8128/6','11/18'), p12=filaP('8035/1','12/12')
if(p11>0){ setP(p11,'Pagado','SI'); setP(p11,'Fecha pago','6/8/2026'); setP(p11,'Cuenta pago','Santander Sofi'); setP(p11,'Notas','Pagada en dos partes: 05/08 $377.312,94 + 06/08 $320.835,87 = $698.148,81 (cronograma $695.812,24). Del resumen de cuenta Santander de Sofi.') }
if(p12>0){ setP(p12,'Pagado','SI'); setP(p12,'Fecha pago','13/8/2026'); setP(p12,'Cuenta pago','Santander Sofi'); setP(p12,'Notas','ÚLTIMA CUOTA: $291.239,10 el 13/08 (cronograma $289.050,90). Préstamo cancelado, saldo $0 según el banco.') }
if(upsP.length) await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data:upsP}})
console.log(`   ✓ PRESTAMOS: 8128/6 cuota 11/18 pagada · 8035/1 cuota 12/12 pagada (préstamo terminado)`)
log.push(['PRESTAMOS','Santander','8128/6 c.11 pagada 6/8 · 8035/1 c.12 pagada 13/8 (cancelado)'])

await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',requestBody:{values:log.map(l=>[hoyISO,QUIEN,'tarjeta-santander-agosto',...l])}})
console.log('\n\x1b[32m✓ Santander Visa de agosto cargada y el banco al día en TARJETAS y PRESTAMOS.\x1b[0m\n')
