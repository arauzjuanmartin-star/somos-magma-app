import { getServerSession } from 'next-auth/next'
import { authOptions, ALLOWED_MAILS } from '../pages/api/auth/[...nextauth]'

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
  if (!mail || !ALLOWED_MAILS.includes(mail)) {
    res.status(401).json({ error: 'No autorizado' })
    return null
  }
  return { mail, session }
}

export { ALLOWED_MAILS }
