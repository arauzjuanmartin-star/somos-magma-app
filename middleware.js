import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Rutas públicas (no requieren sesión)
const PUBLIC_PATHS = [
  '/login',
  '/api/auth',  // todas las rutas de /api/auth/* (signin, callback, etc)
  '/_next',
  '/favicon.ico',
  '/web.html',  // preview público de la web nueva (para Sofi/equipo, sin login)
]

function isPublic(pathname) {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?'))
}

export async function middleware(req) {
  const { pathname } = req.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

  // Si no hay token: páginas → redirect a /login, APIs → 401 JSON
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

// Match TODOS los paths excepto los estáticos de Next y favicon
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
