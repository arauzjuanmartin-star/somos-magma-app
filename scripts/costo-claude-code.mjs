/**
 * ¿Cuánto vale lo que consumís en Claude Code? — para saber si el abono rinde.
 * Lee los transcripts locales (~/.claude/projects) y los valúa a precio de API.
 * No toca el sheet. Uso: node scripts/costo-claude-code.mjs
 */
import fs from 'fs'
import path from 'path'
import os from 'os'

const root = path.join(os.homedir(), '.claude', 'projects')
// USD por millón de tokens (claude.com/pricing, verificado 27/08/2026)
const P = {
  opus:   { in: 5, out: 25, cw: 6.25, cr: 0.50 },
  sonnet: { in: 3, out: 15, cw: 3.75, cr: 0.30 },
  haiku:  { in: 1, out: 5,  cw: 1.25, cr: 0.10 },
}
const tarifa = m => /opus/.test(m) ? P.opus : /sonnet/.test(m) ? P.sonnet : /haiku/.test(m) ? P.haiku : null
const costo = (m, u) => {
  const p = tarifa(m); if (!p) return 0
  return ((u.input_tokens||0)*p.in + (u.output_tokens||0)*p.out
        + (u.cache_creation_input_tokens||0)*p.cw + (u.cache_read_input_tokens||0)*p.cr) / 1e6
}

const archivos = []
;(function recorrer(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) recorrer(p)
    else if (e.name.endsWith('.jsonl')) archivos.push(p)
  }
})(root)

const porMes = {}, porDia = {}, porModelo = {}
for (const f of archivos) {
  let lineas
  try { lineas = fs.readFileSync(f, 'utf8').split('\n') } catch { continue }
  for (const l of lineas) {
    if (!l.trim()) continue
    let j; try { j = JSON.parse(l) } catch { continue }
    const u = j?.message?.usage; if (!u) continue
    const m = j?.message?.model || 'desconocido'
    const dia = (j.timestamp || '').slice(0, 10); if (!dia) continue
    const c = costo(m, u)
    porDia[dia] = (porDia[dia] || 0) + c
    porMes[dia.slice(0, 7)] = (porMes[dia.slice(0, 7)] || 0) + c
    porModelo[m] = porModelo[m] || { c: 0, out: 0, cr: 0 }
    porModelo[m].c += c
    porModelo[m].out += u.output_tokens || 0
    porModelo[m].cr += u.cache_read_input_tokens || 0
  }
}

const dias = Object.keys(porDia).sort()
const usd = n => 'USD ' + n.toFixed(2).padStart(9)
console.log(`\nRango en disco: ${dias[0]} → ${dias.at(-1)}  (${dias.length} días activos)`)
console.log(`OJO: solo Claude Code en esta máquina. No cuenta claude.ai web ni la app de escritorio.\n`)

console.log('POR MES')
for (const [mes, c] of Object.entries(porMes).sort()) {
  const activos = dias.filter(d => d.startsWith(mes)).length
  console.log(`  ${mes}   ${usd(c)}   (${activos} días activos)`)
}

console.log('\nPOR MODELO')
const fmt = n => n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
for (const [m, t] of Object.entries(porModelo).sort((a, b) => b[1].c - a[1].c)) {
  if (!t.c) continue
  console.log(`  ${m.padEnd(28)} ${usd(t.c)}   output: ${fmt(t.out).padStart(12)}   cache leído: ${fmt(t.cr).padStart(14)}`)
}

console.log('\nLOS 5 DÍAS MÁS CAROS')
Object.entries(porDia).sort((a, b) => b[1] - a[1]).slice(0, 5)
  .forEach(([d, c]) => console.log(`  ${d}   ${usd(c)}`))

const total = Object.values(porMes).reduce((a, b) => a + b, 0)
const meses = Object.keys(porMes).length
console.log(`\nTOTAL ${usd(total)}   ·   promedio ${usd(total / meses)} por mes`)
console.log(`El Max 20x sale USD 200/mes → rinde ${((total / meses) / 200).toFixed(1)} a 1.\n`)
