import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

// Mails autorizados — únicos que pueden entrar a la app.
// Mantener sincronizado con la lista de MAILS en endpoints + index.js
export const ALLOWED_MAILS = [
  'juan@somosmagma.com',
  'sofi@somosmagma.com',
  'tom@somosmagma.com',
  'admin@somosmagma.com',
  'lulu@somosmagma.com',
  'dani@somosmagma.com',
  'arauzjuanmartin@gmail.com',
]

// Acceso PARCIAL: quién ve solo algunos módulos vive en lib/roles.js (archivo
// puro, para que el middleware edge lo pueda importar). Dani edita: entra al
// tablero de Edición y al Calendario, nada más — no ve plata, facturación ni pagos.
export { MODULOS_POR_MAIL } from '../../../lib/roles'
import { MODULOS_POR_MAIL as MODS } from '../../../lib/roles'

// Invitados en modo LECTURA: pueden entrar y ver todo, pero no modificar nada. Ej: coach.
export const READONLY_MAILS = [
  'info@marianatardito.com',
  'marianatardito@gmail.com',
]

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      authorization: { params: { prompt: 'select_account' } },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const mail = (user?.email || '').toLowerCase().trim()
      if (!ALLOWED_MAILS.includes(mail) && !READONLY_MAILS.includes(mail)) {
        // Rechaza el login si el mail no está en ninguna lista
        return false
      }
      return true
    },
    async session({ session }) {
      // Asegurarse que email viene normalizado
      if (session?.user?.email) {
        session.user.email = session.user.email.toLowerCase().trim()
        session.user.readOnly = READONLY_MAILS.includes(session.user.email)
        session.user.modulos = MODS[session.user.email] || null  // null = ve todo
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: { strategy: 'jwt' },
}

export default NextAuth(authOptions)
