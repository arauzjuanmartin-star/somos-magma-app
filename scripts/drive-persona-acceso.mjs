// Qué poder tiene UNA persona en todo el Drive de Magma.
//
// Para qué: antes y después de cambiarle el acceso a alguien, saber en qué
// unidades está, con qué rol, y si además tiene permisos sueltos sobre carpetas
// (bajarle el rol de la unidad no alcanza si tiene uno directo en una carpeta).
//
//   node scripts/drive-persona-acceso.mjs dani@somosmagma.com
//   node scripts/drive-persona-acceso.mjs dani@somosmagma.com --carpetas   (escanea las ~6800 carpetas, tarda ~1 min)
//
// Solo lee. Cambiar un rol hay que hacerlo a mano en Drive: la cuenta de
// servicio es Gestor, no Administrador, así que no puede tocar miembros.

import { google } from 'googleapis'
import { readFileSync } from 'fs'

const MAIL = (process.argv[2] || '').toLowerCase()
const CARPETAS = process.argv.includes('--carpetas')
if (!MAIL) {
  console.log('Uso: node scripts/drive-persona-acceso.mjs <mail> [--carpetas]')
  process.exit(1)
}

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim()
  if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1)
  return [l.slice(0,i).trim(), v]
}))
const auth = new google.auth.GoogleAuth({
  credentials:{ client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') },
  scopes:['https://www.googleapis.com/auth/drive'],
})
const drive = google.drive({ version:'v3', auth })

// Lo que importa no es el nombre del rol, es si puede hacer desaparecer algo.
const PODER = {
  organizer:     { txt: 'Administrador — BORRA DEFINITIVO y maneja gente', borra: true },
  fileOrganizer: { txt: 'Gestor — manda a PAPELERA, mueve y renombra',      borra: true },
  writer:        { txt: 'Colaborador — sube y edita, NO borra',             borra: false },
  commenter:     { txt: 'Comenta',                                          borra: false },
  reader:        { txt: 'Solo mira',                                        borra: false },
}

const ds = await drive.drives.list({ pageSize: 100, fields: 'drives(id,name)' })
const drives = ds.data.drives || []

console.log(`\n════ ${MAIL} ════\n`)
let puedeBorrar = 0
const grupos = []

for (const d of drives) {
  const r = await drive.permissions.list({
    fileId: d.id, supportsAllDrives: true,
    fields: 'permissions(id,type,role,emailAddress,displayName)',
  })
  const perms = r.data.permissions || []
  const p = perms.find(x => String(x.emailAddress||'').toLowerCase() === MAIL)
  const poder = p ? (PODER[p.role] || { txt: p.role, borra: true }) : null
  if (poder?.borra) puedeBorrar++
  console.log(`  ${d.name.padEnd(38)} ${p ? poder.txt : '— no está'}`)
  // Los grupos con poder son la puerta de atrás: Google aplica el rol MÁS ALTO
  // entre todos los permisos, así que estar en un grupo Gestor le devuelve la
  // papelera aunque su permiso directo sea Colaborador.
  perms.filter(x => x.type === 'group' && (PODER[x.role]||{}).borra)
       .forEach(x => grupos.push(`${x.emailAddress} (${x.role}) en ${d.name}`))
}

if (CARPETAS) {
  console.log('\n  Escaneando carpetas por permisos sueltos…')
  let n = 0, sueltos = 0
  for (const d of drives) {
    let pageToken = null
    do {
      const r = await drive.files.list({
        corpora:'drive', driveId:d.id, includeItemsFromAllDrives:true, supportsAllDrives:true,
        q:"mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields:'nextPageToken,files(id,name,permissions(emailAddress,role,permissionDetails))',
        pageSize:200, pageToken,
      })
      for (const f of r.data.files || []) {
        n++
        const p = (f.permissions||[]).find(x => String(x.emailAddress||'').toLowerCase() === MAIL)
        if (p && p.permissionDetails?.[0]?.inherited === false) {
          sueltos++
          console.log(`    ⚠️ DIRECTO en ${d.name} / ${f.name} → ${p.role}  (${f.id})`)
        }
      }
      pageToken = r.data.nextPageToken
    } while (pageToken)
  }
  console.log(`  ${n} carpetas revisadas · permisos sueltos: ${sueltos}`)
}

console.log('')
if (puedeBorrar) {
  console.log(`  ⚠️  PUEDE BORRAR en ${puedeBorrar} unidad(es).`)
} else {
  console.log('  ✅ No puede borrar ni mandar a papelera en ninguna unidad.')
}
if (grupos.length) {
  console.log('\n  Ojo con los grupos (sus miembros NO se ven por API — mirar en admin.google.com/ac/groups):')
  ;[...new Set(grupos)].forEach(g => console.log(`    · ${g}`))
}
