import { google } from 'googleapis'
import fs from 'fs'

const env = fs.readFileSync('.env.local','utf8')
const get = k => (env.match(new RegExp('^'+k+'=(.*)$','m'))||[])[1]?.replace(/^["']|["']$/g,'')
const auth = new google.auth.GoogleAuth({
  credentials: { client_email: get('GOOGLE_CLIENT_EMAIL'), private_key: get('GOOGLE_PRIVATE_KEY').replace(/\\n/g,'\n') },
  scopes: ['https://www.googleapis.com/auth/drive'],
})
const drive = google.drive({ version:'v3', auth })

const DRIVES = {
  'ADMINISTRACION (facturas)': '0AHMUebE7UIa_Uk9PVA',
  'CRUDO (material)': '0ALsTwjw6_Zc1Uk9PVA',
}

for (const [nombre, id] of Object.entries(DRIVES)) {
  console.log('\n=== ' + nombre + ' — ' + id)
  try {
    const d = await drive.drives.get({ driveId: id, fields: 'name' })
    console.log('   nombre real:', d.data.name)
    const p = await drive.permissions.list({
      fileId: id, supportsAllDrives: true, useDomainAdminAccess: false,
      fields: 'permissions(id,type,role,emailAddress,domain)',
    })
    for (const x of p.data.permissions) {
      console.log(`   ${(x.role||'').padEnd(12)} ${x.emailAddress || x.domain || x.type}`)
    }
    const admin = p.data.permissions.find(x => (x.emailAddress||'').toLowerCase() === 'admin@somosmagma.com')
    console.log('   >> admin@somosmagma.com:', admin ? 'SI, rol ' + admin.role : 'NO TIENE ACCESO')
  } catch (e) {
    console.log('   ERROR:', e.message)
  }
}
