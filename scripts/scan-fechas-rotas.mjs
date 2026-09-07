// SOLO LECTURA. Escanea PRESUPUESTOS buscando fechas de evento rotas:
//  (1) rango invertido en el sheet (Fechas Adicionales antes que Fecha Evento) — el bug directo
//  (2) evento del Calendar desincronizado con la fecha del presu (o faltante)
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
    const i=l.indexOf('='); let v=l.slice(i+1).trim()
    if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1)
    return [l.slice(0,i).trim(),v]
  })
)
const cred={client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')}
const sheets = google.sheets({version:'v4', auth:new google.auth.GoogleAuth({credentials:cred, scopes:['https://www.googleapis.com/auth/spreadsheets']})})
const cal = google.calendar({version:'v3', auth:new google.auth.GoogleAuth({credentials:cred, scopes:['https://www.googleapis.com/auth/calendar']})})
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const CALENDAR_ID='5gc9hdvh4vi28bf8uemr2vfnn4@group.calendar.google.com'
const parseFecha=s=>{const p=String(s||'').split('/');if(p.length!==3)return null;const[d,m,y]=p;const yyyy=y.length===4?y:'20'+y;if(!d||!m||!y)return null;return `${yyyy}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`}

// 1) Presupuestos
const r = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID, range:'PRESUPUESTOS!A:AZ'})
const rows=r.data.values||[], H=rows[0]||[], I=n=>H.indexOf(n)
const iFE=I('Fecha Evento'),iTF=I('Tipo Fechas'),iFA=I('Fechas Adicionales'),iEst=I('Estado'),iCli=I('Cliente'),iProy=I('Proyecto'),iAg=I('Agencia')
const activos = rows.slice(1).map((row,i)=>({row,fila:i+2})).filter(({row})=>{
  const est=String(row[iEst]||'').toUpperCase().trim(); return (est==='APROBADO'||est==='EN ESPERA') && String(row[iFE]||'').trim()
})

// 2) Todos los eventos del Calendar (ventana amplia) → TODOS los de cada presu.
// Un trabajo de varias fechas tiene un evento por día: quedarse con el último daba
// "desincronizado" falso en todos los multifecha.
const map={}
let pageToken
do{
  const er=await cal.events.list({calendarId:CALENDAR_ID, timeMin:'2025-07-01T00:00:00Z', timeMax:'2028-01-01T00:00:00Z', singleEvents:true, maxResults:2500, pageToken})
  for(const e of (er.data.items||[])){
    const m=String(e.description||'').match(/\[SOMOS_MAGMA_PRESU:([^\]]+)\]/); if(!m) continue
    const k=m[1].trim(); (map[k]=map[k]||[]).push({start:e.start?.date||e.start?.dateTime?.slice(0,10)||'', end:e.end?.date||e.end?.dateTime?.slice(0,10)||'', summary:e.summary})
  }
  pageToken=er.data.nextPageToken
}while(pageToken)
const totalEv=Object.values(map).reduce((a,l)=>a+l.length,0)
console.log(`Escaneados: ${activos.length} presus activos (APROBADO/EN ESPERA) · ${totalEv} eventos con tag en el Calendar (${Object.keys(map).length} presus)\n`)

// Los días que el sheet dice que tiene que haber en el Calendar
const diasDelSheet=(fe,tipo,ad)=>{
  const f0=parseFecha(fe); if(!f0) return []
  const t=String(tipo||'').toLowerCase().trim(), adTxt=String(ad||'').trim()
  if(t==='rango'&&adTxt){ const f1=parseFecha(adTxt); if(!f1||f1<f0) return [f0]
    const out=[]; for(let d=new Date(f0+'T12:00:00Z'); d.toISOString().slice(0,10)<=f1; d.setUTCDate(d.getUTCDate()+1)) out.push(d.toISOString().slice(0,10)); return out }
  if((t==='multi'||t==='tentativa')&&adTxt) return [...new Set([f0,...adTxt.split('|').map(x=>parseFecha(x.trim())).filter(Boolean)])].sort()
  return [f0]
}

const invertidos=[], desync=[], sinEvento=[]
for(const {row,fila} of activos){
  const num=String(row[0]||'').trim()
  const feISO=parseFecha(row[iFE]), tipo=String(row[iTF]||'').toLowerCase().trim(), adICO=parseFecha(row[iFA])
  const quien=`#${num} · ${row[iCli]||''} / ${row[iProy]||''} · ${row[iEst]}`
  // (1) rango invertido en el sheet
  if((tipo==='rango'||tipo==='multi') && feISO && adICO && adICO<feISO) invertidos.push(`  ${quien}\n     sheet: ${row[iFE]} (${tipo}) → adic ${row[iFA]}  ⟵ el final es ANTES del inicio`)
  // (2) calendar
  const evs=map[num]||[]
  if(!evs.length){ sinEvento.push(`  ${quien} · Fecha ${row[iFE]}`) ; continue }
  const enCal=[...new Set(evs.map(e=>e.start))].sort()
  // Un rango o una tentativa son UN solo evento que abarca el bloque: alcanza con que arranque bien
  const unSoloBloque = tipo==='rango' || tipo==='tentativa'
  if(unSoloBloque){
    if(feISO && !enCal.includes(feISO)) desync.push(`  ${quien}\n     sheet dice: ${feISO} (${tipo})   ·   Calendar arranca: ${enCal.join(', ')}`)
    continue
  }
  const esperados=diasDelSheet(row[iFE],tipo,row[iFA])
  const faltan=esperados.filter(d=>!enCal.includes(d)), sobran=enCal.filter(d=>!esperados.includes(d))
  if(faltan.length||sobran.length) desync.push(`  ${quien}\n     sheet: ${esperados.join(', ')}\n     Calendar: ${enCal.join(', ')}${faltan.length?`\n     ⟵ faltan ${faltan.join(', ')}`:''}${sobran.length?`\n     ⟵ sobran ${sobran.join(', ')}`:''}`)
}

const bloque=(t,arr)=>{ console.log(`\n━━━ ${t}: ${arr.length} ━━━`); arr.forEach(x=>console.log(x)); if(!arr.length) console.log('  (ninguno)') }
bloque('🔴 RANGO INVERTIDO en el sheet (el bug directo)', invertidos)
bloque('🟠 CALENDAR DESINCRONIZADO (el evento muestra otra fecha)', desync)
bloque('⚪ Activos SIN evento en el Calendar (quizás nunca se agendó)', sinEvento)
