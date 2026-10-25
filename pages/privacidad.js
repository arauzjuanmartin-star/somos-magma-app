// Política de privacidad pública. Meta la exige para publicar la app de WhatsApp ("Somos Magma mensajes") y la
// web de Magma no tiene una (24/10/2026). Es ruta pública (ver middleware.js): la tiene que poder abrir cualquiera.
// Si se cambia algo de cómo se usan los datos del WhatsApp (lib/whatsapp.js), actualizar acá también.

const T = { bg:'#FBFAF8', ink:'#1A1917', ink2:'#6F6B63', border:'#ECE9E4', brand:'#CE2637' }

function S({titulo, children}){
  return <section style={{marginTop:26}}>
    <h2 style={{fontSize:17, margin:'0 0 8px', fontWeight:700}}>{titulo}</h2>
    <div style={{fontSize:15, lineHeight:1.6, color:T.ink2}}>{children}</div>
  </section>
}

export default function Privacidad(){
  return <div style={{minHeight:'100vh', background:T.bg, color:T.ink, fontFamily:'system-ui,-apple-system,Segoe UI,Roboto,sans-serif'}}>
    <div style={{maxWidth:720, margin:'0 auto', padding:'40px 16px 80px'}}>
      <div style={{width:11, height:11, borderRadius:'50%', background:T.brand}}/>
      <h1 style={{fontSize:28, fontWeight:800, letterSpacing:-.5, margin:'14px 0 4px'}}>Política de privacidad</h1>
      <div style={{fontSize:13.5, color:T.ink2}}>SOMOS MAGMA S.R.L. · CUIT 30-71922802-6 · Ciudad Autónoma de Buenos Aires · Última actualización: 24 de octubre de 2026</div>

      <S titulo="Quiénes somos">
        SOMOS MAGMA es una productora audiovisual de Buenos Aires (fotografía, filmmaking, drone, edición y diseño).
        Esta política explica qué datos recibimos cuando nos escribís por WhatsApp o por nuestros canales de contacto,
        y qué hacemos con ellos.
      </S>

      <S titulo="Qué datos recibimos">
        Cuando nos escribís por WhatsApp recibimos tu número de teléfono, el nombre de tu perfil de WhatsApp, los
        mensajes que nos mandás y la fecha y hora de cada uno. Si nos los das, también los datos de tu pedido: empresa,
        fecha y lugar del evento, y un mail de contacto.
      </S>

      <S titulo="Para qué los usamos">
        Solo para contestar tu consulta, armarte un presupuesto y coordinar el trabajo si nos contratás. No los usamos
        para publicidad de terceros, no los vendemos y no los compartimos con nadie fuera de lo que se detalla abajo.
      </S>

      <S titulo="Respuestas automáticas">
        Algunas respuestas de nuestro WhatsApp las escribe un asistente automático con inteligencia artificial
        (Claude, de Anthropic), que lee la conversación para responderte y tomar los datos del pedido. Siempre podés
        pedir hablar con una persona del equipo y te escribe alguien de Magma.
      </S>

      <S titulo="Dónde se guardan y quién los procesa">
        Las conversaciones se guardan en las herramientas internas de Magma (Google Workspace). Para funcionar,
        intervienen estos proveedores, cada uno con su propia política de privacidad: Meta Platforms (WhatsApp Business),
        Google (almacenamiento y correo), Vercel (servidores de nuestra aplicación) y Anthropic (asistente automático).
        Solo el equipo de Magma tiene acceso a tus mensajes.
      </S>

      <S titulo="Cuánto tiempo los guardamos">
        Mientras haya una consulta o un trabajo en curso, y después el tiempo que exijan las obligaciones contables y
        legales de Argentina. Si no hubo trabajo, podés pedirnos que los borremos en cualquier momento.
      </S>

      <S titulo="Tus derechos y cómo borrar tus datos">
        Podés pedirnos ver, corregir o borrar tus datos escribiendo a <a href="mailto:info@somosmagma.com" style={{color:T.brand}}>info@somosmagma.com</a> o
        mandando "borrar mis datos" a nuestro WhatsApp. Lo resolvemos dentro de los 10 días hábiles. Conforme a la Ley
        25.326 de Protección de Datos Personales, la Agencia de Acceso a la Información Pública es el órgano de control
        y atiende las denuncias por incumplimiento.
      </S>

      <S titulo="Contacto">
        SOMOS MAGMA S.R.L. · <a href="mailto:info@somosmagma.com" style={{color:T.brand}}>info@somosmagma.com</a> · <a href="https://somosmagma.com" style={{color:T.brand}}>somosmagma.com</a>
      </S>
    </div>
  </div>
}
