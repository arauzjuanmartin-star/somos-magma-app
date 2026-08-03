/**
 * Crea el Google Form de captación de leads de Somos Magma y lo comparte con Juan.
 * Corto, fácil de responder, pide el mail sí o sí.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.JWT({email:env.GOOGLE_CLIENT_EMAIL,key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n'),scopes:['https://www.googleapis.com/auth/forms.body','https://www.googleapis.com/auth/drive']})
const forms=google.forms({version:'v1',auth})
const drive=google.drive({version:'v3',auth})

try{
  // 1. crear
  const created=await forms.forms.create({requestBody:{info:{title:'Contanos de tu proyecto — Somos Magma',documentTitle:'Leads Somos Magma'}}})
  const formId=created.data.formId
  console.log('[ok] form creado:', formId)

  // 2. descripción + preguntas
  const requests=[
    {updateFormInfo:{info:{description:'¡Gracias por escribirnos! 🙌 Completá esto en 1 minuto y te contactamos con todo listo para tu evento o proyecto.'},updateMask:'description'}},
    {createItem:{item:{title:'Tu nombre',questionItem:{question:{required:true,textQuestion:{paragraph:false}}}},location:{index:0}}},
    {createItem:{item:{title:'Tu mail',questionItem:{question:{required:true,textQuestion:{paragraph:false}}}},location:{index:1}}},
    {createItem:{item:{title:'Tu teléfono / WhatsApp',questionItem:{question:{required:false,textQuestion:{paragraph:false}}}},location:{index:2}}},
    {createItem:{item:{title:'¿Sos una empresa o una agencia?',questionItem:{question:{required:false,choiceQuestion:{type:'RADIO',options:[{value:'Agencia / productora'},{value:'Marca / empresa directa'},{value:'Otro'}]}}}},location:{index:3}}},
    {createItem:{item:{title:'¿Qué necesitás?',questionItem:{question:{required:false,choiceQuestion:{type:'CHECKBOX',options:[{value:'Video de evento'},{value:'Foto de evento'},{value:'Contenido para redes'},{value:'Edición'},{value:'Drone'},{value:'Otro'}]}}}},location:{index:4}}},
    {createItem:{item:{title:'¿Para qué fecha es?',questionItem:{question:{required:false,dateQuestion:{includeYear:true}}}},location:{index:5}}},
    {createItem:{item:{title:'Contanos un poco más (opcional)',questionItem:{question:{required:false,textQuestion:{paragraph:true}}}},location:{index:6}}},
  ]
  await forms.forms.batchUpdate({formId,requestBody:{requests}})
  console.log('[ok] preguntas cargadas')

  // 3. compartir con Juan
  for(const mail of ['juan@somosmagma.com','arauzjuanmartin@gmail.com']){
    try{ await drive.permissions.create({fileId:formId,sendNotificationEmail:false,requestBody:{role:'writer',type:'user',emailAddress:mail}}); console.log('[ok] compartido con',mail) }
    catch(e){ console.log('[..] no pude compartir con',mail,':',e.message?.slice(0,60)) }
  }

  const f=await forms.forms.get({formId})
  console.log('\n===== LINKS =====')
  console.log('  Para responder (poné este en WhatsApp):', f.data.responderUri)
  console.log('  Para editar / ver respuestas:', `https://docs.google.com/forms/d/${formId}/edit`)
}catch(e){
  console.error('\n[X] Falló:', e.message)
  if(/not.*enabled|forms.*api|SERVICE_DISABLED|403/i.test(e.message)) console.error('    → La Forms API no está habilitada en el proyecto de Google Cloud. Hay que habilitarla, o lo creo distinto.')
  process.exit(1)
}
