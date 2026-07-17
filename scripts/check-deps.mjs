// Chequea que TODO paquete importado por la app (pages/ y lib/) esté declarado en package.json.
// Atrapa el bug que dejó a Vercel sin poder buildear (imapflow/mailparser instalados pero no commiteados).
// Uso: node scripts/check-deps.mjs   → sale con código 1 si falta alguno.
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

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

const nombres = Object.keys(faltan)
if (!nombres.length) { console.log('✅ Todas las dependencias importadas están en package.json.'); process.exit(0) }
console.log('❌ FALTAN en package.json (Vercel no va a poder buildear):')
for (const n of nombres) console.log(`  · ${n}  → usado en: ${[...new Set(faltan[n])].join(', ')}`)
console.log('\nArreglá con:  npm install ' + nombres.join(' ') + '  y commiteá package.json + package-lock.json')
process.exit(1)
