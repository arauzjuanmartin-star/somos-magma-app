import { getAllData } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

// Los usuarios de acceso parcial (ej: Dani, que solo edita) reciben un recorte:
// las solapas que necesitan sus módulos y SIN ninguna columna de plata.
// Si no filtráramos acá, alcanzaba con mirar la respuesta de /api/data en el
// navegador para ver sueldos, márgenes y facturación.
const ES_PLATA = /precio|total|fee|subtotal|ganancias|iibb|inter[eé]s|ajuste|diferencia|monto|comisi[oó]n|costo|saldo|cbu|cuit|alias|banco/i
const sinPlata = filas => (filas || []).map(f => {
  const o = {}
  Object.keys(f).forEach(k => { if (!ES_PLATA.test(k)) o[k] = f[k] })
  return o
})

function filtrarPorModulos(data, modulos) {
  const out = { listado: data.listado }
  if (modulos.includes('edicion')) out.edicion = data.edicion
  if (modulos.includes('edicion') || modulos.includes('calendario')) {
    out.proyectos = sinPlata(data.proyectos)
    out.presupuestos = sinPlata(data.presupuestos)
    out.rrhh = (data.rrhh || []).map(r => ({ 'Nombre Apellido': r['Nombre Apellido'], Nombre: r.Nombre, Rubro: r.Rubro, Mail: r.Mail }))
  }
  return out
}

// Cache en memoria del proceso (vive lo que vive el lambda en Vercel)
// Reduce drásticamente las llamadas a Sheets API entre usuarios concurrentes.
let cacheData = null
let cacheTime = 0
const CACHE_MS = 30 * 1000  // 30 segundos

export default async function handler(req, res) {
  const auth = await requireAuth(req, res)
  if (!auth) return

  try {
    const forzar = req.query.fresh === '1' || req.query.refresh === '1'
    const ahora = Date.now()
    const expirado = ahora - cacheTime > CACHE_MS

    let data, fuente
    if (!forzar && cacheData && !expirado) {
      data = cacheData
      fuente = 'cache'
    } else {
      data = await getAllData()
      cacheData = data
      cacheTime = ahora
      fuente = 'fresh'
    }

    res.setHeader('Cache-Control', 'no-store, must-revalidate')
    res.setHeader('X-Cache-Source', fuente)
    res.setHeader('X-Cache-Age', String(Math.round((ahora - cacheTime) / 1000)))
    const salida = auth.modulos ? filtrarPorModulos(data, auth.modulos) : data
    res.status(200).json({ ok: true, data: salida, modulos: auth.modulos || null })
  } catch (err) {
    console.error(err)
    const status = err.code || err.response?.status
    if (status === 429) {
      if (cacheData) {
        res.setHeader('X-Cache-Source', 'stale-by-quota')
        const stale = auth.modulos ? filtrarPorModulos(cacheData, auth.modulos) : cacheData
        return res.status(200).json({ ok: true, data: stale, modulos: auth.modulos || null, warning: 'Datos desde cache (quota excedida)' })
      }
      return res.status(429).json({ ok: false, error: 'Google está limitando los pedidos. Esperá 30 segundos.' })
    }
    res.status(500).json({ ok: false, error: err.message })
  }
}
