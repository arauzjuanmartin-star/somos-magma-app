/**
 * Lista lo que hay en una carpeta de Drive. Uso: node scripts/drive-listar-carpeta.mjs <folderId>
 * Prueba con el service account directo y, si falla, impersonando juan@somosmagma.com.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const FOLDER = process.argv[2]
const KEY = env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n'), EMAIL = env.GOOGLE_CLIENT_EMAIL

async function listar(subject){
  const auth = new google.auth.JWT({ email:EMAIL, key:KEY, scopes:['https://www.googleapis.com/auth/drive.readonly'], subject })
  const drive = google.drive({version:'v3', auth})
  const meta = await drive.files.get({fileId:FOLDER, fields:'name,mimeType,owners(emailAddress)', supportsAllDrives:true})
  const out=[]; let token
  do{
    const r = await drive.files.list({ q:`'${FOLDER}' in parents and trashed=false`,
      fields:'nextPageToken, files(id,name,mimeType,modifiedTime,size,webViewLink)',
      orderBy:'modifiedTime desc', pageSize:200, pageToken:token,
      supportsAllDrives:true, includeItemsFromAllDrives:true })
    out.push(...(r.data.files||[])); token=r.data.nextPageToken
  } while(token)
  return {meta:meta.data, files:out}
}

let r
try { r = await listar(undefined); console.error('[ok] service account directo') }
catch(e1){ console.error('[..] directo falló:', e1.message?.slice(0,90))
  try { r = await listar('juan@somosmagma.com'); console.error('[ok] impersonando juan@somosmagma.com') }
  catch(e2){ console.error('[x] impersonación falló:', e2.message?.slice(0,140)); process.exit(1) } }

console.log(`\n===== ${r.meta.name} (${r.files.length} items) =====\n`)
r.files.forEach(f=>{
  const tipo = f.mimeType.replace('application/vnd.google-apps.','G:').replace('application/','')
  console.log(`${(f.modifiedTime||'').slice(0,10)}  ${tipo.padEnd(28)} ${f.name}`)
  console.log(`            ${f.id}`)
})
