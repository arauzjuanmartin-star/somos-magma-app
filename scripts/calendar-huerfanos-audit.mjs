// Audita el Calendar Somos Magma: eventos con tag [SOMOS_MAGMA_PRESU:N] cuyo presupuesto
// ya no existe en el sheet o quedó DESAPROBADO/REPRESUPUESTADO. Solo lectura por default;
// con --borrar elimina los eventos huérfanos (pide preview antes igual).
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const cred={client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')}
const sheets=google.sheets({version:'v4',auth:new google.auth.GoogleAuth({credentials:cred,scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})})
const cal=google.calendar({version:'v3',auth:new google.auth.GoogleAuth({credentials:cred,scopes:['https://www.googleapis.com/auth/calendar'],clientOptions:{subject:env.CALENDAR_AS||'sofi@somosmagma.com'}})})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const CAL='5gc9hdvh4vi28bf8uemr2vfnn4@group.calendar.google.com'
const BORRAR=process.argv.includes('--borrar')
const txt=v=>String(v??'').trim()

const R=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PRESUPUESTOS!A:G'})
const rows=R.data.values||[]
const presus=new Map()
rows.slice(1).forEach(r=>{ const n=txt(r[0]); if(n) presus.set(n,{estado:txt(r[3]),ag:txt(r[4]),cl:txt(r[5]),pr:txt(r[6])}) })

const desde=new Date(); desde.setMonth(desde.getMonth()-6)
const hasta=new Date(); hasta.setMonth(hasta.getMonth()+18)
let pageToken, eventos=[]
do{
  const r=await cal.events.list({calendarId:CAL,timeMin:desde.toISOString(),timeMax:hasta.toISOString(),maxResults:250,singleEvents:true,orderBy:'startTime',pageToken})
  eventos.push(...(r.data.items||[])); pageToken=r.data.nextPageToken
}while(pageToken)

const huerfanos=[]
for(const e of eventos){
  const m=String(e.description||'').match(/\[SOMOS_MAGMA_PRESU:([^\]]+)\]/)
  if(!m) continue
  const num=m[1].trim()
  const p=presus.get(num)
  const start=e.start?.date||e.start?.dateTime||''
  if(!p){ huerfanos.push({e,num,start,motivo:'el presu ya no existe en el sheet (eliminado)'}) }
  else if(/DESAPROBADO|REPRESUPUESTADO/i.test(p.estado)){ huerfanos.push({e,num,start,motivo:`presu ${p.estado}`}) }
}

console.log(`Eventos con tag revisados: ${eventos.filter(e=>/SOMOS_MAGMA_PRESU/.test(e.description||'')).length} de ${eventos.length} totales`)
console.log(`\n── HUÉRFANOS: ${huerfanos.length}\n`)
huerfanos.forEach(h=>console.log(`  ${h.start.slice(0,10)}  ${h.e.summary}\n      → ${h.motivo}\n      id=${h.e.id}`))
if(!huerfanos.length) console.log('  (ninguno)')

if(BORRAR && huerfanos.length){
  console.log('\n── BORRANDO...')
  for(const h of huerfanos){
    await cal.events.delete({calendarId:CAL,eventId:h.e.id,sendUpdates:'all'})
    console.log(`  ✓ borrado ${h.e.summary}`)
  }
} else if(huerfanos.length){
  console.log('\n(preview — para borrarlos: node scripts/calendar-huerfanos-audit.mjs --borrar)')
}
