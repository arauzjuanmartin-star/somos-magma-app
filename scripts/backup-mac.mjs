/**
 * Backup de lo que vive SOLO en la Mac de Juan y hace falta para seguir trabajando si la roban o se rompe:
 * la memoria de Claude, la configuración de Claude Code (agentes, comandos, hooks, skills), las claves
 * (.env.local), lo del repo que todavía no está en GitHub y la carpeta personal.
 *
 * Arma una imagen de disco cifrada (.dmg, AES-256): en cualquier Mac se abre con doble clic y la clave.
 * La clave vive en el Llavero de esta Mac (para que el backup corra solo) y afuera de la Mac, donde la
 * guarde Juan (para poder abrirlo el día que la Mac no esté). Sin la clave el backup no se abre: no hay
 * forma de recuperarla.
 *
 * Uso:
 *   node scripts/backup-mac.mjs                     → preview: qué entraría y cuánto pesa. No crea nada.
 *   node scripts/backup-mac.mjs --clave             → pide la clave en una ventana y la guarda en el Llavero (una vez)
 *   node scripts/backup-mac.mjs --escribir          → arma el .dmg cifrado, lo sube a Drive y deja los últimos 10
 *   node scripts/backup-mac.mjs --escribir --local  → solo lo arma en ~/Backups Magma, sin subir nada
 *
 * Para que corra solo todos los días: scripts/launchd/com.somosmagma.backup.plist
 */
import { execFileSync, spawnSync } from 'child_process'
import { existsSync, mkdtempSync, mkdirSync, rmSync, lstatSync, statSync, readdirSync, readFileSync, writeFileSync, copyFileSync, createReadStream } from 'fs'
import { tmpdir, homedir, userInfo } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const HOME = homedir()
const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const PROYECTOS = join(HOME, '.claude/projects')
const LOCAL = join(HOME, 'Backups Magma')
const LLAVERO = 'magma-backup'
const TOPE_CARPETA = 50 * 1024 * 1024   // una carpeta sin subir a GitHub que pese más que esto no entra (y se avisa)
const GUARDAR_LOCAL = 3
const GUARDAR_DRIVE = 10
const DRIVE_UNIDAD = '0AHMUebE7UIa_Uk9PVA'          // unidad compartida ADMINISTRACION
const DRIVE_CARPETA = 'BACKUP MAC JUAN (cifrado)'

const args = process.argv.slice(2)
const ESCRIBIR = args.includes('--escribir')
const SOLO_LOCAL = args.includes('--local')
const PEDIR_CLAVE = args.includes('--clave')

const mb = n => (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB'
const IGNORAR = ['.DS_Store', 'node_modules', '.next', '.git', '.fseventsd', '.Trashes', '.Spotlight-V100', '.TemporaryItems']

// Cuenta archivos y peso de una carpeta (o de un archivo suelto), salteando lo que no se copia.
function medir(ruta, fuera = []) {
  let archivos = 0, bytes = 0
  const andar = p => {
    let st; try { st = lstatSync(p) } catch { return }
    if (st.isSymbolicLink()) return
    if (st.isDirectory()) { for (const n of readdirSync(p)) if (!IGNORAR.includes(n) && !fuera.includes(n)) andar(join(p, n)) }
    else if (st.isFile()) { archivos++; bytes += st.size }
  }
  andar(ruta)
  return { archivos, bytes }
}

const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return '' } }

// ── Qué entra ────────────────────────────────────────────────────────────────────────────────────────────
// Cada fuente: de dónde sale, a qué carpeta del backup va y qué se saltea.
const fuentes = []
if (existsSync(PROYECTOS)) for (const p of readdirSync(PROYECTOS)) {
  const mem = join(PROYECTOS, p, 'memory')
  if (existsSync(mem)) fuentes.push({ que: `Memoria de Claude (${p.replace(/^-Users-[^-]+-/, '')})`, origen: mem, destino: join('memoria', p) })
}
for (const n of ['CLAUDE.md', 'settings.json', 'settings.local.json', 'keybindings.json', 'skills', 'agents', 'commands']) {
  const o = join(HOME, '.claude', n)
  if (existsSync(o)) fuentes.push({ que: `Claude Code de la Mac: ${n}`, origen: o, destino: join('claude-global', n) })
}
if (existsSync(join(REPO, '.claude'))) fuentes.push({ que: 'Agentes, comandos y hooks de la app (.claude del repo)', origen: join(REPO, '.claude'), destino: 'claude-proyecto', fuera: ['worktrees'] })
if (existsSync(join(REPO, '.env.local'))) fuentes.push({ que: 'Claves de la app (.env.local)', origen: join(REPO, '.env.local'), destino: join('claves', 'somos-magma-app.env.local') })
if (existsSync(join(HOME, 'personal'))) fuentes.push({ que: 'Carpeta personal', origen: join(HOME, 'personal'), destino: 'personal' })

// Lo del repo que no está en GitHub: archivos sin trackear (agrupados por carpeta para saltear las pesadas)
const sinTrackear = git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean)
const grupos = {}
for (const f of sinTrackear) {
  let st; try { st = statSync(join(REPO, f)) } catch { continue }
  const g = f.includes('/') ? f.split('/')[0] : '(raíz)'
  ;(grupos[g] ||= { archivos: [], bytes: 0 }).archivos.push(f)
  grupos[g].bytes += st.size
}
const pesadas = Object.entries(grupos).filter(([, g]) => g.bytes > TOPE_CARPETA)
const repoFiles = Object.entries(grupos).filter(([, g]) => g.bytes <= TOPE_CARPETA).flatMap(([, g]) => g.archivos)
const repoBytes = Object.entries(grupos).filter(([, g]) => g.bytes <= TOPE_CARPETA).reduce((a, [, g]) => a + g.bytes, 0)
const parche = git('diff', 'HEAD')
const sinPushear = Number(git('rev-list', '--count', '@{u}..HEAD').trim() || 0)

// ── La clave ─────────────────────────────────────────────────────────────────────────────────────────────
const USUARIO = userInfo().username
const leerClave = () => { try { return execFileSync('security', ['find-generic-password', '-a', USUARIO, '-s', LLAVERO, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\n$/, '') } catch { return '' } }

if (PEDIR_CLAVE) {
  if (leerClave() && !args.includes('--cambiar')) {
    console.log('\nYa hay una clave guardada en el Llavero. Para cambiarla: --clave --cambiar')
    console.log('(los backups que ya existen se siguen abriendo con la clave anterior).\n')
    process.exit(0)
  }
  const ventana = texto => execFileSync('osascript', ['-e', 'activate', '-e', `text returned of (display dialog "${texto}" default answer "" with title "Backup Magma" buttons {"Cancelar", "Guardar"} default button "Guardar" cancel button "Cancelar")`], { encoding: 'utf8' }).replace(/\n$/, '')
  let a, b
  try {
    a = ventana('Elegí la clave del backup (12 caracteres o más).\\n\\nSin esta clave el backup NO se puede abrir: anotala fuera de la Mac.')
    b = ventana('Escribila otra vez para confirmar.')
  } catch { console.log('\nCancelado: no se guardó ninguna clave.\n'); process.exit(1) }
  if (a !== b) { console.error('\n✗ Las dos claves no coinciden. No se guardó nada; corré de nuevo --clave.\n'); process.exit(1) }
  if (a.length < 12) { console.error('\n✗ La clave tiene menos de 12 caracteres. No se guardó nada; corré de nuevo --clave.\n'); process.exit(1) }
  execFileSync('security', ['add-generic-password', '-a', USUARIO, '-s', LLAVERO, '-w', a, '-U'])
  console.log(leerClave() === a ? '\n✓ Clave guardada en el Llavero de esta Mac. Anotala también fuera de la Mac.\n' : '\n✗ No se pudo leer la clave recién guardada.\n')
  process.exit(0)
}

// ── Preview ──────────────────────────────────────────────────────────────────────────────────────────────
console.log(`\nBACKUP DE LA MAC — ${ESCRIBIR ? 'se arma ahora' : 'PREVIEW (no crea nada)'}\n`)
let totalA = 0, totalB = 0
for (const f of fuentes) {
  const m = medir(f.origen, f.fuera)
  f.archivos = m.archivos; totalA += m.archivos; totalB += m.bytes
  console.log(`  ${String(m.archivos).padStart(5)} archivos  ${mb(m.bytes).padStart(9)}   ${f.que}`)
}
console.log(`  ${String(repoFiles.length).padStart(5)} archivos  ${mb(repoBytes).padStart(9)}   Lo del repo que no está en GitHub (sin trackear)`)
totalA += repoFiles.length; totalB += repoBytes
if (parche) console.log(`      1 archivo   ${mb(Buffer.byteLength(parche)).padStart(9)}   Cambios sin commitear en archivos del repo (como parche)`)
console.log(`  ${'─'.repeat(27)}\n  ${String(totalA).padStart(5)} archivos  ${mb(totalB).padStart(9)}   en total, antes de comprimir\n`)
for (const [g, x] of pesadas) console.log(`  ⚠ NO entra por pesada: ${g}/ (${mb(x.bytes)}, ${x.archivos.length} archivos). Si hace falta, se guarda aparte.`)
if (sinPushear) console.log(`  ⚠ Hay ${sinPushear} commit${sinPushear === 1 ? '' : 's'} sin subir a GitHub: eso NO entra en este backup, se resuelve con git push.`)
console.log(`  Destino: ${LOCAL}/${SOLO_LOCAL ? '' : `  +  Drive › ADMINISTRACION › ${DRIVE_CARPETA}`}`)
console.log(`  Clave en el Llavero: ${leerClave() ? 'sí' : 'NO — falta correr: node scripts/backup-mac.mjs --clave'}\n`)

if (!ESCRIBIR) { console.log('Preview. Para armarlo: node scripts/backup-mac.mjs --escribir\n'); process.exit(0) }

// ── Armar ────────────────────────────────────────────────────────────────────────────────────────────────
const clave = leerClave()
if (!clave) { console.error('✗ No hay clave guardada. Primero: node scripts/backup-mac.mjs --clave\n'); process.exit(1) }

const d = new Date(), p2 = n => String(n).padStart(2, '0')
const sello = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`
const nombre = `backup-magma-${sello}.dmg`
const salida = join(LOCAL, nombre)
mkdirSync(LOCAL, { recursive: true })

const COMO_RESTAURAR = `BACKUP DE LA MAC DE JUAN — ${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}

QUÉ HAY ACÁ
  memoria/           La memoria de Claude (todo lo que sabe de Magma). Una carpeta por proyecto.
  claude-global/     La configuración de Claude Code de la Mac (reglas, skills, permisos).
  claude-proyecto/   Los agentes, comandos y hooks de la app (la carpeta .claude del repo).
  claves/            El .env.local de la app (las claves de Google, del mail, etc.).
  repo-sin-github/   Lo del repo que todavía no estaba subido a GitHub.
  personal/          La carpeta personal de Juan.

CÓMO VOLVER A TRABAJAR EN UNA MAC NUEVA
  1. Instalar VSCode, Node y Claude Code. Bajar el código:
       git clone https://github.com/arauzjuanmartin-star/somos-magma-app.git ~/somos-magma-app
       cd ~/somos-magma-app && npm install
  2. Copiar claves/somos-magma-app.env.local a ~/somos-magma-app/.env.local
  3. Copiar lo que hay adentro de claude-proyecto/ a ~/somos-magma-app/.claude/
  4. Copiar lo que hay adentro de repo-sin-github/ a ~/somos-magma-app/ (respeta las mismas carpetas).
  5. Copiar cada carpeta de memoria/ a ~/.claude/projects/<mismo nombre>/memory/
     (el nombre es la ruta del repo con "/" cambiadas por "-": si el usuario de la Mac nueva no es
      "${USUARIO}", la carpeta cambia de nombre).
  6. Copiar lo que hay adentro de claude-global/ a ~/.claude/
  7. Copiar personal/ a ~/personal/
  Más fácil: abrir Claude Code en el repo y decirle "restaurá este backup", con esta ventana abierta.

SI LA MAC FUE ROBADA
  Antes de restaurar nada, cambiar las claves que están en claves/ (Google, mail de admin@, NextAuth):
  quien tenga la Mac las tiene.
`

const armado = mkdtempSync(join(tmpdir(), 'magma-backup-'))   // acá las claves quedan sin cifrar un momento: se borra siempre
let esperados
try {
  for (const f of fuentes) {
    const dest = join(armado, f.destino)
    if (statSync(f.origen).isDirectory()) {
      mkdirSync(dest, { recursive: true })
      execFileSync('rsync', ['-a', ...[...IGNORAR, ...(f.fuera || [])].flatMap(n => ['--exclude', n]), f.origen + '/', dest + '/'])
    } else { mkdirSync(dirname(dest), { recursive: true }); copyFileSync(f.origen, dest) }
  }
  for (const f of repoFiles) { const dest = join(armado, 'repo-sin-github', f); mkdirSync(dirname(dest), { recursive: true }); copyFileSync(join(REPO, f), dest) }
  if (parche) { mkdirSync(join(armado, 'repo-sin-github'), { recursive: true }); writeFileSync(join(armado, 'repo-sin-github', '_cambios-sin-commitear.patch'), parche) }
  writeFileSync(join(armado, 'COMO-RESTAURAR.txt'), COMO_RESTAURAR)
  esperados = medir(armado).archivos

  const r = spawnSync('hdiutil', ['create', '-srcfolder', armado, '-volname', `Backup Magma ${sello}`, '-format', 'UDZO', '-encryption', 'AES-256', '-stdinpass', '-ov', '-quiet', salida], { input: clave + '\0', encoding: 'utf8' })
  if (r.status !== 0) throw new Error('hdiutil no pudo armar la imagen: ' + (r.stderr || r.stdout || '').trim())
} finally { rmSync(armado, { recursive: true, force: true }) }

// Verificar de verdad: se abre con la clave y se cuentan los archivos adentro.
const punto = mkdtempSync(join(tmpdir(), 'magma-verif-'))
let adentro = -1
const abrir = spawnSync('hdiutil', ['attach', salida, '-stdinpass', '-readonly', '-nobrowse', '-mountpoint', punto, '-quiet'], { input: clave + '\0', encoding: 'utf8' })
if (abrir.status === 0) { adentro = medir(punto).archivos; spawnSync('hdiutil', ['detach', punto, '-quiet']) }
rmSync(punto, { recursive: true, force: true })
const peso = statSync(salida).size
if (adentro !== esperados) {
  console.error(`✗ La imagen NO verifica: se esperaban ${esperados} archivos y al abrirla hay ${adentro < 0 ? 'error al abrir' : adentro}. Queda en ${salida} para mirar; no se sube.\n`)
  process.exit(1)
}
console.log(`✓ Armado y verificado: ${nombre} · ${mb(peso)} cifrado · ${adentro} archivos (se abrió con la clave y se contaron).`)

// En la Mac quedan los últimos GUARDAR_LOCAL
const locales = readdirSync(LOCAL).filter(n => /^backup-magma-.*\.dmg$/.test(n)).sort().reverse()
for (const viejo of locales.slice(GUARDAR_LOCAL)) rmSync(join(LOCAL, viejo))

if (SOLO_LOCAL) { console.log(`  Quedó solo en la Mac (${salida}). OJO: si se pierde la Mac, se pierde con ella.\n`); process.exit(0) }

// ── Subir a Drive ────────────────────────────────────────────────────────────────────────────────────────
const { google } = await import('googleapis')
const env = Object.fromEntries(readFileSync(join(REPO, '.env.local'), 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({
  credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
  scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'],
})
const drive = google.drive({ version: 'v3', auth })
const enUnidad = { supportsAllDrives: true, includeItemsFromAllDrives: true, corpora: 'drive', driveId: DRIVE_UNIDAD }

let carpeta = (await drive.files.list({ ...enUnidad, q: `name='${DRIVE_CARPETA}' and '${DRIVE_UNIDAD}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: 'files(id)' })).data.files?.[0]?.id
if (!carpeta) carpeta = (await drive.files.create({ supportsAllDrives: true, requestBody: { name: DRIVE_CARPETA, mimeType: 'application/vnd.google-apps.folder', parents: [DRIVE_UNIDAD] }, fields: 'id' })).data.id

const subido = (await drive.files.create({ supportsAllDrives: true, requestBody: { name: nombre, parents: [carpeta] }, media: { mimeType: 'application/x-apple-diskimage', body: createReadStream(salida) }, fields: 'id,name,size,webViewLink' })).data
if (Number(subido.size) !== peso) { console.error(`✗ En Drive pesa ${subido.size} bytes y en la Mac ${peso}: la subida quedó mal. Revisar ${subido.webViewLink}\n`); process.exit(1) }
console.log(`✓ Subido a Drive › ADMINISTRACION › ${DRIVE_CARPETA} (mismo peso que en la Mac): ${subido.webViewLink}`)

// En Drive quedan los últimos GUARDAR_DRIVE; los más viejos van a la papelera de la unidad (se vacía sola a los 30 días)
const enDrive = ((await drive.files.list({ ...enUnidad, q: `'${carpeta}' in parents and trashed=false and name contains 'backup-magma-'`, fields: 'files(id,name)', pageSize: 200 })).data.files || []).sort((a, b) => b.name.localeCompare(a.name))
for (const viejo of enDrive.slice(GUARDAR_DRIVE)) await drive.files.update({ fileId: viejo.id, supportsAllDrives: true, requestBody: { trashed: true } })
console.log(`  En Drive hay ${Math.min(enDrive.length, GUARDAR_DRIVE)} backup${enDrive.length === 1 ? '' : 's'}${enDrive.length > GUARDAR_DRIVE ? ` (${enDrive.length - GUARDAR_DRIVE} viejo${enDrive.length - GUARDAR_DRIVE === 1 ? '' : 's'} a la papelera)` : ''}.`)

// Queda anotado en el LOG del Master: si un día deja de correr, se ve
try {
  const sheets = google.sheets({ version: 'v4', auth })
  await sheets.spreadsheets.values.append({ spreadsheetId: env.SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), 'backup-mac (Mac de Juan)', 'backup', 'DRIVE', nombre, `${mb(peso)} · ${adentro} archivos · ${subido.webViewLink}`]] } })
} catch (e) { console.error('  (no se pudo anotar en LOG: ' + e.message + ')') }
console.log('')
