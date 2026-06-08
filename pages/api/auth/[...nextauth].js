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
  'arauzjuanmartin@gmail.com',
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
      if (!ALLOWED_MAILS.includes(mail)) {
        // Rechaza el login si el mail no está en la whitelist
        return false
      }
      return true
    },
    async session({ session }) {
      // Asegurarse que email viene normalizado
      if (session?.user?.email) {
        session.user.email = session.user.email.toLowerCase().trim()
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
