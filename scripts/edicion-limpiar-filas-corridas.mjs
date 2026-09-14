// Borra de EDICION las filas que el sync escribió CORRIDAS de columna (14/9/2026):
// el `values.append` de Sheets detectó mal la tabla y pegó el ID en la columna
// "Actualizado" (AJ) en vez de en A. Esas filas no tienen ID ni N° presupuesto en
// su lugar, así que la app no las puede editar ni reconocer — son basura pura.
// También saca las filas totalmente vacías, que rompen la detección de la tabla.
//
// Preview por default. `--escribir` para borrar de verdad.
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const ESCRIBIR = process.argv.includes('--escribir')
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:[ESCRIBIR?'https://www.googleapis.com/auth/spreadsheets':'https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'EDICION!A:BZ'})
const rows=r.data.values||[]; const h=rows[0]
const iID=h.indexOf('ID'), iNum=h.indexOf('N° presupuesto')
const corridas=[], vacias=[], raras=[]
rows.slice(1).forEach((row,i)=>{
  const fila=i+2
  const conAlgo=row.some(v=>txt(v))
  if(!conAlgo){ vacias.push(fila); return }
  if(txt(row[iID])||txt(row[iNum])) return           // fila normal
  // sin ID y sin N° en su lugar: ¿es una corrida? el ID tiene que estar en alguna columna de la derecha
  const j=row.findIndex(v=>/^\d{3,5}-(\d+|M\d+)$/.test(txt(v)))
  if(j>=1) corridas.push({fila, id:txt(row[j]), corrimiento:j, num:txt(row[j+1]), cliente:txt(row[j+4])})
  else raras.push({fila, celdas:row.map((v,k)=>txt(v)?`${h[k]||'col'+k}=${txt(v).slice(0,25)}`:null).filter(Boolean).slice(0,6)})
})
console.log(`EDICION: ${rows.length-1} filas · ${h.length} columnas`)
console.log(`\n${corridas.length} filas CORRIDAS (ID fuera de lugar):`)
const porId={}; corridas.forEach(c=>{porId[c.id]=(porId[c.id]||0)+1})
console.log('  corrimientos:', [...new Set(corridas.map(c=>c.corrimiento))].join(','), '· IDs distintos:', Object.keys(porId).length, '· repetidos:', Object.entries(porId).filter(([,n])=>n>1).map(([k,n])=>`${k}×${n}`).slice(0,8).join(' '), '…')
console.log('  filas:', corridas.map(c=>c.fila).join(','))
console.log(`\n${vacias.length} filas VACÍAS:`, vacias.join(','))
console.log(`\n${raras.length} filas sin ID/N° que NO parecen corridas (se dejan):`); raras.forEach(x=>console.log(`  fila ${x.fila}: ${x.celdas.join(' | ')}`))
const borrar=[...corridas.map(c=>c.fila), ...vacias].sort((a,b)=>b-a)
console.log(`\n→ se borrarían ${borrar.length} filas; quedan ${rows.length-1-borrar.length} filas de datos`)
if(!ESCRIBIR){ console.log('\n👀 PREVIEW — nada se escribió. Corré con --escribir.'); process.exit(0) }
const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties(title,sheetId))'})
const sid=meta.data.sheets.find(x=>x.properties.title==='EDICION').properties.sheetId
// de abajo hacia arriba, para que los índices no se corran
const requests=borrar.map(f=>({deleteDimension:{range:{sheetId:sid,dimension:'ROWS',startIndex:f-1,endIndex:f}}}))
for(let k=0;k<requests.length;k+=100){ await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:requests.slice(k,k+100)}}) }
const r2=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'EDICION!A:BZ'})
const rows2=r2.data.values||[]
const quedan=rows2.slice(1).filter(row=>row.some(v=>txt(v))&&!txt(row[iID])&&!txt(row[iNum])).length
console.log(`\n✅ Borradas ${borrar.length}. Ahora: ${rows2.length-1} filas, ${quedan} sin ID/N° (esperado: 0), ${rows2.slice(1).filter(row=>!row.some(v=>txt(v))).length} vacías (esperado: 0).`)
try{ await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',requestBody:{values:[[new Date().toISOString(),'script','edicion-limpiar-filas-corridas','EDICION','',`${corridas.length} corridas + ${vacias.length} vacías borradas`]]}}) }catch(e){}
