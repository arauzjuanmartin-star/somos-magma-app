/**
 * Cierra 2025: carga los 117 que quedaban sin días.
 *  - 13 revisados con Juan (Lulú = edición mensual → 1; los de Juan = alquiler de
 *    cámara a Magma, NO jornadas → 1; Clodew lleva Sofi 2)
 *  - 104 con montos normales → 1 jornada
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
const num=v=>{const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim().toLowerCase()

// Revisados con Juan 2026-07-31. Todos 1 jornada salvo la excepción de Clodew.
const REVISADOS={
  50 :{d:1, exc:{'Sofi':2}, nota:'Clodew — Sofi 2 jornadas, Juan 1'},
  299:{d:1, exc:{}, nota:'Fx6 Facu-Trueno — alquiler de cámara a Magma, no jornada'},
  280:{d:1, exc:{}, nota:'Fx6 Facu-Don Osvaldo — ídem'},
  325:{d:1, exc:{}, nota:'Paco y Catriel — ídem'},
  112:{d:1, exc:{}, nota:'Lasaigues Paddle — Sofi 1, Juan 1'},
  2  :{d:1, exc:{}, nota:'Mani King — 1 día'},
  309:{d:1, exc:{}, nota:'Mani King — Lulú edición mensual'},
  257:{d:1, exc:{}, nota:'Mani king — Lulú edición mensual'},
  162:{d:1, exc:{}, nota:'Mani King — Lulú edición mensual'},
  53 :{d:1, exc:{}, nota:'Mani King — Lulú edición mensual'},
  430:{d:1, exc:{}, nota:'Mani king Noviembre — Lulú edición mensual'},
  124:{d:1, exc:{}, nota:'Animaciones Zebra — Lulú edición'},
  48 :{d:1, exc:{}, nota:'Cenefa Santander — Lulú edición'},
}

const R=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'HISTORICO_2025',valueRenderOption:'FORMATTED_VALUE'})
const H=R.data.values||[]
function pf(s){const m=txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?new Date(+m[3],+m[2]-1,+m[1]):null}
const pend=[]
H.slice(1).forEach((r,i)=>{
  const nom=txt(r[6]); if(!nom)return
  const st=[]; [15,17,19,21,23,25].forEach(sc=>{const p=txt(r[sc]); const pr=num(r[sc+1])
    if(p&&pr>1&&!/somos magma/i.test(p)) st.push(p)})
  if(!st.length)return
  if(!pf(r[2]))return
  if(num(r[31])>0)return                       // ya tiene días
  pend.push({fila:i+2,nom,st:[...new Set(st)],costo:0})
})

const data=[], problemas=[]
pend.forEach(p=>{
  const cfg=REVISADOS[p.fila]
  const excOK={}
  if(cfg) Object.entries(cfg.exc).forEach(([pers,d])=>{
    if(p.st.some(s=>norm(s)===norm(pers))) excOK[pers]=d
    else problemas.push(`f${p.fila}: "${pers}" no está (hay: ${p.st.join(', ')})`)
  })
  data.push({fila:p.fila,nom:p.nom,d:cfg?cfg.d:1,
    exc:Object.entries(excOK).map(([k,v])=>`${k}:${v}`).join(' | '),
    origen:cfg?'revisado':'inferido', nota:cfg?cfg.nota:''})
})
console.log(`\n${'━'.repeat(78)}\n  ${ESCRIBIR?'ESCRIBIENDO':'PREVIEW'} — cierre 2025\n${'━'.repeat(78)}`)
console.log(`\n  REVISADOS CON JUAN (${data.filter(d=>d.origen==='revisado').length}):`)
data.filter(d=>d.origen==='revisado').forEach(d=>{
  console.log(`   f${String(d.fila).padStart(4)}  Días=${d.d}  ${d.nom.slice(0,32).padEnd(34)} ${d.nota}`)
  if(d.exc) console.log(`   ${''.padEnd(6)}└─ ${d.exc}`)})
console.log(`\n  MONTOS NORMALES → 1 jornada: ${data.filter(d=>d.origen==='inferido').length}`)
if(problemas.length){ console.log(`\n  ⚠ PROBLEMAS:`); problemas.forEach(p=>console.log('    · '+p)) }

if(!ESCRIBIR) console.log(`\n  PREVIEW — no se escribió nada (${data.length} filas listas).`)
else{
  const payload=data.flatMap(d=>[
    {range:`HISTORICO_2025!AF${d.fila}`,values:[[d.d]]},
    {range:`HISTORICO_2025!AG${d.fila}`,values:[[d.exc]]},
    {range:`HISTORICO_2025!AH${d.fila}`,values:[[d.origen]]},
  ])
  for(let i=0;i<payload.length;i+=450)
    await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data:payload.slice(i,i+450)}})
  console.log(`\n  ✓ ${data.length} proyectos cargados. 2025 COMPLETO.`)
}
