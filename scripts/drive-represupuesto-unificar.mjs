// Represupuestar creaba una carpeta NUEVA y vacía al lado de la que ya tenía el
// material (Farmacity #2293 → #2302, 14/9/2026: "2302_…" vacía junto a "2293_…"
// con 546 videos). Este script deja UNA: renombra la carpeta con material al
// número nuevo, manda a la papelera la vacía y apunta PROYECTOS a la buena.
//
//   node scripts/drive-represupuesto-unificar.mjs <viejo> <nuevo> [--escribir]
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const [VIEJO, NUEVO] = process.argv.slice(2).filter(a=>!a.startsWith('--'))
const ESCRIBIR = process.argv.includes('--escribir')
if (!VIEJO || !NUEVO) { console.log('uso: node scripts/drive-represupuesto-unificar.mjs <viejo> <nuevo> [--escribir]'); process.exit(1) }
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/drive']})
const sheets=google.sheets({version:'v4',auth}); const drive=google.drive({version:'v3',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const colLetra=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)}return s}
async function cuantos(id){ const r=await drive.files.list({q:`'${id}' in parents and trashed=false`,includeItemsFromAllDrives:true,supportsAllDrives:true,fields:'files(id,mimeType)',pageSize:1000}); let n=0; for(const f of r.data.files||[]){ n+= f.mimeType.includes('folder') ? await cuantos(f.id) : 1 } return n }
const P=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS!A:ET'})).data.values||[]; const h=P[0]
const iNum=h.indexOf('N° presupuesto'), iCr=h.indexOf('Drive Crudo'), iEn=h.indexOf('Drive Entrega')
const fi=P.findIndex((r,i)=>i>0&&txt(r[iNum])===NUEVO); if(fi<0){ console.log(`✗ #${NUEVO} no está en PROYECTOS`); process.exit(1) }
const plan=[], data=[]
for (const [nom,driveId,iCol] of [['CRUDO','0ALsTwjw6_Zc1Uk9PVA',iCr],['ENTREGAS','0AK9Y6BbDhgekUk9PVA',iEn]]) {
  const q=await drive.files.list({q:`(name contains '${VIEJO}_' or name contains '${NUEVO}_') and mimeType='application/vnd.google-apps.folder' and trashed=false`,driveId,corpora:'drive',includeItemsFromAllDrives:true,supportsAllDrives:true,fields:'files(id,name,parents)'})
  const vieja=(q.data.files||[]).find(f=>f.name.startsWith(VIEJO+'_')), nueva=(q.data.files||[]).find(f=>f.name.startsWith(NUEVO+'_'))
  if(!vieja){ console.log(`${nom}: no hay carpeta ${VIEJO}_… — nada que unificar`); continue }
  const nV=await cuantos(vieja.id), nN=nueva?await cuantos(nueva.id):0
  const nombreNuevo = nueva ? nueva.name : vieja.name.replace(new RegExp('^'+VIEJO+'_'), NUEVO+'_')
  console.log(`${nom}:\n   vieja  ${vieja.name}  → ${nV} archivos\n   nueva  ${nueva?nueva.name:'(no existe)'}  → ${nN} archivos`)
  if (nueva && nN>0) { console.log(`   ✗ la nueva NO está vacía: no toco nada acá, mirarlo a mano`); continue }
  if (nueva && vieja.parents?.[0]!==nueva.parents?.[0]) { console.log(`   ✗ están en carpetas madre distintas: mirarlo a mano`); continue }
  plan.push({nom, renombrar:{id:vieja.id, de:vieja.name, a:nombreNuevo}, papelera: nueva?{id:nueva.id,name:nueva.name}:null})
  data.push({ range:`PROYECTOS!${colLetra(iCol)}${fi+1}`, values:[[`https://drive.google.com/drive/folders/${vieja.id}`]] })
  console.log(`   → renombrar "${vieja.name}" a "${nombreNuevo}"${nueva?` · papelera "${nueva.name}" (vacía)`:''} · PROYECTOS #${NUEVO} ${h[iCol]} = link de la vieja (id ${vieja.id})`)
}
if(!plan.length){ console.log('\nNada para hacer.'); process.exit(0) }
if(!ESCRIBIR){ console.log('\n👀 PREVIEW — nada se escribió. Corré con --escribir.'); process.exit(0) }
for (const p of plan) {
  await drive.files.update({fileId:p.renombrar.id,requestBody:{name:p.renombrar.a},supportsAllDrives:true})
  if (p.papelera) await drive.files.update({fileId:p.papelera.id,requestBody:{trashed:true},supportsAllDrives:true})
}
await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data}})
try{ await sheets.spreadsheets.values.append({spreadsheetId:ID,range:'LOG!A:F',valueInputOption:'USER_ENTERED',requestBody:{values:[[new Date().toISOString(),'script','drive-represupuesto-unificar','PROYECTOS+DRIVE',NUEVO,plan.map(p=>`${p.nom}: ${p.renombrar.de} → ${p.renombrar.a}${p.papelera?' · vacía a papelera':''}`).join(' | ')]]}}) }catch(e){}
// verificar
for (const p of plan) { const g=await drive.files.get({fileId:p.renombrar.id,fields:'name,trashed',supportsAllDrives:true}); const t=p.papelera?await drive.files.get({fileId:p.papelera.id,fields:'name,trashed',supportsAllDrives:true}):null; console.log(`✓ ${p.nom}: "${g.data.name}" (trashed=${g.data.trashed})${t?` · "${t.data.name}" trashed=${t.data.trashed}`:''}`) }
const P2=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:`PROYECTOS!A${fi+1}:ET${fi+1}`})).data.values[0]
console.log(`✓ PROYECTOS #${NUEVO}: Drive Crudo=${txt(P2[iCr])} · Drive Entrega=${txt(P2[iEn])}`)
