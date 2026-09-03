/**
 * Verifica el DEPLOY REAL de producción (no el build local): baja el bundle de
 * somos-magma-app.vercel.app y confirma que el aumento del 5% y el aviso de jornadas
 * están efectivamente ahí. Solo lectura.
 *
 * Ojo al leer un bundle minificado: los acentos van como escapes hex ("m\xednimo"),
 * no como el carácter. Buscar el texto tal cual da falsos negativos.
 */
const BASE = 'https://somos-magma-app.vercel.app'
const html = await (await fetch(BASE + '/login')).text()
const paths = new Set([...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map(m => m[1]))
const bm = html.match(/\/_next\/static\/([^/]+)\/_buildManifest\.js/)
if (bm) { const man = await (await fetch(BASE + bm[0])).text()
  ;[...man.matchAll(/"(static\/chunks\/[^"]+\.js)"/g)].forEach(m => paths.add('/_next/' + m[1])) }
let code = ''
for (const p of paths) { try { code += await (await fetch(BASE + p)).text() } catch {} }

console.log(`\n  DEPLOY EN PRODUCCIÓN — ${paths.size} chunks, ${(code.length/1024).toFixed(0)} KB\n`)
let fallas = 0
const chk = (label, ok, extra = '') => { if (!ok) fallas++
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? '   ' + extra : ''}`) }

const feeMult = code.match(/feeAg\?\w\+([\d.]+)\*\(parseFloat/)
chk('el margen se multiplica por 1,086', feeMult?.[1] === '1.086', feeMult ? `→ ×${feeMult[1]}` : 'no encontré el cálculo del fee')
// Minificado queda "ea=x.gan?.35*en:0" — el 35% multiplica al fee, que es la variable
// que acabamos de ver multiplicada por 1,086. Ese encadenado es lo que da el +5% final.
const feeVar = (code.match(/,(\w+)=\w+\.reduce\(\(\w,\w\)=>\w\.feeAg\?/)||[])[1]
chk('Ganancias 35% sobre ese mismo margen', !!feeVar && new RegExp('\\?\\.35\\*'+feeVar+'\\b').test(code), feeVar?`gan = .35 × ${feeVar}`:'')
chk('IIBB 4% sobre ese mismo margen',       !!feeVar && new RegExp('\\?\\.04\\*'+feeVar+'\\b').test(code), feeVar?`iibb = .04 × ${feeVar}`:'')
chk('contador con mínimo — "6/10 del mes"',        code.includes('"/").concat(e.minimo," del mes")') || /\/"\).concat\(\w\.minimo," del mes"\)/.test(code))
chk('contador sin mínimo — "7ª del mes"',          /\\xaa del mes/.test(code))
chk('nota "dentro del mínimo de N"',               /dentro del m\\xednimo de/.test(code))
chk('nota "extra — ya cubrió las N"',              /ya cubri\\xf3 las/.test(code))
chk('nota "por cobertura, sin mínimo"',            /por cobertura, sin m\\xednimo/.test(code))
chk('la tarifa extra se usa pasado el mínimo',     /precioExtra\|\|\w\.precio/.test(code))
chk('edición y viáticos no cuentan como jornada',  /edit\|edici/.test(code) && /vi\[a/.test(code))

const api = await fetch(BASE + '/api/data')
chk('la app responde (401 = pide login, correcto)', api.status === 401 || api.status === 200, `HTTP ${api.status}`)

console.log(fallas === 0
  ? '\n  ✓ TODO EN PRODUCCIÓN\n'
  : `\n  ✗ ${fallas} chequeo(s) sin pasar — el deploy no tiene todo\n`)
process.exit(fallas === 0 ? 0 : 1)
