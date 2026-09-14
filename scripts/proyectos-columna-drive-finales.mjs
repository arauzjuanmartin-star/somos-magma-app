// Agrega a PROYECTOS la columna "Drive Finales" (al final, después de "Fechas Staff")
// y la completa para los proyectos que ya tienen "Drive Entrega": busca adentro la
// subcarpeta Finales (o Fotos, en las carpetas viejas) y guarda su link.
//
// Por qué: "Drive Entrega" es la carpeta del proyecto, que tiene Pre-entregas adentro.
// Lo que se le manda al cliente es Finales. Con esta columna la app lo muestra a un
// clic en cada proyecto y el botón "Copiar link para el cliente" copia el correcto.
//
//   node scripts/proyectos-columna-drive-finales.mjs            → preview
//   node scripts/proyectos-columna-drive-finales.mjs --escribir
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const ESCRIBIR=process.argv.includes('--escribir')
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:[ESCRIBIR?'https://www.googleapis.com/auth/spreadsheets':'https://www.googleapis.com/auth/spreadsheets.readonly','https://www.googleapis.com/auth/drive.readonly']})
const sheets=google.sheets({version:'v4',auth}); const drive=google.drive({version:'v3',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const t=v=>String(v??'').trim()
const colLetra=n=>{let s='';n++;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=(n-m-1)/26}return s}
const HEADER='Drive Finales'
const meta=await sheets.spreadsheets.get({spreadsheetId:ID,ranges:['PROYECTOS'],fields:'sheets(properties(title,sheetId,gridProperties),basicFilter)'})
const hoja=meta.data.sheets.find(x=>x.properties.title==='PROYECTOS'); const sheetId=hoja.properties.sheetId
const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS!A:ZZ'})
const F=r.data.values||[], H=F[0]||[]
let iFin=H.indexOf(HEADER)
const iEnt=H.indexOf('Drive Entrega'), iNum=H.indexOf('N° presupuesto'), iCl=H.indexOf('Cliente')
if(iEnt<0){ console.error('No encuentro "Drive Entrega". Freno.'); process.exit(1) }
const destino = iFin>-1 ? iFin : H.length
console.log(`PROYECTOS · ${F.length-1} filas · ${H.length} columnas · última: ${colLetra(H.length-1)}:"${H[H.length-1]}" · ${HEADER}: ${iFin>-1?'ya existe en '+colLetra(iFin):'se agrega en '+colLetra(destino)}`)
if(hoja.properties.gridProperties.columnCount<=destino) console.log(`  (la grilla tiene ${hoja.properties.gridProperties.columnCount} columnas: se agranda)`)
// buscar Finales/Fotos adentro de cada carpeta de entrega
const plan=[]; let sinSub=0, yaTiene=0
for(let i=1;i<F.length;i++){
  const row=F[i]; const ent=t(row[iEnt]); if(!ent) continue
  if(iFin>-1 && t(row[iFin])){ yaTiene++; continue }
  const id=(ent.match(/folders\/([-\w]+)/)||[])[1]; if(!id) continue
  let kids=[]; try{ kids=(await drive.files.list({q:`'${id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,includeItemsFromAllDrives:true,supportsAllDrives:true,fields:'files(id,name)'})).data.files||[] }catch(e){ console.log(`  #${t(row[iNum])}: no pude leer la carpeta (${e.message.slice(0,50)})`); continue }
  const sub=kids.find(k=>/^finales$/i.test(k.name))||kids.find(k=>/^fotos$/i.test(k.name))
  if(!sub){ sinSub++; console.log(`  #${t(row[iNum])} ${t(row[iCl])}: sin Finales ni Fotos adentro (${kids.map(k=>k.name).join(', ')||'vacía'})`); continue }
  plan.push({fila:i+1,num:t(row[iNum]),cliente:t(row[iCl]),sub:sub.name,link:`https://drive.google.com/drive/folders/${sub.id}`})
}
console.log(`\n${plan.length} proyectos reciben ${HEADER} (${plan.filter(p=>/finales/i.test(p.sub)).length} Finales, ${plan.filter(p=>/fotos/i.test(p.sub)).length} Fotos) · ${sinSub} sin subcarpeta · ${yaTiene} ya lo tenían`)
plan.slice(0,8).forEach(p=>console.log(`  #${p.num} ${p.cliente.padEnd(18)} → ${p.sub}`))
if(!ESCRIBIR){ console.log('\n👀 PREVIEW — nada se escribió. Corré con --escribir.'); process.exit(0) }
const reqs=[]
if(hoja.properties.gridProperties.columnCount<=destino) reqs.push({appendDimension:{sheetId,dimension:'COLUMNS',length:destino-hoja.properties.gridProperties.columnCount+1}})
if(iFin<0){
  reqs.push({copyPaste:{source:{sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:iEnt,endColumnIndex:iEnt+1},destination:{sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:destino,endColumnIndex:destino+1},pasteType:'PASTE_FORMAT'}})
  reqs.push({updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:destino,endIndex:destino+1},properties:{pixelSize:160},fields:'pixelSize'}})
  if(hoja.basicFilter){ const bf=JSON.parse(JSON.stringify(hoja.basicFilter)); bf.range.endColumnIndex=Math.max(bf.range.endColumnIndex||0,destino+1); delete bf.criteria; delete bf.filterSpecs; reqs.push({setBasicFilter:{filter:bf}}) }
}
if(reqs.length) await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:reqs}})
const L=colLetra(destino)
const data=[{range:`PROYECTOS!${L}1`,values:[[HEADER]]}, ...plan.map(p=>({range:`PROYECTOS!${L}${p.fila}`,values:[[p.link]]}))]
for(let k=0;k<data.length;k+=200) await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data:data.slice(k,k+200)}})
// verificación: header en su lugar, links escritos, y una fila de control alineada
const v=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS!A:ZZ'}); const F2=v.data.values, H2=F2[0]
const j=H2.indexOf(HEADER); const con=F2.slice(1).filter(x=>t(x[j])).length
const ctrl=plan[0]; const c2=ctrl?F2[ctrl.fila-1]:null
console.log(`\n✓ "${HEADER}" en ${colLetra(j)} (esperado ${L}) · ${con} filas con link`)
if(ctrl) console.log(`✓ control: fila ${ctrl.fila} #${t(c2[iNum])} (esperado #${ctrl.num}) → ${t(c2[j])===ctrl.link?'link ok':'✗ link distinto'}`)
try{ await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',requestBody:{values:[[new Date().toISOString(),'script','proyectos-columna-drive-finales','PROYECTOS','',`columna ${L} + ${plan.length} links de Finales/Fotos`]]}}) }catch(e){}
