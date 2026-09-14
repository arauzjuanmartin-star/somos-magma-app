// Engancha a PROYECTOS las carpetas de ENTREGAS que el equipo creó a mano (sin la
// convención N°_fecha_nombre) para los proyectos que no tienen "Drive Entrega".
// Busca CLIENTE-o-AGENCIA / AÑO / carpeta cuyo nombre lleve el día del evento
// ("9 | 8/9 Visita…", "5 I 21 Galaxia"). Solo engancha si hay UNA candidata.
//
//   node scripts/drive-entregas-enganchar-viejas.mjs            → preview
//   node scripts/drive-entregas-enganchar-viejas.mjs --escribir
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const ESCRIBIR=process.argv.includes('--escribir')
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:[ESCRIBIR?'https://www.googleapis.com/auth/spreadsheets':'https://www.googleapis.com/auth/spreadsheets.readonly','https://www.googleapis.com/auth/drive.readonly']})
const sheets=google.sheets({version:'v4',auth}); const drive=google.drive({version:'v3',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const EN='0AK9Y6BbDhgekUk9PVA'
const t=v=>String(v??'').trim()
const clave=s=>t(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/^CR[_\s]*/,'').replace(/[^A-Z0-9]/g,'')
const colLetra=n=>{let s='';n++;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=(n-m-1)/26}return s}
// todas las carpetas de ENTREGAS con su padre
const todas=[]; let pageToken
do{ const r=await drive.files.list({q:`mimeType='application/vnd.google-apps.folder' and trashed=false`,driveId:EN,corpora:'drive',includeItemsFromAllDrives:true,supportsAllDrives:true,pageSize:1000,pageToken,fields:'nextPageToken,files(id,name,parents)'}); todas.push(...(r.data.files||[])); pageToken=r.data.nextPageToken }while(pageToken)
const porId=new Map(todas.map(f=>[f.id,f])); const hijosDe=id=>todas.filter(f=>f.parents?.[0]===id)
const raiz=todas.filter(f=>f.parents?.[0]===EN)
// índice: clave de carpeta (nivel 1 y 2) → carpeta
const nivel=new Map(); raiz.forEach(f=>{ nivel.set(clave(f.name),f); hijosDe(f.id).forEach(g=>{ if(!/^20\d\d$/.test(g.name)) nivel.set(clave(f.name)+'/'+clave(g.name),g) }) })
const P=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS!A:ZZ'})).data.values; const H=P[0]
const iN=H.indexOf('N° presupuesto'),iF=H.indexOf('Fecha Evento'),iE=H.indexOf('Drive Entrega'),iCl=H.indexOf('Cliente'),iAg=H.indexOf('Agencia'),iPr=H.indexOf('Proyecto')
const sin=P.map((row,i)=>({row,fila:i+1})).slice(1).filter(x=>t(x.row[iN])&&!t(x.row[iE])&&/\/2026$/.test(t(x.row[iF])))
const plan=[], varias=[], nada=[]
for(const x of sin){
  const r=x.row; const [d,m,y]=t(r[iF]).split('/').map(Number)
  const cli=clave(r[iCl]), ag=clave(r[iAg])
  // carpeta de cliente: AGENCIA/CLIENTE, o CLIENTE, o AGENCIA
  const cand=[nivel.get(ag+'/'+cli), nivel.get(cli), nivel.get(ag), ...[...nivel.entries()].filter(([k])=>k.split('/').pop().startsWith(cli)&&cli.length>=4).map(([,v])=>v)].filter(Boolean)
  const vistas=new Set(); const carpetasCli=cand.filter(c=>!vistas.has(c.id)&&vistas.add(c.id))
  if(!carpetasCli.length){ nada.push({...x,motivo:'sin carpeta de cliente'}); continue }
  // dentro: AÑO/proyecto o proyecto directo; el nombre lleva "d/m", "m | d", "m I d", "d de mes"
  const re=[new RegExp(`\\b${d}\\s*/\\s*${m}\\b`), new RegExp(`^\\s*${m}\\s*[|Iil]\\s*${d}\\b`), new RegExp(`\\b${d}\\s*[|Iil]\\s*${m}\\b`)]
  const proyectos=[]
  for(const c of carpetasCli){ for(const h of hijosDe(c.id)){ if(/^20\d\d$/.test(h.name)){ if(+h.name===y) proyectos.push(...hijosDe(h.id)) } else proyectos.push(h) } }
  const matchFecha=proyectos.filter(f=>re.some(x=>x.test(f.name)))
  // desempate por palabras del proyecto
  const palabras=t(r[iPr]).toLowerCase().split(/\W+/).filter(w=>w.length>=4)
  const conPalabra=matchFecha.filter(f=>palabras.some(w=>f.name.toLowerCase().includes(w)))
  const elegida = matchFecha.length===1 ? matchFecha[0] : conPalabra.length===1 ? conPalabra[0] : null
  if(elegida) plan.push({...x,carpeta:elegida,ruta:[porId.get(elegida.parents?.[0])?.name,elegida.name].filter(Boolean).join(' / ')})
  else if(matchFecha.length>1) varias.push({...x,opciones:matchFecha.map(f=>f.name)})
  else nada.push({...x,motivo:`sin carpeta con la fecha ${d}/${m} en ${carpetasCli.map(c=>c.name).join(', ')}`})
}
console.log(`PROYECTOS 2026 sin Drive Entrega: ${sin.length}\n  ✓ se pueden enganchar (una sola candidata): ${plan.length}\n  ? varias candidatas (a mano): ${varias.length}\n  ✗ sin carpeta que coincida: ${nada.length}`)
console.log('\nEjemplos que se enganchan:'); plan.slice(0,12).forEach(p=>console.log(`  #${t(p.row[iN])} ${t(p.row[iCl]).padEnd(18)} ${t(p.row[iF]).padEnd(11)} → ${p.ruta}`))
console.log('\nVarias candidatas:'); varias.slice(0,6).forEach(p=>console.log(`  #${t(p.row[iN])} ${t(p.row[iCl])} ${t(p.row[iF])}: ${p.opciones.join(' | ')}`))
const motivos={}; nada.forEach(n=>{const k=n.motivo.startsWith('sin carpeta de cliente')?'sin carpeta de cliente':'cliente sí, fecha no'; motivos[k]=(motivos[k]||0)+1}); console.log('\nSin match:',JSON.stringify(motivos))
console.log('  clientes sin carpeta:', [...new Set(nada.filter(n=>n.motivo.startsWith('sin carpeta de cliente')).map(n=>t(n.row[iCl])))].slice(0,25).join(', '))
if(!ESCRIBIR){ console.log('\n👀 PREVIEW — nada se escribió. Corré con --escribir.'); process.exit(0) }
const L=colLetra(iE)
const data=plan.map(p=>({range:`PROYECTOS!${L}${p.fila}`,values:[[`https://drive.google.com/drive/folders/${p.carpeta.id}`]]}))
for(let k=0;k<data.length;k+=200) await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data:data.slice(k,k+200)}})
console.log(`\n✅ ${plan.length} links de entrega escritos en PROYECTOS!${L}. Después correr proyectos-columna-drive-finales.mjs --escribir para el link de Finales/Fotos.`)
try{ await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',requestBody:{values:[[new Date().toISOString(),'script','drive-entregas-enganchar-viejas','PROYECTOS','',`${plan.length} carpetas viejas de ENTREGAS enganchadas`]]}}) }catch(e){}
