/**
 * SANTANDER VISA — julio 2026 (cierre 30/07, vto 07/08). Titular Sofía, adicional Juan.
 *
 * Clasificación dada por Juan el 03/08/2026:
 *   · Tarjeta 7665 (Sofi): TODO es de Magma salvo AILES S.A C.07/09 $304.148,88, que es de Juan.
 *   · Tarjeta 2355 (Juan): TODO es de Juan salvo Dragonpass USD 76 y Amazon Prime USD 16,26, que son de Magma.
 *
 * Sin --escribir solo muestra el preview.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR=process.argv.includes('--escribir')
const M=n=>'$'+n.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})
const r2=n=>Math.round(n*100)/100
const TARJETA='Santander Visa', MES=7, ANIO=2026, VTO='07/08/2026'
const E='Empresa', P='Personal'
const MOV='Producción · Movilidad', WEB='Software · Web/productividad', VIA='Producción · Viajes'
const BCO='Costos bancarios', PER='Percepciones a recuperar'

// [fecha, comercio, monto, moneda, titular, categoria, rubro, cuota]
const MOVS=[
  // ── tarjeta 7665 · consumos de Sofía: todo Magma salvo AILES, que es de Juan ──
  ['29/12','AILES S.A (cuota 07/09)',            304148.88,'ARS','Juan', P,'Personal','7/9'],
  ['13/07','CABIFY AR 262924O7TOET',              61488.01,'ARS','Sofi', E,MOV,''],
  ['16/07','CABIFY 2629WDAVP5YC',                  7545.09,'ARS','Sofi', E,MOV,''],
  ['14/07','GOOGLE ONE',                              9.99,'USD','Sofi', E,WEB,''],
  ['15/07','SQSP* WEBSITE (Squarespace)',            14.00,'USD','Sofi', E,WEB,''],
  // ── tarjeta 2355 · consumos de Juan: todo suyo salvo Dragonpass y Amazon Prime ──
  ['14/07','DRAGONPASS',                             76.00,'USD','Juan', E,VIA,''],
  ['14/07','AMAZON PRIME*KL9',                       16.26,'USD','Juan', E,WEB,''],
  ['03/03','AILES S.A (cuota 05/09)',              26666.11,'ARS','Juan', P,'Personal','5/9'],
  ['07/06','711704*DF FESTIVAL (cuota 02/06)',    107500.00,'ARS','Juan', P,'Personal','2/6'],
  ['12/06','MERPAGO*CHIPOTE (cuota 02/09)',         6177.77,'ARS','Juan', P,'Personal','2/9'],
  ['05/07','P.SKOOL.COM/DTLT',                        49.00,'USD','Juan', P,'Personal',''],
  ['06/07','MERPAGO*DANIELAVERONICACO',            10699.00,'ARS','Juan', P,'Personal',''],
  ['10/07','MERPAGO*JUANFRANCISCODEPA',           160485.00,'ARS','Juan', P,'Personal',''],
  ['10/07','MERPAGO*MARQUESEZEQUIEL',              55634.80,'ARS','Juan', P,'Personal',''],
  ['12/07','MERPAGO*DIEGOCASSAGNE',               641940.00,'ARS','Juan', P,'Personal',''],
  ['14/07','MERPAGO*ELIZABETHDELPILAR',            10699.00,'ARS','Juan', P,'Personal',''],
  ['14/07','MERPAGO*VALERIANATACHAMIN',             8024.25,'ARS','Juan', P,'Personal',''],
  ['15/07','MERPAGO*ASOCIACIONVENANCI',           112339.50,'ARS','Juan', P,'Personal',''],
  ['15/07','APPLE.COM/BILL',                           9.49,'USD','Juan', P,'Personal',''],
  ['16/07','KIOSCO',                                3600.00,'ARS','Juan', P,'Personal',''],
  ['17/07','MERPAGO*LUCIANONICOLAS',               64194.00,'ARS','Juan', P,'Personal',''],
  ['17/07','APPLE.COM/BILL',                          13.99,'USD','Juan', P,'Personal',''],
  ['18/07','MERPAGO*DIEGOCASSAGNE',                53495.00,'ARS','Juan', P,'Personal',''],
  ['18/07','MERPAGO*ROXANAVANESAFE',               53495.00,'ARS','Juan', P,'Personal',''],
  ['18/07','MERPAGO*GLIKMANSUSANAR',               71683.30,'ARS','Juan', P,'Personal',''],
  ['19/07','MERPAGO*OPEN25',                       20000.00,'ARS','Juan', P,'Personal',''],
  ['20/07','MERPAGO*NESTORFABIANMARIN',            20649.07,'ARS','Juan', P,'Personal',''],
  ['20/07','MERPAGO*NOELIASILVANARODR',             6205.42,'ARS','Juan', P,'Personal',''],
  ['20/07','APPYPF 01142 TIENDA',                   7600.00,'ARS','Juan', P,'Personal',''],
  ['21/07','MERPAGO*LUCASRODRIGORETON',            54832.38,'ARS','Juan', P,'Personal',''],
  ['21/07','MERPAGO*VERONICAPERETTO',              12828.10,'ARS','Juan', P,'Personal',''],
  ['21/07','CARREFOUR GUALEGUAYCHU',               57199.57,'ARS','Juan', P,'Personal',''],
  ['22/07','MERPAGO*VERONICAANDREAMOR',           748930.00,'ARS','Juan', P,'Personal',''],
  ['23/07','LA FAROLA DE NUNEZ',                   31300.00,'ARS','Juan', P,'Personal',''],
  ['24/07','MERPAGO*ALEXANDERCHRIS',               10057.06,'ARS','Juan', P,'Personal',''],
  ['25/07','MERPAGO*PEKOPEKO',                     35000.00,'ARS','Juan', P,'Personal',''],
  ['25/07','MERPAGO*PARKING',                       7600.00,'ARS','Juan', P,'Personal',''],
  ['25/07','MERPAGO*KIOSCOZABALA',                  4000.00,'ARS','Juan', P,'Personal',''],
  ['25/07','MERPAGO*EDITHROXANAPAN',                2995.72,'ARS','Juan', P,'Personal',''],
  ['25/07','MERPAGO*ZHUANGAIJIAN',                 21398.00,'ARS','Juan', P,'Personal',''],
  ['25/07','LA PARRILLA DE JESUS',                 68000.00,'ARS','Juan', P,'Personal',''],
  ['25/07','MORA ANDREA CAROLINA',                  8500.00,'ARS','Juan', P,'Personal',''],
  ['26/07','MERPAGO*YANNIALEXANDER',                5349.50,'ARS','Juan', P,'Personal',''],
  ['26/07','APPLE.COM/BILL',                           6.99,'USD','Juan', P,'Personal',''],
  ['28/07','MERPAGO*PREVENCIONSALUDSA',           546488.84,'ARS','Juan', P,'Personal',''],
  ['28/07','PROPINA*RAPPI',                         1400.00,'ARS','Juan', P,'Personal',''],
  ['28/07','RAPPI',                                18058.00,'ARS','Juan', P,'Personal',''],
  ['29/07','MERPAGO*GLIKMANSUSANARUT',             71683.30,'ARS','Juan', P,'Personal',''],
  ['29/07','MERPAGO*DELFINAMARIALA',               53495.00,'ARS','Juan', P,'Personal',''],
  ['29/07','MERPAGO*MERCADOPAGOPAGOCR',           378973.90,'ARS','Juan', P,'Personal',''],
  ['30/07','MERPAGO*CESARLUISCUEVAJUR',            32631.95,'ARS','Juan', P,'Personal',''],
  // ── cargos del banco ──
  ['30/07','Costos bancarios (intereses $2.164,79 + IVA $454,61 + IIBB $979,58 + IVA RG4240 $10.285,59)', 13884.57,'ARS','Magma',E,BCO,''],
  ['30/07','DB.RG 5617 30% — pago a cuenta, NO es gasto',                                                 87839.13,'ARS','Magma',E,PER,''],
]

// ── control contra los totales impresos ──
const suma=(f,mon)=>MOVS.filter(m=>f(m)&&m[3]===mon).reduce((a,m)=>a+m[2],0)
// consumos de la tarjeta 7665 = los de Sofi + AILES 07/09 (que figura ahí aunque sea gasto de Juan)
const enSofi=m=>m[4]==='Sofi'||m[1].includes('07/09')
const enJuan=m=>m[4]==='Juan'&&!m[1].includes('07/09')
const controles=[
  ['Tarjeta 7665 (Sofía) ARS', r2(suma(enSofi,'ARS')),  373181.98],
  ['Tarjeta 7665 (Sofía) USD', r2(suma(enSofi,'USD')),      23.99],
  ['Tarjeta 2355 (Juan) ARS',  r2(suma(enJuan,'ARS')), 3611808.54],
  ['Tarjeta 2355 (Juan) USD',  r2(suma(enJuan,'USD')),     171.73],
  ['Cargos del banco',         r2(suma(m=>m[4]==='Magma','ARS')), 101723.70],
]
let ok=true
console.log('\n\x1b[1m■ CONTROL contra los totales impresos del resumen\x1b[0m')
controles.forEach(([n,c,e])=>{const b=Math.abs(c-e)<0.02; if(!b)ok=false
  console.log(`   ${b?'\x1b[32m✓\x1b[0m':'\x1b[31m✗\x1b[0m'} ${n.padEnd(28)} calculado ${String(c).padStart(13)}  ·  resumen ${String(e).padStart(13)}`)})
if(!ok){ console.log('\n\x1b[31mNo cierra. No escribo nada.\x1b[0m\n'); process.exit(1) }

// ── preview ──
console.log(`\n\x1b[1m════════ SANTANDER VISA — julio 2026 (cierre 30/07, vto 07/08) ════════\x1b[0m`)
for(const [tit,lbl] of [['Sofi','SOFI'],['Juan','JUAN'],['Magma','CARGOS DEL BANCO']]){
  const ms=MOVS.filter(m=>m[4]===tit); if(!ms.length)continue
  const emp=ms.filter(m=>m[5]===E), per=ms.filter(m=>m[5]===P)
  console.log(`\n\x1b[1m▸ ${lbl}\x1b[0m`)
  if(emp.length){ console.log(`  \x1b[36m— EMPRESA (${emp.length})\x1b[0m`)
    emp.forEach(m=>console.log(`   ${m[0].padEnd(7)} ${m[1].slice(0,46).padEnd(48)} ${(m[3]==='USD'?'USD '+m[2]:M(m[2])).padStart(15)}  ${m[6]}`)) }
  if(per.length){ console.log(`  \x1b[33m— PERSONAL (${per.length})\x1b[0m`)
    per.slice(0,6).forEach(m=>console.log(`   ${m[0].padEnd(7)} ${m[1].slice(0,46).padEnd(48)} ${(m[3]==='USD'?'USD '+m[2]:M(m[2])).padStart(15)}`))
    if(per.length>6) console.log(`   … y ${per.length-6} más`) }
  console.log(`  \x1b[1m  Empresa ${M(r2(suma(m=>m[4]===tit&&m[5]===E,'ARS'))).padStart(14)}  ·  Personal ${M(r2(suma(m=>m[4]===tit&&m[5]===P,'ARS'))).padStart(14)}\x1b[0m`)
}
const perJuan=r2(suma(m=>m[4]==='Juan'&&m[5]===P,'ARS'))
console.log(`\n\x1b[1m════════ RESUMEN ════════\x1b[0m`)
console.log(`   EMPRESA   ${M(r2(suma(m=>m[5]===E,'ARS'))).padStart(15)}  + USD ${r2(suma(m=>m[5]===E,'USD'))}`)
console.log(`   PERSONAL  ${M(r2(suma(m=>m[5]===P,'ARS'))).padStart(15)}  + USD ${r2(suma(m=>m[5]===P,'USD'))}`)
console.log(`\n   \x1b[33mTodo el personal es de Juan: ${M(perJuan)}\x1b[0m  → va a su cuenta de socio`)
console.log(`   Sofi no tiene consumo personal en esta tarjeta.`)
console.log(`\n   Total a pagar del resumen: ${M(4000657.46)} + USD 195,72`)

if(!ESCRIBIR){ console.log('\n\x1b[33mPREVIEW — no escribí nada.\x1b[0m\n'); process.exit(0) }

// ── escritura ──
const norm=v=>String(v||'').trim().toLowerCase()
const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties(title,sheetId))'})
const sid=t=>meta.data.sheets.find(x=>x.properties.title===t)?.properties.sheetId

const filas=MOVS.map(m=>[TARJETA,MES,ANIO,m[0],m[4],m[1],m[3],m[2],m[5],m[6],'juan@somosmagma.com',
  m[1].includes('07/09')?'figura en la tarjeta de Sofi pero es gasto de Juan':(m[5]===E?`gastó ${m[4]}`:'')])
const cur=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'MOVIMIENTOS_TARJETA!A:C'})).data.values||[]
const del=cur.map((r,i)=>({r,i})).filter(({r},i)=>i>0&&norm(r[0])===norm(TARJETA)&&String(r[1]).trim()===String(MES)&&String(r[2]).includes(String(ANIO))).map(x=>x.i)
if(del.length) await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:del.sort((a,b)=>b-a).map(i=>({deleteDimension:{range:{sheetId:sid('MOVIMIENTOS_TARJETA'),dimension:'ROWS',startIndex:i,endIndex:i+1}}}))}})
await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'MOVIMIENTOS_TARJETA!A:L',valueInputOption:'USER_ENTERED',insertDataOption:'INSERT_ROWS',requestBody:{values:filas}})
console.log(`\n   ✓ MOVIMIENTOS_TARJETA: ${filas.length} filas`)

const filasC=MOVS.filter(m=>m[7]).map(m=>{const [a,t]=m[7].split('/').map(Number)
  return [m[1].replace(/\s*\(cuota[^)]*\)/,''), m[5]===E?'Magma':m[4], TARJETA, m[5], m[2], a, t, 8, ANIO, a<t?'Activa':'Terminada','']})
const curC=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'CUOTAS!A:K'})).data.values||[]
const delC=curC.map((r,i)=>({r,i})).filter(({r},i)=>i>0&&norm(r[2])===norm(TARJETA)).map(x=>x.i)
if(delC.length) await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:delC.sort((a,b)=>b-a).map(i=>({deleteDimension:{range:{sheetId:sid('CUOTAS'),dimension:'ROWS',startIndex:i,endIndex:i+1}}}))}})
await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'CUOTAS!A:K',valueInputOption:'USER_ENTERED',insertDataOption:'INSERT_ROWS',requestBody:{values:filasC}})
console.log(`   ✓ CUOTAS: ${filasC.length} filas · a vencer en agosto ${M(r2(filasC.filter(f=>f[9]==='Activa').reduce((a,f)=>a+f[4],0)))}`)

const colLetra=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)}return s}
const tr=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'TARJETAS!A:N'})).data.values||[]
const th=tr[0], TH=n=>th.indexOf(n)
const nota='Cierre 30/07. Titular Sofía, adicional Juan. Clasificación de Juan 03/08: la tarjeta de Sofi es toda de Magma salvo AILES; la de Juan es toda suya salvo Dragonpass y Amazon Prime.'
const fila=tr.findIndex((row,i)=>i>0&&norm(row[TH('Tarjeta')])===norm(TARJETA)&&String(row[TH('Mes')]).trim()===String(MES)&&String(row[TH('Año')]).includes(String(ANIO)))
if(fila>0){
  const ups=[]; const set=(n,v)=>{if(TH(n)!==-1)ups.push({range:`TARJETAS!${colLetra(TH(n))}${fila+1}`,values:[[v]]})}
  set('Monto',4000657.46); set('Monto USD',195.72); set('Vencimiento',VTO); set('Notas',nota)
  await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data:ups}})
  console.log(`   ✓ TARJETAS: ${TARJETA} 7/2026 actualizada`)
}else{
  const nueva=new Array(Math.max(th.length,14)).fill('')
  const put=(n,v)=>{if(TH(n)!==-1)nueva[TH(n)]=v}
  put('Tarjeta',TARJETA); put('Mes',MES); put('Año',ANIO); put('Monto',4000657.46); put('Monto USD',195.72)
  put('Vencimiento',VTO); put('Pagado','NO'); put('Notas',nota)
  await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'TARJETAS!A:N',valueInputOption:'USER_ENTERED',insertDataOption:'INSERT_ROWS',requestBody:{values:[nueva]}})
  console.log(`   ✓ TARJETAS: ${TARJETA} 7/2026 creada`)
}
await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',
  requestBody:{values:[[new Date().toISOString(),'juan@somosmagma.com','tarjeta-santander-julio','TARJETAS',TARJETA,`7/2026 · ${filas.length} movimientos`]]}})
console.log('\n\x1b[32m✓ Santander Visa de julio cargada.\x1b[0m\n')
