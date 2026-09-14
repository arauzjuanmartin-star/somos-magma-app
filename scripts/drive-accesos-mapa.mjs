// El mapa completo de quién puede qué en TODAS las unidades de Magma, por persona.
//
// Para qué: los accesos se dieron de a uno y nadie los revisó nunca. Esto los
// ordena POR PERSONA (no por unidad), que es como se limpian: una fila = un
// mail = todos los clics que hay que hacerle.
//
//   node scripts/drive-accesos-mapa.mjs
//
// Solo lee. Bajar un rol hay que hacerlo a mano: la cuenta de servicio es
// Gestor, no Administrador (canManageMembers=false en las 7 unidades).

import { google } from 'googleapis'
import { readFileSync } from 'fs'

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

// Lo que importa no es el nombre del rol: es si puede hacer desaparecer algo.
const SIGLA = { organizer:'ADMIN', fileOrganizer:'gestor', writer:'colab', commenter:'coment', reader:'mira' }
const BORRA = { organizer:'definitivo', fileOrganizer:'papelera' }

const esDeCasa = m => /@somosmagma\.com$/i.test(m)
const esRobot  = m => /gserviceaccount\.com$/i.test(m)

const ds = await drive.drives.list({ pageSize: 100, fields: 'drives(id,name)' })
const drives = (ds.data.drives || []).sort((a,b)=>a.name.localeCompare(b.name))
const gente = new Map()

for (const d of drives) {
  const r = await drive.permissions.list({
    fileId: d.id, supportsAllDrives: true,
    fields: 'permissions(id,type,role,emailAddress,displayName)',
  })
  for (const p of r.data.permissions || []) {
    const mail = String(p.emailAddress || p.displayName || '(sin mail)').toLowerCase()
    if (!gente.has(mail)) gente.set(mail, { tipo: p.type, en: {} })
    gente.get(mail).en[d.name] = p.role
  }
}

// Primero los que más poder tienen, y dentro de eso las cuentas personales arriba:
// son las que no se pueden dar de baja desde el admin de Workspace.
const peso = r => ({ organizer:4, fileOrganizer:3, writer:2, commenter:1, reader:0 }[r] ?? 0)
const filas = [...gente.entries()].map(([mail, g]) => {
  const roles = Object.values(g.en)
  return {
    mail, ...g,
    max: Math.max(...roles.map(peso)),
    unidades: Object.entries(g.en).sort((a,b)=>peso(b[1])-peso(a[1])),
    personal: !esDeCasa(mail) && !esRobot(mail) && g.tipo !== 'group',
  }
}).sort((a,b) => b.max - a.max || (b.personal - a.personal) || a.mail.localeCompare(b.mail))

const corto = n => n.replace(' CLIENTES MAGMA (compartidas con clientes)','')

console.log(`\n════ ACCESOS A DRIVE · ${filas.length} cuentas en ${drives.length} unidades ════\n`)
for (const f of filas) {
  const et = f.tipo === 'group' ? ' 👥 GRUPO' : f.personal ? ' ⚠️ CUENTA PERSONAL' : esRobot(f.mail) ? ' 🤖' : ''
  const borra = [...new Set(f.unidades.map(([,r]) => BORRA[r]).filter(Boolean))]
  console.log(`${f.mail}${et}`)
  console.log(`   ${f.unidades.map(([n,r]) => `${corto(n)}:${SIGLA[r]||r}`).join(' · ')}`)
  if (borra.length) console.log(`   → puede borrar: ${borra.join(' + ')}`)
  console.log('')
}

// La misma persona con la cuenta de Magma Y su Gmail: el Gmail es el que sobra.
const dominios = new Map()
for (const f of filas.filter(x => x.tipo !== 'group' && !esRobot(x.mail))) {
  const base = f.mail.split('@')[0].replace(/[^a-z]/g,'')
  for (const otro of filas) {
    if (otro.mail === f.mail || otro.tipo === 'group') continue
    const b2 = otro.mail.split('@')[0].replace(/[^a-z]/g,'')
    if (esDeCasa(f.mail) && !esDeCasa(otro.mail) && (b2.includes(base) || base.includes(b2)) && base.length > 2) {
      dominios.set(otro.mail, f.mail)
    }
  }
}
if (dominios.size) {
  console.log('──── Misma persona, dos cuentas (sobra la personal) ────')
  for (const [personal, casa] of dominios) console.log(`   ${personal}  ya tiene  ${casa}`)
}
