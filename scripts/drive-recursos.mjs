// La carpeta "Recursos" de cada agencia y de cada cliente en ENTREGAS CLIENTES:
// ahí van el logo, la gráfica y todo lo general que sirve para cualquier trabajo.
// Juan, 14/9/2026: "dentro de Ostara una carpeta Recursos con lo general, y
// después dentro de cada cliente lo mismo". El equipo ya lo hacía a mano en
// algunos (CMQ/Recursos, MANI KING/RECURSOS, Oir/Unilever/Recursos).
//
// Solo para agencias y clientes con proyectos en 2026 que YA tienen carpeta;
// no inventa carpetas de agencia ni de cliente (eso lo hace el flujo de aprobar).
// Guarda el link en AGENCIAS y CLIENTES, columna "Drive Recursos" (la crea si falta).
//
//   node scripts/drive-recursos.mjs            → preview
//   node scripts/drive-recursos.mjs --escribir
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const ESCRIBIR=process.argv.includes('--escribir')
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:ESCRIBIR?['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/drive']:['https://www.googleapis.com/auth/spreadsheets.readonly','https://www.googleapis.com/auth/drive.readonly']})
const sheets=google.sheets({version:'v4',auth}); const drive=google.drive({version:'v3',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'; const EN='0AK9Y6BbDhgekUk9PVA'
const HEADER='Drive Recursos'
const t=v=>String(v??'').trim(); const clave=s=>t(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/^CR[_\s]*/,'').replace(/[^A-Z0-9]/g,'')
const colLetra=n=>{let s='';n++;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=(n-m-1)/26}return s}
const link=id=>`https://drive.google.com/drive/folders/${id}`
const todas=[]; let pageToken; do{ const r=await drive.files.list({q:`mimeType='application/vnd.google-apps.folder' and trashed=false`,driveId:EN,corpora:'drive',includeItemsFromAllDrives:true,supportsAllDrives:true,pageSize:1000,pageToken,fields:'nextPageToken,files(id,name,parents)'}); todas.push(...(r.data.files||[])); pageToken=r.data.nextPageToken }while(pageToken)
const hijos=id=>todas.filter(f=>f.parents?.[0]===id); const raiz=hijos(EN)
const recursosEn=id=>hijos(id).find(f=>/^recursos$/i.test(f.name))
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS!A:EW','AGENCIAS!A:Z','CLIENTES!A:Z']})
const [P,AG,CL]=R.data.valueRanges.map(v=>v.values||[]); const h=P[0]
const iN=h.indexOf('N° presupuesto'),iF=h.indexOf('Fecha Evento'),iAg=h.indexOf('Agencia'),iCl=h.indexOf('Cliente')
const y26=P.slice(1).filter(r=>t(r[iN])&&/\/2026$/.test(t(r[iF])))
const ags=new Map(), clis=new Map()
y26.forEach(r=>{ const a=t(r[iAg]), c=t(r[iCl]); if(a) ags.set(clave(a),{nombre:a}); if(c){ const e=clis.get(clave(c))||{nombre:c,ags:new Set()}; if(a) e.ags.add(clave(a)); clis.set(clave(c),e) } })
const enRaiz=new Map(raiz.map(f=>[clave(f.name),f]))
const plan=[]   // {tipo:'agencia'|'cliente', nombre, carpeta, recursos(existente)|null}
for (const [k,a] of ags){ const c=enRaiz.get(k); if(!c) continue; plan.push({tipo:'agencia',nombre:a.nombre,carpeta:c,recursos:recursosEn(c.id)}) }
for (const [k,c] of clis){
  // carpeta del cliente: bajo su agencia si existe, si no en la raíz
  let carpeta=null
  for (const ak of c.ags){ const a=enRaiz.get(ak); if(a){ const x=hijos(a.id).find(f=>clave(f.name)===k); if(x){ carpeta=x; break } } }
  if(!carpeta) carpeta=enRaiz.get(k)||null
  if(!carpeta) continue
  plan.push({tipo:'cliente',nombre:c.nombre,carpeta,recursos:recursosEn(carpeta.id)})
}
const crear=plan.filter(p=>!p.recursos), ya=plan.filter(p=>p.recursos)
console.log(`Agencias 2026 con carpeta: ${plan.filter(p=>p.tipo==='agencia').length} · Clientes 2026 con carpeta: ${plan.filter(p=>p.tipo==='cliente').length}`)
console.log(`  Recursos a crear: ${crear.length} (${crear.filter(p=>p.tipo==='agencia').length} de agencia + ${crear.filter(p=>p.tipo==='cliente').length} de cliente) · ya existían: ${ya.length} (${ya.map(p=>p.nombre).join(', ')})`)
crear.slice(0,10).forEach(p=>console.log(`   + ${p.tipo.padEnd(7)} ${p.nombre.padEnd(22)} → ${p.carpeta.name}/Recursos`))
if(crear.length>10) console.log(`   … y ${crear.length-10} más`)
// columnas en AGENCIAS / CLIENTES
const meta=await sheets.spreadsheets.get({spreadsheetId:ID,ranges:['AGENCIAS','CLIENTES'],fields:'sheets(properties(title,sheetId,gridProperties(columnCount)),basicFilter,tables(tableId,name,range))'})
const info={}
for (const [hoja,rows] of [['AGENCIAS',AG],['CLIENTES',CL]]){ const H=rows[0]||[]; const i=H.indexOf(HEADER); info[hoja]={H,i,destino:i>-1?i:H.length,rows}; console.log(`  ${hoja}: "${HEADER}" ${i>-1?'ya está en '+colLetra(i):'se agrega en '+colLetra(H.length)}`) }
if(!ESCRIBIR){ console.log('\n👀 PREVIEW — nada se escribió. Corré con --escribir.'); process.exit(0) }
// 1. carpetas
for (const p of crear){ const r=await drive.files.create({requestBody:{name:'Recursos',mimeType:'application/vnd.google-apps.folder',parents:[p.carpeta.id]},fields:'id,name',supportsAllDrives:true}); p.recursos=r.data }
// 2. columnas + links
for (const hoja of ['AGENCIAS','CLIENTES']){
  const {H,i,destino,rows}=info[hoja]; const s=meta.data.sheets.find(x=>x.properties.title===hoja); const sheetId=s.properties.sheetId
  if(i<0){
    const reqs=[]
    if(s.properties.gridProperties.columnCount<=destino) reqs.push({appendDimension:{sheetId,dimension:'COLUMNS',length:destino-s.properties.gridProperties.columnCount+1}})
    reqs.push({copyPaste:{source:{sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:1},destination:{sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:destino,endColumnIndex:destino+1},pasteType:'PASTE_FORMAT'}})
    reqs.push({updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:destino,endIndex:destino+1},properties:{pixelSize:160},fields:'pixelSize'}})
    const tabla=(s.tables||[]).find(x=>x.tableId===s.basicFilter?.tableId)
    if(s.basicFilter?.tableId&&tabla) reqs.push({updateTable:{table:{tableId:tabla.tableId,range:{...tabla.range,endColumnIndex:Math.max(tabla.range.endColumnIndex||0,destino+1)}},fields:'range'}})
    else if(s.basicFilter){ const bf=JSON.parse(JSON.stringify(s.basicFilter)); bf.range.endColumnIndex=Math.max(bf.range.endColumnIndex||0,destino+1); delete bf.criteria; delete bf.filterSpecs; reqs.push({setBasicFilter:{filter:bf}}) }
    await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:reqs}})
  }
  const L=colLetra(destino); const data=i<0?[{range:`${hoja}!${L}1`,values:[[HEADER]]}]:[]
  const tipo=hoja==='AGENCIAS'?'agencia':'cliente'; let n=0, sinFila=[]
  for (const p of plan.filter(x=>x.tipo===tipo)){
    const fi=rows.findIndex((r,k)=>k>0&&clave(r[0])===clave(p.nombre))
    if(fi<0){ sinFila.push(p.nombre); continue }
    if(t(rows[fi][destino])) continue
    data.push({range:`${hoja}!${L}${fi+1}`,values:[[link(p.recursos.id)]]}); n++
  }
  if(data.length) await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data}})
  console.log(`✓ ${hoja}: ${n} links en ${L}${sinFila.length?` · sin fila en la solapa (no se guardó el link): ${sinFila.join(', ')}`:''}`)
}
console.log(`✓ ${crear.length} carpetas Recursos creadas`)
try{ await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',requestBody:{values:[[new Date().toISOString(),'script','drive-recursos','AGENCIAS+CLIENTES+DRIVE','',`${crear.length} carpetas Recursos + links en ${HEADER}`]]}}) }catch(e){}
