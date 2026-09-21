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
  // Freelancers con acceso al tablero de Edición, limitados a sus propios
  // trabajos (ver SOLO_LO_SUYO en lib/roles.js).
  'barcevarela@gmail.com',   // Bruno Arce
]

// Acceso PARCIAL: quién ve solo algunos módulos vive en lib/roles.js (archivo
// puro, para que el middleware edge lo pueda importar). Dani edita: entra al
// tablero de Edición y al Calendario, nada más — no ve plata, facturación ni pagos.
export { MODULOS_POR_MAIL } from '../../../lib/roles'
import { MODULOS_POR_MAIL as MODS } from '../../../lib/roles'
import { freelancerPorMail } from '../../../lib/freelancers-acceso'

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
      if (ALLOWED_MAILS.includes(mail) || READONLY_MAILS.includes(mail)) return true
      // Freelancers: entran con el mail que Magma tiene en su ficha de RRHH, y lo único
      // que pueden abrir es /mi (lo cierra el middleware) con sus propios datos (/api/mi).
      // Si RRHH no se puede leer, no entra nadie: ante la duda, puerta cerrada.
      try { return !!(await freelancerPorMail(mail)) } catch (e) { console.error('login freelancer', e); return false }
    },
    // La marca queda en el token al entrar. El middleware (edge) no puede leer el sheet:
    // con esto sabe que a esta persona solo le corresponde /mi.
    async jwt({ token, user }) {
      if (user) {
        const mail = (user.email || '').toLowerCase().trim()
        token.freelancer = !ALLOWED_MAILS.includes(mail) && !READONLY_MAILS.includes(mail)
      }
      return token
    },
    async session({ session, token }) {
      // Asegurarse que email viene normalizado
      if (session?.user?.email) {
        session.user.email = session.user.email.toLowerCase().trim()
        session.user.readOnly = READONLY_MAILS.includes(session.user.email)
        session.user.modulos = MODS[session.user.email] || null  // null = ve todo
        session.user.freelancer = !!token?.freelancer
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
