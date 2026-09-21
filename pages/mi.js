// /mi — "Mi Magma": la página de cada freelancer. Entra con el mail de su ficha de RRHH
// (Google), y lo único que puede abrir es esto (lo cierra middleware.js). Los datos
// vienen ya recortados de /api/mi: acá no llega nada que no sea de quien está mirando.
//
// El equipo con acceso completo también puede entrar, para ver qué ve cada uno.

import { useEffect, useState } from 'react'
import Head from 'next/head'
import { useSession, signOut } from 'next-auth/react'
import { T } from '../lib/ui'
import MiMagma from '../components/MiMagma'

export default function Mi() {
  const { status } = useSession()
  const [r, setR] = useState(null)       // respuesta de /api/mi
  const [como, setComo] = useState('')   // solo equipo: a quién está mirando
  const [error, setError] = useState('')

  useEffect(() => {
    if (status !== 'authenticated') return
    let vivo = true
    setError('')
    fetch('/api/mi' + (como ? `?como=${encodeURIComponent(como)}` : ''))
      .then(x => x.json()).then(j => { if (vivo) { setR(j); if (!j.ok && !j.personas) setError(j.error || 'No pudimos cargar tus datos') } })
      .catch(() => { if (vivo) setError('Sin conexión. Probá de nuevo.') })
    return () => { vivo = false }
  }, [status, como])

  return <>
    <Head>
      <title>Mi Magma</title>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="theme-color" content={T.bg} />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Azeret+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    </Head>
    <style jsx global>{`
      * { box-sizing: border-box; }
      html, body { margin:0; padding:0; background:${T.bg}; font-family:'Archivo', -apple-system, system-ui, sans-serif; color:${T.ink}; -webkit-font-smoothing:antialiased; }
      button, input, select { font-family: inherit; }
    `}</style>

    {/* Solo el equipo: elegir a quién mirar. A un freelancer esto no le llega (no recibe `personas`). */}
    {r?.personas && <div style={{ background: T.ink, color: '#fff', padding: '9px 14px', fontSize: 12.5, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
      <span>Estás mirando como equipo. Ver el espacio de:</span>
      <select value={como} onChange={e => setComo(e.target.value)} style={{ padding: '5px 8px', borderRadius: 7, border: 'none', fontSize: 12.5, maxWidth: 240 }}>
        <option value="">— yo —</option>
        {r.personas.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <a href="/" style={{ color: '#fff', opacity: 0.7 }}>volver a la app</a>
    </div>}

    {status === 'loading' || (status === 'authenticated' && !r && !error)
      ? <Centro>Cargando…</Centro>
      : error ? <Centro>{error}<br /><button onClick={() => signOut({ callbackUrl: '/login' })} style={{ marginTop: 16, padding: '9px 16px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer' }}>Entrar con otra cuenta</button></Centro>
      : r?.ok ? <MiMagma key={r.quien} datos={r} onSalir={r.viendoComo ? null : () => signOut({ callbackUrl: '/login' })} />
      : <Centro>{r?.error || 'Elegí a quién querés ver'}</Centro>}
  </>
}

function Centro({ children }) {
  return <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24, color: T.ink2, fontSize: 14, lineHeight: 1.5 }}><div>{children}</div></div>
}
