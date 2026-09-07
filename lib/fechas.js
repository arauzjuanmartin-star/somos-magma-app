// Las fechas de un evento viven en TRES columnas de PRESUPUESTOS:
//   Fecha Evento (la primera) · Tipo Fechas (dia/rango/multi) · Fechas Adicionales
// Adentro de la app se trabaja con una lista simple de días ISO y estas dos
// funciones traducen a/desde el sheet. El tipo NO se elige a mano: sale solo de
// la selección — días seguidos son un "rango" (el PDF dice "del 12 al 15") y
// salteados son "multi". Así el Calendar y el PDF siguen leyendo lo de siempre.

const pad = n => String(n).padStart(2, '0')
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

export const isoADMY = iso => { const m = String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '' }
export const dmyAISO = dmy => {
  const s = String(dmy||'').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return ''
  return `${m[3].length===2?'20'+m[3]:m[3]}-${pad(m[2])}-${pad(m[1])}`
}

// Aritmética en UTC: sumarle un día a mano se rompe con el cambio de hora.
const aUTC = iso => { const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? Date.UTC(+m[1], +m[2]-1, +m[3]) : NaN }
export const sumarDias = (iso, n) => new Date(aUTC(iso) + n*864e5).toISOString().slice(0,10)
const seguidos = (a, b) => aUTC(b) - aUTC(a) === 864e5

// lista de días ISO → lo que va al sheet
export function codificarFechas(dias) {
  const l = [...new Set((dias||[]).filter(Boolean))].sort()
  if (!l.length) return { fechaEvento:'', tipo:'dia', adicionales:'', cant:0 }
  const fechaEvento = isoADMY(l[0])
  if (l.length === 1) return { fechaEvento, tipo:'dia', adicionales:'', cant:1 }
  const corridos = l.every((d,i) => i===0 || seguidos(l[i-1], d))
  if (corridos) return { fechaEvento, tipo:'rango', adicionales:isoADMY(l[l.length-1]), cant:l.length }
  return { fechaEvento, tipo:'multi', adicionales:l.slice(1).map(isoADMY).join('|'), cant:l.length }
}

// lo que hay en el sheet → lista de días ISO
export function decodificarFechas(fechaEvento, tipo, adicionales) {
  const f0 = dmyAISO(fechaEvento)
  if (!f0) return []
  const t = String(tipo||'').toLowerCase().trim(), ad = String(adicionales||'').trim()
  if (t === 'rango' && ad) {
    const f1 = dmyAISO(ad)
    if (!f1 || f1 < f0) return [f0]
    const out = []
    for (let d = f0, i = 0; d <= f1 && i < 400; d = sumarDias(d, 1), i++) out.push(d)
    return out
  }
  if (t === 'multi' && ad) return [...new Set([f0, ...ad.split('|').map(s => dmyAISO(s.trim())).filter(Boolean)])].sort()
  return [f0]
}

// Texto corto para mostrar debajo del calendario
export function resumenFechas(dias) {
  const l = [...new Set((dias||[]).filter(Boolean))].sort()
  if (!l.length) return 'Sin fecha todavía'
  const dia = iso => +iso.slice(8,10), mes = iso => MESES[+iso.slice(5,7)-1]
  const unMes = l.every(d => d.slice(0,7) === l[0].slice(0,7))
  if (l.length === 1) return `${dia(l[0])} de ${mes(l[0])}`
  const corridos = l.every((d,i) => i===0 || seguidos(l[i-1], d))
  if (corridos && unMes) return `del ${dia(l[0])} al ${dia(l[l.length-1])} de ${mes(l[0])} · ${l.length} días`
  const lista = l.length > 8
    ? l.slice(0,8).map(unMes ? dia : d => `${dia(d)}/${d.slice(5,7)}`).join(', ') + '…'
    : l.map(unMes ? dia : d => `${dia(d)}/${d.slice(5,7)}`).join(', ')
  return `${lista}${unMes ? ' de ' + mes(l[0]) : ''} · ${l.length} fechas`
}
