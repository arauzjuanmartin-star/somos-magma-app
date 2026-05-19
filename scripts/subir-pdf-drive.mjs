import { google } from 'googleapis'
import { readFileSync, createReadStream } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
    const i=l.indexOf('='); let v=l.slice(i+1).trim()
    if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1)
    return [l.slice(0,i).trim(),v]
  })
)
const auth = new google.auth.GoogleAuth({
  credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},
  scopes:['https://www.googleapis.com/auth/drive']
})
const drive = google.drive({version:'v3',auth})

const FILE_PATH = process.argv[2] || '/tmp/presu-muestra-1871.pdf'
const FILE_NAME = process.argv[3] || 'PROPUESTA-presu-pdf-nuevo-muestra-1871.pdf'

// Subir al root del drive del service account, después le damos permiso a Juan
// Subir DENTRO de la carpeta de Branding compartida (donde el service account tiene editor)
const PARENT = process.argv[4] || '1iOOFU8DHaQIiAMM-XjKGXMM3mzqZ4Acc'
const r = await drive.files.create({
  requestBody: { name: FILE_NAME, mimeType: 'application/pdf', parents: [PARENT] },
  media: { mimeType: 'application/pdf', body: createReadStream(FILE_PATH) },
  fields: 'id,name,webViewLink',
  supportsAllDrives: true,
})
console.log('✓ Subido:', r.data.name, 'id:', r.data.id)

// Compartir con Juan como reader
await drive.permissions.create({
  fileId: r.data.id,
  requestBody: { type: 'user', role: 'reader', emailAddress: 'arauzjuanmartin@gmail.com' },
  sendNotificationEmail: false,
  supportsAllDrives: true,
})
console.log('✓ Compartido con arauzjuanmartin@gmail.com')

// Hacer cualquier-persona-con-link viewer para que se abra desde acá
await drive.permissions.create({
  fileId: r.data.id,
  requestBody: { type: 'anyone', role: 'reader' },
  supportsAllDrives: true,
})

const refreshed = await drive.files.get({ fileId: r.data.id, fields: 'webViewLink,webContentLink' })
console.log('\n📄 LINK para ver:', refreshed.data.webViewLink)
console.log('⬇  Descargar:', refreshed.data.webContentLink)
