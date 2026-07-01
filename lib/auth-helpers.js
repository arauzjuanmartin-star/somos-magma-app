import { getServerSession } from 'next-auth/next'
import { authOptions, ALLOWED_MAILS, READONLY_MAILS } from '../pages/api/auth/[...nextauth]'

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
  return { mail, session, readOnly: isReadonly }
}

export { ALLOWED_MAILS }
