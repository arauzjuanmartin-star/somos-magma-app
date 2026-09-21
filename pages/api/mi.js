import { getServerSession } from 'next-auth/next'
import { authOptions, ALLOWED_MAILS, READONLY_MAILS } from './auth/[...nextauth]'
import { getAllData } from '../../lib/sheets'
import { modulosDe } from '../../lib/roles'
import { misDatos, personaPorMail } from '../../lib/mi-magma'

// "Mi Magma": lo de UNA persona, y nada más. No usa requireAuth a propósito: ese helper
// es la puerta del equipo y rechaza a cualquiera que no esté en la lista fija — que es
// justo lo que queremos para todos los demás endpoints. Esta es la única puerta de los
// freelancers, y tiene su propia regla:
//
//   · la persona sale del MAIL DE LA SESIÓN cruzado con RRHH, nunca de algo que mande
//     el navegador. No hay forma de pedir "lo de otro".
//   · la única excepción es el equipo con acceso completo (Juan, Sofi, Tom, Lulu, Flor),
//     que puede mirar el espacio de cualquiera con ?como=Nombre para ver qué ve cada uno.
//   · se vuelve a mirar RRHH en cada pedido: si a alguien se le saca el mail de la ficha,
//     deja de ver datos aunque tenga la sesión abierta.
let cache = null, cacheT = 0
const CACHE_MS = 60 * 1000

export default async function handler(req, res) {
  if ((req.method || 'GET').toUpperCase() !== 'GET') return res.status(405).json({ ok: false, error: 'Solo lectura' })
  const session = await getServerSession(req, res, authOptions)
  const mail = session?.user?.email?.toLowerCase()?.trim()
  if (!mail) return res.status(401).json({ ok: false, error: 'No autorizado' })

  try {
    if (!cache || Date.now() - cacheT > CACHE_MS) { cache = await getAllData(); cacheT = Date.now() }
    const data = cache
    const esEquipo = ALLOWED_MAILS.includes(mail) && !modulosDe(mail) && !READONLY_MAILS.includes(mail)

    let fila = null
    const como = String(req.query.como || '').trim()
    if (como && esEquipo) fila = (data.rrhh || []).find(r => String(r['Nombre Apellido'] || '').trim() === como) || null
    else fila = personaPorMail(data.rrhh, mail)

    res.setHeader('Cache-Control', 'no-store, must-revalidate')
    // El equipo puede elegir a quién mirar: le mandamos la lista de nombres (solo nombres).
    const personas = esEquipo ? [...new Set((data.rrhh || []).map(r => String(r['Nombre Apellido'] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')) : undefined
    if (!fila) return res.status(esEquipo ? 200 : 403).json({ ok: false, personas, error: esEquipo ? 'Elegí a quién querés ver' : 'Tu mail no está en tu ficha de Magma. Pedile a administración que lo cargue.' })

    const mio = misDatos(data, fila['Nombre Apellido'])
    if (!mio) return res.status(403).json({ ok: false, error: 'No hay nada para mostrar' })
    res.status(200).json({ ok: true, ...mio, viendoComo: como && esEquipo ? fila['Nombre Apellido'] : undefined, personas })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, error: 'No pudimos leer los datos. Probá de nuevo en un minuto.' })
  }
}
