import { getServerSession } from 'next-auth/next'
import { authOptions, ALLOWED_MAILS, READONLY_MAILS } from '../pages/api/auth/[...nextauth]'
import { modulosDe } from './roles'

// Qué endpoints puede tocar cada módulo, para los usuarios de acceso parcial.
// Cualquier POST fuera de esta lista se rechaza aunque el mail esté autorizado.
const ENDPOINTS_POR_MODULO = {
  edicion:    ['edicion-guardar','edicion-sync','edicion-info','drive-carpeta','drive-crudo-cliente','data'],
  calendario: ['data','calendar-evento'],
}

/**
 * Valida que la request tenga una sesión NextAuth de un mail autorizado.
 * Reemplaza al chequeo viejo de `x-user-email` (que era spoofeable).
 *
 * Uso típico en endpoints:
 *   const auth = await requireAuth(req, res)
 *   if (!auth) return  // ya envió 401
 *   const mail = auth.mail
 *
 * Devuelve null si la respuesta ya fue enviada (401). Devuelve {mail, session} si OK.
 */
export async function requireAuth(req, res) {
  const session = await getServerSession(req, res, authOptions)
  const mail = session?.user?.email?.toLowerCase()?.trim()
  const isReadonly = !!mail && READONLY_MAILS.includes(mail)
  if (!mail || (!ALLOWED_MAILS.includes(mail) && !isReadonly)) {
    res.status(401).json({ error: 'No autorizado' })
    return null
  }
  // Invitado en modo lectura: solo GET; cualquier mutación (POST/PUT/DELETE) se rechaza
  if (isReadonly && (req.method || 'GET').toUpperCase() !== 'GET') {
    res.status(403).json({ error: 'Modo lectura: no tenés permiso para modificar' })
    return null
  }

  // Acceso parcial (ej: Dani solo Edición + Calendario): el endpoint tiene que
  // pertenecer a alguno de sus módulos. Vale también para los GET, así no puede
  // pedir /api/data de otro módulo ni leer endpoints de plata.
  const modulos = modulosDe(mail)
  if (modulos) {
    const endpoint = String(req.url || '').split('?')[0].replace(/^\/api\//, '').replace(/\/$/, '')
    const permitidos = new Set(modulos.flatMap(m => ENDPOINTS_POR_MODULO[m] || []))
    if (!permitidos.has(endpoint)) {
      res.status(403).json({ error: 'No tenés acceso a esta parte de la app' })
      return null
    }
  }

  return { mail, session, readOnly: isReadonly, modulos }
}

export { ALLOWED_MAILS }
