// Corrige PROYECTOS cuando su Fecha Evento quedó vieja respecto de PRESUPUESTOS
// (pasa cuando la fecha se edita a mano en el sheet: la app espeja, el sheet no).
// Uso:  node scripts/fix-fecha-desync.mjs 2011 [1989 ...]     (sin args = solo preview)
import {google} from 'googleapis'; import fs from 'fs'
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const s=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const MESES=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
const colLetra=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)}return s}
const norm=f=>{const p=String(f||'').trim().split('/'); return p.length<3?'':`${+p[0]}/${+p[1]}/${+p[2]}`}

const objetivos=process.argv.slice(2).map(x=>String(x).trim())
const r=await s.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PRESUPUESTOS!A:BE','PROYECTOS!A:CF']})
const [vpres,vproy]=r.data.valueRanges.map(v=>v.values||[])
const hPres=vpres[0], hProy=vproy[0]
const presByNum={}; vpres.slice(1).forEach(row=>{const n=String(row[0]||'').trim(); if(n) presByNum[n]={fecha:row[hPres.indexOf('Fecha Evento')]||''}})
const cN=hProy.indexOf('N° presupuesto'), cF=hProy.indexOf('Fecha Evento')

const updates=[]
vproy.slice(1).forEach((row,i)=>{
  const n=String(row[cN]||'').trim(); if(!n) return
  const pe=presByNum[n]; if(!pe) return
  const fProy=norm(row[cF]), fPres=norm(pe.fecha)
  if(!fProy||!fPres||fProy===fPres) return
  const fila=i+2, m=+String(pe.fecha).split('/')[1]
  const mesStr=(m>=1&&m<=12)?String(m).padStart(2,'0')+' - '+MESES[m-1]:null
  const aplica=objetivos.includes(n)
  console.log(`${aplica?'✍️ ':'   '}#${n} fila ${fila}  ${row[hProy.indexOf('Cliente')]||''} · ${row[hProy.indexOf('Proyecto')]||''}`)
  console.log(`      Fecha Evento: ${row[cF]}  →  ${pe.fecha}`)
  console.log(`      Mes:          ${row[0]}  →  ${mesStr}`)
  if(!aplica) return
  updates.push({range:`PROYECTOS!${colLetra(cF)}${fila}`, values:[[pe.fecha]]})
  if(mesStr) updates.push({range:`PROYECTOS!A${fila}`, values:[[mesStr]]})
})
if(!objetivos.length){ console.log('\n(preview — pasá los N° a corregir como argumentos)'); process.exit(0) }
if(!updates.length){ console.log('\nNada para escribir.'); process.exit(0) }
await s.spreadsheets.values.batchUpdate({spreadsheetId:ID, requestBody:{valueInputOption:'USER_ENTERED', data:updates}})
await s.spreadsheets.values.append({spreadsheetId:ID, range:'LOG!A:F', valueInputOption:'USER_ENTERED',
  requestBody:{values:[[new Date().toISOString(),'script','fix-fecha-desync','PROYECTOS',objetivos.join(','),'Fecha Evento + Mes resincronizados desde PRESUPUESTOS']]}})
console.log(`\n✅ ${updates.length} celdas actualizadas.`)
