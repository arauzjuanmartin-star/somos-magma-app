import { signIn, useSession } from 'next-auth/react'
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

export default function Login() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const errorParam = router.query.error

  // Si ya está logueado, redirigir al home
  useEffect(() => {
    if (status === 'authenticated') router.replace('/')
  }, [status, router])

  const errorMsg = errorParam === 'AccessDenied'
    ? 'Este mail no está autorizado. Pedí acceso a Juan.'
    : errorParam
    ? 'No pudimos iniciar sesión. Probá de nuevo.'
    : ''

  return <>
    <Head><title>Ingresar | Somos Magma</title></Head>
    <div style={{minHeight:'100vh',background:'#090909',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:'system-ui,sans-serif'}}>
      <div style={{width:'100%',maxWidth:380,background:'#0E0E0E',border:'0.5px solid #1F1F1F',borderRadius:14,padding:'40px 32px 32px',boxShadow:'0 8px 32px #000a'}}>
        <div style={{display:'flex',alignItems:'baseline',gap:6,marginBottom:6,justifyContent:'center'}}>
          <span style={{fontSize:13,color:'#666'}}>somos</span>
          <span style={{fontSize:30,fontWeight:900,color:'#CE2637',letterSpacing:1}}>MAGMA</span>
          <span style={{fontSize:22,color:'#1543F8',fontWeight:700}}>//</span>
        </div>
        <div style={{fontSize:12,color:'#666',marginBottom:30,textAlign:'center'}}>App interna · solo equipo autorizado</div>

        <button onClick={()=>signIn('google',{callbackUrl:'/'})} style={{width:'100%',padding:'12px 16px',background:'#fff',color:'#333',border:'none',borderRadius:8,fontSize:14,fontWeight:500,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:10,boxShadow:'0 2px 6px #0006'}}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Ingresar con Google
        </button>

        {errorMsg && <div style={{marginTop:16,padding:'10px 12px',background:'#E24B4A15',border:'0.5px solid #E24B4A40',borderRadius:6,fontSize:12,color:'#E24B4A'}}>{errorMsg}</div>}

        <div style={{marginTop:24,fontSize:11,color:'#555',textAlign:'center',lineHeight:1.5}}>
          Tu cuenta debe ser uno de los mails autorizados del equipo.<br/>Si no podés entrar, contactá a Juan.
        </div>
      </div>
    </div>
  </>
}
