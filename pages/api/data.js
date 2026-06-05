import { getAllData } from '../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

// Cache en memoria del proceso (vive lo que vive el lambda en Vercel)
// Reduce drásticamente las llamadas a Sheets API entre usuarios concurrentes.
let cacheData = null
let cacheTime = 0
const CACHE_MS = 30 * 1000  // 30 segundos

export default async function handler(req, res) {
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

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
    res.status(200).json({ ok: true, data })
  } catch (err) {
    console.error(err)
    const status = err.code || err.response?.status
    if (status === 429) {
      // Si hay cache aunque sea viejo, devolvemos eso en vez de error
      if (cacheData) {
        res.setHeader('X-Cache-Source', 'stale-by-quota')
        return res.status(200).json({ ok: true, data: cacheData, warning: 'Datos desde cache (quota excedida)' })
      }
      return res.status(429).json({ ok: false, error: 'Google está limitando los pedidos. Esperá 30 segundos.' })
    }
    res.status(500).json({ ok: false, error: err.message })
  }
}
