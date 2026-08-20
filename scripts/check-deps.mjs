// Chequea que la app pueda buildear en Vercel. Dos cosas distintas, las dos vividas:
//   1) todo paquete importado por pages/ y lib/ declarado en package.json
//      (imapflow/mailparser instalados pero no commiteados: 5 días sin publicar)
//   2) todo archivo LOCAL importado, existente Y trackeado en git
//      (lib/slots.js sin trackear el 2026-08-20: el build local pasaba porque el
//       archivo estaba en disco, pero a Vercel no le habría llegado nunca)
// Uso: node scripts/check-deps.mjs   → sale con código 1 si falta algo.
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, dirname, normalize } from 'path'
import { execSync } from 'child_process'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const declared = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})])
const BUILTIN = new Set(['assert','buffer','child_process','cluster','crypto','dns','events','fs','http','http2','https','net','os','path','process','querystring','readline','stream','string_decoder','tls','url','util','v8','vm','zlib','worker_threads','timers'])

function walk(dir) {
  let out = []
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) out = out.concat(walk(p))
    else if (/\.(js|mjs|jsx|ts|tsx)$/.test(f)) out.push(p)
  }
  return out
}
const pkgName = spec => {
  if (spec.startsWith('.') || spec.startsWith('/')) return null            // relativo
  const clean = spec.replace(/^node:/, '')
  if (BUILTIN.has(clean.split('/')[0])) return null                        // builtin
  return spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
}

const files = ['pages', 'lib'].flatMap(d => { try { return walk(d) } catch { return [] } })
const faltan = {}
for (const file of files) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(/(?:import[^'"]*from|require\()\s*['"]([^'"]+)['"]/g)) {
    const name = pkgName(m[1])
    if (name && !declared.has(name)) (faltan[name] = faltan[name] || []).push(file)
  }
}

// ---- 2) archivos locales importados: ¿existen y los tiene git? ----
// El build local NO detecta esto: el archivo está en tu disco, así que compila igual.
// A Vercel solo le llega lo que está commiteado.
let enGit = new Set()
try {
  enGit = new Set(execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean))
  const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' }).split('\n').filter(Boolean)
  staged.forEach(f => enGit.add(f))     // lo staged va a entrar en el commit: cuenta como que git lo tiene
} catch { enGit = null }                 // sin git no podemos opinar

const EXT = ['', '.js', '.jsx', '.mjs', '.ts', '.tsx']
const sueltos = []
if (enGit) for (const file of files) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(/(?:import[^'"]*from|require\(|import\()\s*['"](\.[^'"]+)['"]/g)) {
    const destino = normalize(join(dirname(file), m[1]))
    const cands = [...EXT.map(e => destino + e), ...EXT.slice(1).map(e => join(destino, 'index' + e))]
    const real = cands.find(c => existsSync(c) && statSync(c).isFile())
    if (!real) sueltos.push({ tipo: 'NO EXISTE', file, imp: m[1], real: '' })
    else if (!enGit.has(real)) sueltos.push({ tipo: 'SIN TRACKEAR', file, imp: m[1], real })
  }
}

const nombres = Object.keys(faltan)
let roto = false

if (nombres.length) {
  roto = true
  console.log('❌ FALTAN en package.json (Vercel no va a poder buildear):')
  for (const n of nombres) console.log(`  · ${n}  → usado en: ${[...new Set(faltan[n])].join(', ')}`)
  console.log('\nArreglá con:  npm install ' + nombres.join(' ') + '  y commiteá package.json + package-lock.json\n')
} else {
  console.log('✅ Todas las dependencias importadas están en package.json.')
}

if (sueltos.length) {
  roto = true
  console.log('❌ ARCHIVOS QUE GIT NO TIENE (el build local pasa igual, Vercel se cae):')
  const porArchivo = [...new Set(sueltos.filter(x => x.real).map(x => x.real))]
  for (const s of sueltos) console.log(`  · ${s.file} importa "${s.imp}"` + (s.real ? ` → ${s.real} [${s.tipo}]` : '  [NO EXISTE]'))
  if (porArchivo.length) console.log('\nArreglá con:  git add ' + porArchivo.join(' '))
} else if (enGit) {
  console.log('✅ Todos los archivos locales importados están commiteados.')
} else {
  console.log('⚠️  No pude consultar git — no verifiqué los archivos locales.')
}

process.exit(roto ? 1 : 0)
