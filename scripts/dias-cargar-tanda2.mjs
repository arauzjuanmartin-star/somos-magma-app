/**
 * Tanda 2 — los 10 pendientes confirmados por Juan (2026-07-31)
 * + cambia el pedido "Otros" de Paula por "Locución" en SIT [1904].
 * PREVIEW por defecto; con --escribir aplica.
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
const colLetra=c=>{let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)} return s}

// Confirmado por Juan 2026-07-31
const CONF={
  '1735':{d:1,exc:{},nota:'staff ok, todos 1 jornada'},
  '1759':{d:2,exc:{},nota:'fueron 2 días — Gaspar y Santino son todo el staff'},
  '1896':{d:1,exc:{'Rafael D´Angelo':2},nota:'Rafa 2 días; Santino ya tiene 2 líneas'},
  '2050':{d:1,exc:{},nota:'el evento duró 2 pero todos fueron 1'},
  '1145':{d:1,exc:{},nota:'están bien'},
  '1957':{d:1,exc:{},nota:'está bien'},
  '2132':{d:1,exc:{},nota:'Felipe ya tiene 2 líneas = sus 2 días'},
  '1674':{d:2,exc:{},nota:'son 2 días'},
  '2030':{d:1,exc:{},nota:'está bien'},
  '1134':{d:1,exc:{},nota:'está bien así'},
}

const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS',valueRenderOption:'FORMATTED_VALUE'})
const P=r.data.values
const updates=[], problemas=[]
Object.entries(CONF).forEach(([n,cfg])=>{
  const idxs=[]; P.forEach((row,i)=>{ if(txt(row[2])===n) idxs.push(i) })
  if(idxs.length!==1){ problemas.push(`[${n}] aparece ${idxs.length} veces — NO se escribe`); return }
  const row=P[idxs[0]], fila=idxs[0]+1
  const staffProy=new Set(); PED.forEach(pc=>{const s=txt(row[pc+2]); if(s&&!/somos magma/i.test(s)) staffProy.add(s)})
  const excOK={}
  Object.entries(cfg.exc).forEach(([pers,d])=>{
    if(staffProy.has(pers)) excOK[pers]=d
    else problemas.push(`[${n}] "${pers}" no está en el staff. Hay: ${[...staffProy].join(', ')}`)
  })
  const excStr=Object.entries(excOK).map(([p,d])=>`${p}:${d}`).join(' | ')
  updates.push({n,fila,proy:txt(row[6]),dias:cfg.d,exc:excStr,nota:cfg.nota,
    ranges:[{range:`PROYECTOS!CG${fila}`,values:[[cfg.d]]},
            {range:`PROYECTOS!CH${fila}`,values:[[excStr]]},
            {range:`PROYECTOS!CI${fila}`,values:[['revisado']]}]})
})

// --- "Otros" -> "Locución" en 1904 (Paula) ---
let locu=null
const r1904=P.findIndex(row=>txt(row[2])==='1904')
if(r1904>=0){
  const row=P[r1904]
  PED.forEach(pc=>{ if(txt(row[pc])==='Otros' && /paula/i.test(txt(row[pc+2])))
    locu={range:`PROYECTOS!${colLetra(pc)}${r1904+1}`,antes:'Otros',despues:'Locución',pers:txt(row[pc+2])} })
}

console.log(`\n${'━'.repeat(76)}\n  ${ESCRIBIR?'ESCRIBIENDO':'PREVIEW'} — tanda 2\n${'━'.repeat(76)}`)
updates.forEach(u=>{
  console.log(`  [${u.n.padEnd(5)}] fila ${String(u.fila).padStart(4)}  Días=${u.dias}  ${u.proy.slice(0,34).padEnd(36)} ${u.nota}`)
  if(u.exc) console.log(`  ${''.padEnd(22)}└─ excepción: ${u.exc}`)})
if(locu) console.log(`\n  ${locu.range}: "${locu.antes}" → "${locu.despues}"  (${locu.pers})`)
if(problemas.length){ console.log(`\n  ⚠ PROBLEMAS:`); problemas.forEach(p=>console.log('    · '+p)) }

if(!ESCRIBIR) console.log(`\n  PREVIEW — no se escribió nada. Correr con --escribir.`)
else{
  const data=updates.flatMap(u=>u.ranges)
  if(locu) data.push({range:locu.range,values:[[locu.despues]]})
  await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data}})
  console.log(`\n  ✓ ${updates.length} proyectos + ${locu?1:0} pedido corregido (${data.length} celdas)`)
}
