/**
 * PROXIES PARA EDITOR — convierte una carpeta de crudo pesado en copias livianas
 * que se ven en cualquier reproductor y se editan fluido.
 *
 * Para qué: el material Canon 4:2:2 10 bits no lo abre QuickTime (se ve negro) y
 * pesa 4-8 GB por clip. Al editor freelance no le entra en el disco. Esto genera
 * 1080p H.264 8 bits (4:2:0) + AAC — mismo nombre, ~10x más liviano, se ve en todos lados.
 *
 * Uso:
 *   node scripts/proxies-editor.mjs <carpeta-origen>                 → PREVIEW (no toca nada)
 *   node scripts/proxies-editor.mjs <carpeta-origen> --go            → convierte
 *   node scripts/proxies-editor.mjs <carpeta-origen> --go --540      → proxy más chico (540p)
 *
 * Los originales NO se tocan nunca. La salida va a <carpeta-origen>/_PROXIES/
 * Requiere ffmpeg (brew install ffmpeg).
 */
import { readdirSync, statSync, mkdirSync, existsSync } from 'fs'
import { join, extname, basename } from 'path'
import { execFileSync, spawnSync } from 'child_process'

const args = process.argv.slice(2)
const ORIGEN = args.find(a => !a.startsWith('--'))
const GO = args.includes('--go')
const CHICO = args.includes('--540')

if (!ORIGEN) {
  console.log('\n  Falta la carpeta. Ejemplo:')
  console.log('  node scripts/proxies-editor.mjs ~/Downloads/Peugeot\n')
  process.exit(1)
}
if (!existsSync(ORIGEN)) { console.log(`\n  No existe la carpeta: ${ORIGEN}\n`); process.exit(1) }

const EXT = ['.mp4', '.mov', '.mxf', '.m4v']
const GB = b => (b / 1024 ** 3).toFixed(2) + ' GB'
const ALTO = CHICO ? 540 : 1080
const BITRATE = CHICO ? '4M' : '10M'

// ffmpeg presente?
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }) }
catch { console.log('\n  Falta ffmpeg. Instalalo con:  brew install ffmpeg\n'); process.exit(1) }

// videotoolbox = encoder por hardware del Mac, muchísimo más rápido
let encoder = 'libx264', extraArgs = ['-preset', 'veryfast', '-crf', '23']
try {
  const enc = execFileSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  if (enc.includes('h264_videotoolbox')) { encoder = 'h264_videotoolbox'; extraArgs = ['-b:v', BITRATE] }
} catch {}

const archivos = readdirSync(ORIGEN)
  .filter(f => EXT.includes(extname(f).toLowerCase()) && !f.startsWith('.'))
  .map(f => ({ nombre: f, ruta: join(ORIGEN, f), size: statSync(join(ORIGEN, f)).size }))
  .sort((a, b) => a.nombre.localeCompare(b.nombre))

if (!archivos.length) { console.log(`\n  No hay videos en ${ORIGEN}\n`); process.exit(0) }

const pesoTotal = archivos.reduce((s, a) => s + a.size, 0)
const DESTINO = join(ORIGEN, '_PROXIES')

// ── ficha técnica de cada archivo ──────────────────────────────────────────
function ficha(ruta) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=profile,pix_fmt,r_frame_rate,width,height',
    '-of', 'json', ruta], { encoding: 'utf8' })
  let s = {}
  try { s = JSON.parse(r.stdout || '{}').streams?.[0] || {} } catch {}
  const [n, d] = String(s.r_frame_rate || '').split('/')
  const f = d ? (Number(n) / Number(d)).toFixed(2).replace(/\.?0+$/, '') : '?'
  return {
    prof: s.profile || '?',
    pix: s.pix_fmt || '?',
    fps: f,
    res: s.width && s.height ? `${s.width}x${s.height}` : '?',
  }
}

console.log(`\n████ ${archivos.length} videos · ${GB(pesoTotal)} · ${ORIGEN}\n`)
console.log('  archivo                 resolución    perfil            bits/color   fps      peso')
console.log('  ' + '─'.repeat(88))
const fps = new Set(), perfiles = {}
archivos.forEach(a => {
  const f = ficha(a.ruta)
  fps.add(f.fps); perfiles[`${f.prof} ${f.pix}`] = (perfiles[`${f.prof} ${f.pix}`] || 0) + 1
  const problema = /422|10le/.test(f.pix) ? ' ⚠' : '  '
  console.log(`  ${a.nombre.slice(0, 22).padEnd(23)} ${f.res.padEnd(13)} ${f.prof.padEnd(17)} ${f.pix.padEnd(12)} ${f.fps.padEnd(7)} ${GB(a.size).padStart(9)}${problema}`)
})

console.log(`\n═══ DIAGNÓSTICO ═══`)
Object.entries(perfiles).forEach(([k, n]) => {
  const rompe = /422|10le/.test(k)
  console.log(`  ${String(n).padStart(3)} archivos · ${k}${rompe ? '   ← NO se ve en QuickTime (imagen negra)' : '   ← se ve en cualquier reproductor'}`)
})
if (fps.size > 1) console.log(`\n  ⚠ FRAME RATES MEZCLADOS: ${[...fps].join(', ')} fps. Definir el fps de la secuencia ANTES de editar.`)

const estimado = pesoTotal * (CHICO ? 0.025 : 0.08)
console.log(`\n═══ QUÉ VA A HACER ═══`)
console.log(`  Origen:   ${GB(pesoTotal)} en ${archivos.length} archivos  (los originales NO se tocan)`)
console.log(`  Salida:   ${DESTINO}`)
console.log(`  Formato:  ${ALTO}p · H.264 8 bits 4:2:0 · AAC 192k · encoder ${encoder}`)
console.log(`  Peso estimado: ~${GB(estimado)}  (${Math.round(pesoTotal / estimado)}x más liviano)`)

if (!GO) {
  console.log(`\n  Esto fue un PREVIEW. Para convertir de verdad:`)
  console.log(`  node scripts/proxies-editor.mjs "${ORIGEN}" --go${CHICO ? ' --540' : ''}\n`)
  process.exit(0)
}

// ── conversión ─────────────────────────────────────────────────────────────
mkdirSync(DESTINO, { recursive: true })
console.log(`\n═══ CONVIRTIENDO ═══`)
let ok = 0, fallo = 0, t0 = Date.now()
archivos.forEach((a, i) => {
  const salida = join(DESTINO, basename(a.nombre, extname(a.nombre)) + '.mp4')
  if (existsSync(salida)) { console.log(`  [${i + 1}/${archivos.length}] ${a.nombre} — ya estaba, salteado`); ok++; return }
  process.stdout.write(`  [${i + 1}/${archivos.length}] ${a.nombre} ... `)
  const t = Date.now()
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', a.ruta,
    '-vf', `scale=-2:${ALTO}`, '-c:v', encoder, ...extraArgs, '-pix_fmt', 'yuv420p',
    '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', salida], { stdio: ['ignore', 'ignore', 'pipe'] })
  if (r.status === 0) {
    const nuevo = statSync(salida).size
    console.log(`✓ ${GB(a.size)} → ${GB(nuevo)}  (${Math.round((Date.now() - t) / 1000)}s)`)
    ok++
  } else {
    console.log(`✗ ERROR: ${(r.stderr || '').toString().trim().split('\n').slice(-1)[0]}`)
    fallo++
  }
})

const finales = existsSync(DESTINO) ? readdirSync(DESTINO).reduce((s, f) => s + statSync(join(DESTINO, f)).size, 0) : 0
console.log(`\n████ LISTO · ${ok} convertidos${fallo ? ` · ${fallo} con error` : ''} · ${Math.round((Date.now() - t0) / 60000)} min`)
console.log(`  ${GB(pesoTotal)} → ${GB(finales)}`)
console.log(`  Subí ${DESTINO} a Drive y pasale ESA carpeta al editor.\n`)
