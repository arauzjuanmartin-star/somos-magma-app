// Le da acceso a la carpeta de crudo a un freelancer, en todos los proyectos donde
// está cargado como staff. Hizo falta porque la carpeta se creaba al aprobar pero
// sólo se compartía a mano desde Edición: el que iba a filmar recibía la citación
// con el link y se encontraba con "no tenés permiso" el día del rodaje.
// Los proyectos nuevos ya no lo necesitan (lo hace calendar-evento al invitar).
//
//   node scripts/drive-acceso-staff.mjs "Jorge Luis Chavez"              → preview
//   node scripts/drive-acceso-staff.mjs "Jorge Luis Chavez" --escribir   → comparte
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const cred={client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')}
const sheets=google.sheets({version:'v4',auth:new google.auth.GoogleAuth({credentials:cred,scopes:['https://www.googleapis.com/auth/spreadsheets']})})
const drive=google.drive({version:'v3',auth:new google.auth.GoogleAuth({credentials:cred,scopes:['https://www.googleapis.com/auth/drive']})})
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

const quien=process.argv[2], escribir=process.argv.includes('--escribir')
if(!quien){ console.log('Falta el nombre. Ej: node scripts/drive-acceso-staff.mjs "Jorge Luis Chavez"'); process.exit(1) }

const rh=(await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'RRHH!A:D'})).data.values
const iN=rh[0].indexOf('Nombre Apellido'), iM=rh[0].indexOf('Mail')
const ficha=rh.slice(1).find(r=>String(r[iN]||'').trim().toLowerCase()===quien.trim().toLowerCase())
if(!ficha){ console.log(`No encontré "${quien}" en RRHH`); process.exit(1) }
const mail=String(ficha[iM]||'').trim()
if(!/@/.test(mail)){ console.log(`"${quien}" no tiene mail en RRHH — cargalo primero`); process.exit(1) }
console.log(`${quien} → ${mail}\n`)

const rp=(await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PROYECTOS!A:ET'})).data.values
const PH=rp[0], iStaff=PH.map((h,i)=>(h==='Staff'||/^Staff \d+$/.test(String(h).trim()))?i:-1).filter(i=>i>=0)
const g=(r,n)=>r[PH.indexOf(n)]||''
const suyos=rp.slice(1).filter(r=>iStaff.some(i=>String(r[i]||'').trim().toLowerCase()===quien.trim().toLowerCase()))
const conCarpeta=suyos.map(r=>({num:g(r,'N° presupuesto'),fecha:g(r,'Fecha Evento'),cli:g(r,'Cliente'),proy:g(r,'Proyecto'),
  id:(String(g(r,'Drive Crudo')).match(/\/folders\/([A-Za-z0-9_-]+)/)||[])[1]})).filter(x=>x.id)

console.log(`${suyos.length} proyectos con ${quien} como staff · ${conCarpeta.length} tienen carpeta de crudo`)
conCarpeta.forEach(x=>console.log(`  #${x.num} · ${x.fecha} · ${x.cli} / ${String(x.proy).slice(0,45)}`))
if(!escribir){ console.log(`\nPREVIEW. Para darle acceso de verdad: --escribir`); process.exit(0) }

console.log(`\nDando acceso de escritura...`)
let ok=0, ya=0, fallo=0
for(const x of conCarpeta){
  try{
    await drive.permissions.create({fileId:x.id,requestBody:{type:'user',role:'writer',emailAddress:mail},sendNotificationEmail:false,supportsAllDrives:true})
    console.log(`  ✓ #${x.num}`); ok++
  }catch(e){
    if(/already|duplicate/i.test(e.message)){ console.log(`  · #${x.num} ya tenía`); ya++ }
    else { console.log(`  ✗ #${x.num}: ${e.message}`); fallo++ }
  }
}
console.log(`\n${ok} nuevos · ${ya} ya tenían · ${fallo} fallaron`)
