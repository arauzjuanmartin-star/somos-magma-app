import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const ID = process.argv[2] || '1JVj5PPNlta0sdlpR7xCKvdPIYh63yCgJRn-0ZJgIXg4'
const KEY = env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')
const EMAIL = env.GOOGLE_CLIENT_EMAIL

async function tryExport(subject){
  const auth = new google.auth.JWT({ email:EMAIL, key:KEY, scopes:['https://www.googleapis.com/auth/drive.readonly'], subject })
  const drive = google.drive({version:'v3', auth})
  const meta = await drive.files.get({fileId:ID, fields:'name,mimeType', supportsAllDrives:true})
  const res = await drive.files.export({fileId:ID, mimeType:'text/plain'}, {responseType:'text'})
  return {name:meta.data.name, text:res.data}
}

let r
try { r = await tryExport(undefined); console.error('[ok] acceso directo del service account') }
catch(e1){
  console.error('[..] directo falló:', e1.message?.slice(0,80))
  try { r = await tryExport('juan@somosmagma.com'); console.error('[ok] impersonando juan@somosmagma.com') }
  catch(e2){ console.error('[x] impersonación falló:', e2.message?.slice(0,120)); process.exit(1) }
}
console.log(`\n===== ${r.name} =====\n`)
console.log(r.text)
