/**
 * Carga los días confirmados por Juan (2026) en PROYECTOS: CG=Días, CH=Días x persona, CI=Días origen.
 * Corre en PREVIEW por defecto. Con --escribir aplica.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const ESCRIBIR=process.argv.includes('--escribir')
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]

// Confirmado por Juan 2026-07-29. "1 día" = 1 jornada (puede ser media, se computa 1).
const CONF={
  '1904':{d:3,exc:{'Blas Lafontaine':1,'Lucía María Grenier Basavilbaso':2,'Nicolas Melgagero':1,'Paula Ximena Pereira':1}},
  '1021':{d:1,exc:{'Jorge Luis Chavez':2}},
  '1143':{d:1,exc:{'Sofia Maria Grenier Basavilbaso':2}},
  '2009':{d:1,exc:{}},
  '1050':{d:2,exc:{}},
  '2053':{d:1,exc:{}},
  '1928':{d:1,exc:{}},
  '1905':{d:4,exc:{'Felipe Martinez':3,'Tomás Halbach':3,'Ivan Aranda':3,'Juan Martin Arauz':2,'Jorge Luis Chavez':1,'Martin Nahuel Litman (Tutu)':1,'Santino D’ Angelo':1}},
  '1173':{d:2,exc:{}},
  '1141v2':{d:2,exc:{}},
  '1682':{d:1,exc:{}},
  '1183':{d:1,exc:{}},
  '1967':{d:1,exc:{}},
  '1749':{d:1,exc:{}},
  '1871':{d:2,exc:{'Juan Martin Arauz':1}},
  '1751':{d:2,exc:{}},
  '1669':{d:2,exc:{}},
  '1768':{d:1,exc:{}},
  '1858':{d:1,exc:{}},
  '1996':{d:1,exc:{}},
  '1695':{d:4,exc:{}},
  '1696':{d:2,exc:{'Tomás Halbach':1}},
}

const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS',valueRenderOption:'FORMATTED_VALUE'})
const P=r.data.values
const updates=[], problemas=[]
Object.entries(CONF).forEach(([n,cfg])=>{
  const idxs=[]; P.forEach((row,i)=>{ if(txt(row[2])===n) idxs.push(i) })
  if(idxs.length!==1){ problemas.push(`[${n}] aparece ${idxs.length} veces — NO se escribe`); return }
  const row=P[idxs[0]], fila=idxs[0]+1
  // validar que cada persona de la excepción exista en el staff del proyecto
  const staffProy=new Set(); PED.forEach(pc=>{const s=txt(row[pc+2]); if(s&&!/somos magma/i.test(s)) staffProy.add(s)})
  const excOK={}
  Object.entries(cfg.exc).forEach(([pers,d])=>{
    if(staffProy.has(pers)) excOK[pers]=d
    else problemas.push(`[${n}] "${pers}" no está en el staff — excepción ignorada`)
  })
  const excStr=Object.entries(excOK).map(([p,d])=>`${p}:${d}`).join(' | ')
  updates.push({n,fila,proy:txt(row[6]),dias:cfg.d,exc:excStr,
    ranges:[{range:`PROYECTOS!CG${fila}`,values:[[cfg.d]]},
            {range:`PROYECTOS!CH${fila}`,values:[[excStr]]},
            {range:`PROYECTOS!CI${fila}`,values:[['revisado']]}]})
})
console.log(`\n${'━'.repeat(78)}\n  ${ESCRIBIR?'ESCRIBIENDO':'PREVIEW'} — días confirmados por Juan\n${'━'.repeat(78)}`)
console.log(`  ${'N°'.padEnd(8)}${'fila'.padStart(5)}  ${'días'.padStart(4)}  proyecto / excepciones`)
updates.forEach(u=>{
  console.log(`  ${u.n.padEnd(8)}${String(u.fila).padStart(5)}  ${String(u.dias).padStart(4)}  ${u.proy.slice(0,40)}`)
  if(u.exc) console.log(`  ${''.padEnd(19)}└─ ${u.exc}`)})
if(problemas.length){ console.log(`\n  ⚠ PROBLEMAS:`); problemas.forEach(p=>console.log('    · '+p)) }
console.log(`\n  ${updates.length} proyectos · ${updates.filter(u=>u.exc).length} con excepciones`)

if(!ESCRIBIR){ console.log(`\n  PREVIEW — no se escribió nada. Correr con --escribir.`) }
else{
  // asegurar columna CI con header
  const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets.properties'})
  const sp=meta.data.sheets.find(s=>s.properties.title==='PROYECTOS').properties
  if(sp.gridProperties.columnCount<87)
    await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[{appendDimension:{sheetId:sp.sheetId,dimension:'COLUMNS',length:87-sp.gridProperties.columnCount}}]}})
  await sheets.spreadsheets.values.update({spreadsheetId:ID,range:'PROYECTOS!CI1',valueInputOption:'USER_ENTERED',requestBody:{values:[['Días origen']]}})
  await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:[
    {repeatCell:{range:{sheetId:sp.sheetId,startRowIndex:1,endRowIndex:sp.gridProperties.rowCount,startColumnIndex:86,endColumnIndex:87},cell:{userEnteredFormat:{numberFormat:{type:'TEXT'}}},fields:'userEnteredFormat.numberFormat'}}]}})
  const data=updates.flatMap(u=>u.ranges)
  await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data}})
  console.log(`\n  ✓ Escritas ${updates.length} filas (${data.length} celdas) en PROYECTOS CG/CH/CI`)
}
