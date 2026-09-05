// Quién tiene acceso a las unidades compartidas de Magma, y con qué poder.
//
// Para qué: el acceso al crudo se fue dando de a uno y nadie lo volvió a mirar.
// Este script lista los miembros de cada unidad y traduce el rol técnico a lo
// que esa persona PUEDE HACER, que es lo que importa.
//
//   node scripts/drive-quien-tiene-acceso.mjs
//
// Solo lee. No cambia permisos: para sacar a alguien hay que hacerlo a mano en
// Drive (o pedirlo explícitamente), porque quitar acceso es irreversible en la
// práctica — la persona pierde de vista trabajos que puede estar editando.

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

const UNIDADES = [
  { id: '0ALsTwjw6_Zc1Uk9PVA', nombre: 'CRUDO' },
  { id: '0AK9Y6BbDhgekUk9PVA', nombre: 'ENTREGAS CLIENTES' },
]

// El rol de Google traducido a lo que la persona puede hacer de verdad.
const PODER = {
  organizer:     { txt: 'Administrador — BORRA DEFINITIVO, agrega y saca gente', peso: 4 },
  fileOrganizer: { txt: 'Gestor — mueve, renombra y manda a papelera', peso: 3 },
  writer:        { txt: 'Colaborador — sube y edita', peso: 2 },
  commenter:     { txt: 'Comenta', peso: 1 },
  reader:        { txt: 'Solo mira', peso: 0 },
}
// Una cuenta @somosmagma.com se suspende desde el admin de Workspace el día que
// alguien se va. Una cuenta personal NO: sigue entrando hasta que alguien se
// acuerda de sacarla a mano. Esa es la distinción que importa acá.
const esDeCasa = m => /@somosmagma\.com$/i.test(String(m||''))
const esRobot  = m => /gserviceaccount\.com$/i.test(String(m||''))

for (const u of UNIDADES) {
  const d = await drive.drives.get({ driveId: u.id, fields: 'name,restrictions' })
  console.log(`\n════ ${d.data.name} ════`)
  const r = await drive.permissions.list({
    fileId: u.id, supportsAllDrives: true,
    fields: 'permissions(id,type,role,emailAddress,displayName)',
  })
  const gente = (r.data.permissions || [])
    .map(p => ({ ...p, poder: PODER[p.role] || { txt: p.role, peso: 0 } }))
    .sort((a, b) => b.poder.peso - a.poder.peso)

  gente.forEach(p => {
    const quien = p.emailAddress || p.displayName || '(sin mail)'
    const alerta = !esDeCasa(quien) && !esRobot(quien) && p.poder.peso >= 2 ? '  ⚠️ CUENTA PERSONAL' : ''
    const grupo = p.type === 'group' ? '  (grupo: revisar quiénes están adentro)' : ''
    console.log(`  ${quien.padEnd(46)} ${p.poder.txt}${alerta}${grupo}`)
  })

  const afuera = gente.filter(p => {
    const q = p.emailAddress || ''
    return q && !esDeCasa(q) && !esRobot(q) && p.poder.peso >= 2
  })
  if (afuera.length) {
    console.log(`\n  ⚠️  ${afuera.length} cuenta(s) personal(es) con acceso a TODA la unidad.`)
    console.log('     Ven todos los proyectos de todos los clientes, de todos los años.')
    console.log('     Y no se pueden dar de baja desde el admin de Workspace: si esa persona')
    console.log('     deja Magma, sigue entrando hasta que alguien la saque a mano de acá.')
    console.log('     Lo correcto: acceso a la carpeta de SU proyecto, no a la unidad entera.')
  }
}

console.log('\n· Ojo con los grupos: sus miembros no se ven acá, hay que mirarlos en el admin de Workspace.')
