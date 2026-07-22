/**
 * Lee las respuestas de los formularios de freelancers (fotógrafo/videógrafo y editores)
 * y arma el chequeo de mercado: cuánto cobra cada uno por tipo de servicio.
 * Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})

const FOTO='1ljTQBkzySsfezvXFehxDT93n-zNo4v7yN2JkU-4iAIY'
const EDIT='1hLw5UxRiR6aluHSxeZTBIbdee0ZllmdU60iRSTqFfZ4'
const txt=v=>String(v??'').trim()

for(const [nombre,id] of [['FOTÓGRAFO / VIDEÓGRAFO',FOTO],['EDITORES',EDIT]]){
  console.log(`\n${'='.repeat(78)}\n${nombre}\n${'='.repeat(78)}`)
  try{
    const meta=await sheets.spreadsheets.get({spreadsheetId:id,fields:'sheets(properties(title))'})
    const solapa=meta.data.sheets[0].properties.title
    const r=await sheets.spreadsheets.values.get({spreadsheetId:id,range:`'${solapa}'`,valueRenderOption:'FORMATTED_VALUE'})
    const rows=r.data.values||[]
    if(!rows.length){ console.log('  (sin datos)'); continue }
    const head=rows[0]
    console.log(`solapa: "${solapa}" · ${rows.length-1} respuestas · ${head.length} preguntas\n`)
    console.log('PREGUNTAS:')
    head.forEach((h,i)=>console.log(`  [${i}] ${txt(h)}`))
    console.log(`\n${'-'.repeat(78)}\nRESPUESTAS COMPLETAS:\n`)
    rows.slice(1).forEach((row,n)=>{
      console.log(`\n───── respuesta ${n+1} ─────`)
      head.forEach((h,i)=>{ const v=txt(row[i]); if(v) console.log(`   ${txt(h).slice(0,58)}\n      → ${v}`) })
    })
  }catch(e){ console.log(`  ❌ no se pudo leer: ${e.message.slice(0,120)}`) }
}
