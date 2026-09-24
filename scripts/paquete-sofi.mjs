#!/usr/bin/env node
// Arma el paquete de Claude Code para Sofi: memoria curada + CLAUDE.md global + .claude del proyecto + guía.
//   node scripts/paquete-sofi.mjs             → escribe _para-sofi-claude-code/ y _para-sofi-claude-code.zip
//   node scripts/paquete-sofi.mjs --preview   → solo lista qué entraría, no escribe nada
// Fuente editable: scripts/paquete-sofi/ (excluir.txt, memoria-extra/, proyecto-claude/, global-CLAUDE.md, LEEME.md, instalar.sh)
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FUENTE = path.join(RAIZ, 'scripts', 'paquete-sofi')
const MEM_JUAN = path.join(os.homedir(), '.claude', 'projects', '-Users-dronjuan-somos-magma-app', 'memory')
const CLAUDE_PROY = path.join(RAIZ, '.claude')
const SALIDA = path.join(RAIZ, '_para-sofi-claude-code')
const PREVIEW = process.argv.includes('--preview')

// Líneas del MEMORY.md de Juan que cambian para Sofi. Cada "de" tiene que aparecer exactamente una vez.
const REEMPLAZOS_INDICE = [
  ['- [Rol de Juan](user_role.md) — dueño de Magma; arma la app él, no es dev pro',
   '- [Rol de Sofi](user_role.md) — socia de Magma; dirección creativa y día a día; no es dev'],
  ['- [Cómo hablarle a Juan](user_juan_communication_style.md) — directo, números reales, rápido > perfecto',
   '- [Cómo trabaja Juan, el otro socio](user_juan_communication_style.md) — perfil heredado: directo, números reales, rápido > perfecto'],
  ['- [Invitados del Calendar ≠ acompañantes](user_calendar_invitados_no_son_acompanantes.md) — los invita para avisar\n', ''],
  ['- [Trabajar eficiente con Juan](como_trabajar_con_juan_eficiente.md) — verificar, autonomía, no re-preguntar, guardar todo',
   '- [Trabajar eficiente con los socios](como_trabajar_con_juan_eficiente.md) — verificar, autonomía, no re-preguntar, guardar todo'],
  ['- [Que las cosas pasen solas](project_juan_sistema_personal_y_automatizacion.md) — automatizar + sistema personal de Juan\n', ''],
  ['[reparto Sofi/Juan](project_reparto_comercial_sofi_juan.md)',
   '[reparto de áreas entre socios: 14/08 → 18/09](project_reparto_comercial_sofi_juan.md)'],
  [' · [doc de la cuenta de Juan (mismo URL)](reference_doc_cuenta_personal_juan.md)', ''],
  ['- [Mandar mails en nombre de Juan](reference_mails_como_mandar.md) — Gmail ES juan@somosmagma.com; solo borradores',
   '- [Mandar mails](reference_mails_como_mandar.md) — el script sale como admin@; el conector de Gmail solo hace borradores'],
  ['- [Cuentas Microsoft de Juan](reference_microsoft_cuentas_juan.md) — juan@somosmagma.com es PERSONAL; "Enviar código por correo"\n', ''],
]
const LINEAS_NUEVAS = [
  '- [ORIGEN DE ESTA MEMORIA — leer primero](project_origen_de_esta_memoria.md) — viene de los chats de Juan (paquete 22/09/2026); "Juan definió X" = decisión de la empresa',
  '- [Cómo trabajar con Sofi](user_sofi_communication_style.md) — arranca con las reglas de Juan; se ajusta con lo que ella corrija',
]
// En los comandos, "Juan" como interlocutor pasa a ser Sofi, y las rutas de la Mac de Juan se generalizan.
const REEMPLAZOS_COMANDOS = {
  'comandos.md': [['Mostrale a Juan esta lista tal cual', 'Mostrale a Sofi esta lista tal cual']],
  'cliente.md': [
    ['desde `/Users/dronjuan/somos-magma-app/` con el nombre que pida Juan', 'desde la carpeta del proyecto con el nombre que pida Sofi'],
    ['Mostrale a Juan la ficha tal cual sale.', 'Mostrale a Sofi la ficha tal cual sale.'],
  ],
  'somos-morning.md': [
    ['de SOMOS MAGMA para Juan', 'de SOMOS MAGMA para Sofi'],
    ['El script debe correr desde `/Users/dronjuan/somos-magma-app/`', 'El script debe correr desde la carpeta del proyecto'],
    ['El objetivo es que Juan abra el chat', 'El objetivo es que Sofi abra el chat'],
  ],
  'somos-semana.md': [
    ['de SOMOS MAGMA para Juan (y Sofi)', 'de SOMOS MAGMA para Sofi (y Juan)'],
    ['desde `/Users/dronjuan/somos-magma-app/`.', 'desde la carpeta del proyecto.'],
    ['- Mostrale a Juan el reporte tal cual', '- Mostrale a Sofi el reporte tal cual'],
  ],
  'contador.md': [
    ['Sos el control impositivo de Juan.', 'Sos el control impositivo de Magma.'],
    ['**pedile OK a Juan antes de correrlo con --write.**', '**pedile OK a Sofi antes de correrlo con --write.**'],
  ],
}
// Nada de esto puede aparecer en lo que sale para Sofi (rastros de lo excluido).
const PROHIBIDO = ['Delfina', 'arauzjuanmartin@hotmail', 'Quién Vende Magma', '49f5aa21', '35cd5721', 'atajando todos los penales', 'perfeccionismo']
const PROHIBIDO_EN_CONFIG = ['/Users/dronjuan']   // solo global/ y proyecto/: las memorias sí pueden citar rutas de Juan

const leer = f => fs.readFileSync(f, 'utf8')
const md = d => fs.readdirSync(d).filter(f => f.endsWith('.md')).sort()
function reemplazarUnaVez(texto, de, a, ctx) {
  const n = texto.split(de).length - 1
  if (n !== 1) throw new Error(`${ctx}: "${de.slice(0, 60)}…" aparece ${n} veces (tiene que ser 1). Revisar REEMPLAZOS en paquete-sofi.mjs`)
  return texto.replace(de, a)
}

// ---------- memoria ----------
const excluir = leer(path.join(FUENTE, 'excluir.txt')).split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
for (const f of excluir) if (!fs.existsSync(path.join(MEM_JUAN, f))) console.warn(`⚠ excluir.txt lista ${f} pero no existe en la memoria de Juan`)
const memoria = new Map()
for (const f of md(MEM_JUAN)) if (f !== 'MEMORY.md' && !excluir.includes(f)) memoria.set(f, leer(path.join(MEM_JUAN, f)))
const reemplazadas = [], nuevas = []
for (const f of md(path.join(FUENTE, 'memoria-extra'))) {
  (memoria.has(f) ? reemplazadas : nuevas).push(f)
  memoria.set(f, leer(path.join(FUENTE, 'memoria-extra', f)))
}
let indice = leer(path.join(MEM_JUAN, 'MEMORY.md'))
for (const [de, a] of REEMPLAZOS_INDICE) indice = reemplazarUnaVez(indice, de, a, 'MEMORY.md')
indice = ['<!-- magma-paquete:inicio -->', ...LINEAS_NUEVAS, indice.trimEnd(), '<!-- magma-paquete:fin -->'].join('\n') + '\n'

// chequeo: todo link del índice existe, y todo archivo está indexado
const linkeados = new Set([...indice.matchAll(/\]\(([^)]+\.md)\)/g)].map(m => m[1]))
const sinArchivo = [...linkeados].filter(f => !memoria.has(f))
const sinIndice = [...memoria.keys()].filter(f => !linkeados.has(f))
if (sinArchivo.length) throw new Error('MEMORY.md linkea archivos que no van: ' + sinArchivo.join(', '))
if (sinIndice.length) throw new Error('Memorias sin línea en MEMORY.md: ' + sinIndice.join(', '))
// wikilinks colgados (informativo): se resuelven por nombre de archivo o por el `name:` del frontmatter
const nombres = new Set()
for (const [f, t] of memoria) { nombres.add(f.replace(/\.md$/, '')); const m = t.match(/^name:\s*(.+)$/m); if (m) nombres.add(m[1].trim().replace(/^"|"$/g, '')) }
const colgados = new Map()
for (const [f, t] of memoria) for (const m of t.matchAll(/\[\[([^\]|]+)\]\]/g)) { const n = m[1].trim(); if (!nombres.has(n) && !nombres.has(n.replace(/-/g, '_')) && !nombres.has(n.replace(/_/g, '-'))) colgados.set(n, [...(colgados.get(n) || []), f]) }
for (const [f, t] of memoria) for (const p of PROHIBIDO) if (t.includes(p)) throw new Error(`memoria/${f} contiene "${p}" (rastro de algo excluido)`)

// ---------- .claude del proyecto ----------
const comandos = new Map()
for (const f of md(path.join(CLAUDE_PROY, 'commands'))) {
  let t = leer(path.join(CLAUDE_PROY, 'commands', f))
  for (const [de, a] of REEMPLAZOS_COMANDOS[f] || []) t = reemplazarUnaVez(t, de, a, `commands/${f}`)
  comandos.set(f, t)
}
for (const f of Object.keys(REEMPLAZOS_COMANDOS)) if (!comandos.has(f)) throw new Error(`REEMPLAZOS_COMANDOS habla de ${f} pero no existe en .claude/commands`)
const overrides = md(path.join(FUENTE, 'proyecto-claude', 'commands'))
for (const f of overrides) comandos.set(f, leer(path.join(FUENTE, 'proyecto-claude', 'commands', f)))
const config = new Map()   // ruta relativa dentro de proyecto/.claude → contenido
for (const [f, t] of comandos) config.set(`commands/${f}`, t)
const caminar = (dir, base) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name === '.DS_Store') continue; const p = path.join(dir, e.name); e.isDirectory() ? caminar(p, `${base}/${e.name}`) : config.set(`${base}/${e.name}`, leer(p)) } }
caminar(path.join(CLAUDE_PROY, 'skills'), 'skills')
caminar(path.join(CLAUDE_PROY, 'hooks'), 'hooks')
config.set('settings.json', leer(path.join(FUENTE, 'proyecto-claude', 'settings.json')))
JSON.parse(config.get('settings.json'))   // que sea JSON válido
const global = leer(path.join(FUENTE, 'global-CLAUDE.md'))
for (const [f, t] of [...config, ['global/CLAUDE.md', global]]) for (const p of [...PROHIBIDO, ...PROHIBIDO_EN_CONFIG]) if (t.includes(p)) throw new Error(`${f} contiene "${p}"`)
const mencionesJuan = [...comandos].map(([f, t]) => [f, (t.match(/\bJuan\b/g) || []).length]).filter(([, n]) => n)

// ---------- resumen ----------
const bytes = [...memoria.values()].reduce((s, t) => s + Buffer.byteLength(t), 0)
console.log(`${PREVIEW ? 'PREVIEW — ' : ''}Paquete para Sofi`)
console.log(`  memorias: ${memoria.size} (${(bytes / 1024).toFixed(0)} KB) = ${memoria.size - nuevas.length} de Juan (${reemplazadas.length} reemplazadas por la versión adaptada) + ${nuevas.length} nuevas`)
console.log(`    excluidas (${excluir.length}): ${excluir.join(', ')}`)
console.log(`    adaptadas: ${reemplazadas.join(', ')}`)
console.log(`    nuevas: ${nuevas.join(', ')}`)
console.log(`  MEMORY.md: ${indice.trimEnd().split('\n').length} líneas, ${(Buffer.byteLength(indice) / 1024).toFixed(1)} KB (Claude carga hasta 200 líneas / 25 KB)`)
if (colgados.size) console.log(`  wikilinks a memorias que no van (quedan colgados, no rompen nada): ${[...colgados].map(([n, fs]) => `${n} ← ${fs.length}`).join(' · ')}`)
console.log(`  comandos: ${comandos.size} (${overrides.length} con versión propia: ${overrides.join(', ')}); menciones a "Juan" que quedan: ${mencionesJuan.map(([f, n]) => `${f} ${n}`).join(', ')}`)
console.log(`  .claude: ${config.size} archivos · global/CLAUDE.md · LEEME.md · instalar.sh`)
if (PREVIEW) { console.log('\nNo se escribió nada (--preview).'); process.exit(0) }

// ---------- escribir ----------
fs.rmSync(SALIDA, { recursive: true, force: true })
const escribir = (rel, contenido) => { const p = path.join(SALIDA, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, contenido) }
escribir('LEEME.md', leer(path.join(FUENTE, 'LEEME.md')))
escribir('instalar.sh', leer(path.join(FUENTE, 'instalar.sh')))
fs.chmodSync(path.join(SALIDA, 'instalar.sh'), 0o755)
escribir('global/CLAUDE.md', global)
for (const [rel, t] of config) escribir(`proyecto/.claude/${rel}`, t)
for (const [f, t] of memoria) escribir(`memoria/${f}`, t)
escribir('memoria/MEMORY.md', indice)
escribir('memoria/manifest.txt', [...memoria.keys()].sort().join('\n') + '\n')
console.log(`\n✓ ${SALIDA} (carpeta, para mirar; NO se manda suelta)`)

// ---------- todo-en-uno: el repo (solo archivos trackeados por git) + el paquete adentro. Se descomprime como somos-magma-app/ ----------
// NO incluye .env.local ni nada ignorado por git: las credenciales se le pasan aparte (AirDrop).
const TODO = path.join(RAIZ, '_para-sofi-todo'), TODO_ZIP = TODO + '.zip'
fs.rmSync(TODO, { recursive: true, force: true }); fs.rmSync(TODO_ZIP, { force: true })
const destRepo = path.join(TODO, 'somos-magma-app')
const tracked = execSync('git ls-files -z', { cwd: RAIZ }).toString().split('\0').filter(Boolean)
for (const f of tracked) { const d = path.join(destRepo, f); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(path.join(RAIZ, f), d) }
fs.cpSync(SALIDA, path.join(destRepo, '_para-sofi-claude-code'), { recursive: true })
execSync(`zip -qr "${TODO_ZIP}" "somos-magma-app" -x "*.DS_Store"`, { cwd: TODO })
fs.rmSync(TODO, { recursive: true, force: true })
console.log(`✓ ${TODO_ZIP} (${(fs.statSync(TODO_ZIP).size / 1024 / 1024).toFixed(1)} MB) = repo (${tracked.length} archivos) + paquete → ES EL ÚNICO ZIP QUE SE MANDA. Se abre como somos-magma-app/. El .env.local va aparte, por AirDrop.`)
