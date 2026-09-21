// Agrega a RRHH la columna "Acceso Mi Magma": quién puede entrar a su espacio (/mi).
// Juan, 22/9/2026: primero los fijos, y después se va sumando gente. Entonces tener el
// mail cargado no alcanza: entra solo quien tenga SÍ en esta columna (el tilde de su
// ficha en la app escribe acá).
//
// Va AL FINAL a propósito. La regla dice "la columna útil cerca de lo que acompaña", y
// lo natural sería al lado del Mail — pero cinco lugares leen `RRHH!A:D` para sacar el
// mail de los avisos (proyecto-staff, edicion-guardar, calendar-evento, lib/drive,
// drive-acceso-staff) y lib/brief.mjs lee el CBU por posición. Insertarla en el medio
// corre todo y los mails dejan de salir.
//
//   node scripts/rrhh-columna-acceso.mjs                         → preview
//   node scripts/rrhh-columna-acceso.mjs --dar="Nombre Exacto, Otro Nombre"   → preview con a quiénes se les daría
//   ... --escribir                                               → aplica
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const ESCRIBIR=process.argv.includes('--escribir')
const DAR=(process.argv.find(a=>a.startsWith('--dar='))||'').slice(6).split(',').map(s=>s.trim()).filter(Boolean)
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:[ESCRIBIR?'https://www.googleapis.com/auth/spreadsheets':'https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'; const HEADER='Acceso Mi Magma'
const colLetra=n=>{let s='';n++;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=(n-m-1)/26}return s}
const meta=await sheets.spreadsheets.get({spreadsheetId:ID,ranges:['RRHH'],fields:'sheets(properties(sheetId,gridProperties(columnCount,rowCount)),basicFilter)'})
const hoja=meta.data.sheets[0]; const sheetId=hoja.properties.sheetId
const rows=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'RRHH!A:Z'})).data.values||[]
const H=rows[0]||[]; const i=H.indexOf(HEADER); const destino=i>-1?i:H.length
const iNom=H.indexOf('Nombre Apellido'), iMail=H.indexOf('Mail')
console.log(`RRHH: ${H.length} columnas (${H.join(' | ')})`)
console.log(`"${HEADER}" ${i>-1?'ya existe en '+colLetra(i):'se agrega en '+colLetra(destino)+' (al final)'} · desplegable: SÍ / vacío`)
const yaTienen=i>-1?rows.slice(1).filter(r=>/^s[ií]$/i.test(String(r[i]||'').trim())).map(r=>r[iNom]):[]
if(yaTienen.length) console.log(`Hoy tienen acceso: ${yaTienen.join(', ')}`)
const cambios=[]
for(const n of DAR){ const k=rows.findIndex((r,j)=>j>0&&String(r[iNom]||'').trim()===n)
  if(k<0){ console.log(`  ✗ "${n}" no está en RRHH con ese nombre exacto — no se toca`); continue }
  const mail=String(rows[k][iMail]||'').trim()
  console.log(`  ${mail?'✓':'⚠'} ${n} → fila ${k+1} · ${mail?(/@(gmail\.com|somosmagma\.com)$/i.test(mail)?'mail de Google':'mail que NO es Gmail: '+mail.split('@')[1]):'SIN MAIL: no va a poder entrar hasta que se cargue'}`)
  cambios.push({range:`RRHH!${colLetra(destino)}${k+1}`,values:[['SÍ']]}) }
if(!ESCRIBIR){ console.log('\n👀 PREVIEW — nada se escribió. Corré con --escribir para aplicar.'); process.exit(0) }
if(i<0){
  const reqs=[]
  if(hoja.properties.gridProperties.columnCount<=destino) reqs.push({appendDimension:{sheetId,dimension:'COLUMNS',length:destino-hoja.properties.gridProperties.columnCount+1}})
  reqs.push({updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:destino,endIndex:destino+1},properties:{pixelSize:130},fields:'pixelSize'}})
  // Desplegable SÍ / vacío: para el que lo carga a mano en el sheet.
  reqs.push({setDataValidation:{range:{sheetId,startRowIndex:1,endRowIndex:Math.max(300,rows.length+100),startColumnIndex:destino,endColumnIndex:destino+1},rule:{condition:{type:'ONE_OF_LIST',values:[{userEnteredValue:'SÍ'}]},showCustomUi:true,strict:false}}})
  // Sin esto la columna existe pero no aparece en el desplegable del filtro.
  if(hoja.basicFilter){ const bf=JSON.parse(JSON.stringify(hoja.basicFilter)); bf.range.endColumnIndex=Math.max(bf.range.endColumnIndex||0,destino+1); reqs.push({setBasicFilter:{filter:bf}}) }
  await sheets.spreadsheets.batchUpdate({spreadsheetId:ID,requestBody:{requests:reqs}})
  await sheets.spreadsheets.values.update({spreadsheetId:ID,range:`RRHH!${colLetra(destino)}1`,valueInputOption:'USER_ENTERED',requestBody:{values:[[HEADER]]}})
}
if(cambios.length) await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data:cambios}})
// Verificación: la columna quedó donde dijimos y los datos de al lado no se corrieron.
const v=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'RRHH!A:Z'})).data.values
console.log(`✓ "${HEADER}" en ${colLetra(v[0].indexOf(HEADER))} · Mail sigue en ${colLetra(v[0].indexOf('Mail'))} · con acceso: ${v.slice(1).filter(r=>/^s[ií]$/i.test(String(r[v[0].indexOf(HEADER)]||'').trim())).map(r=>r[iNom]).join(', ')||'nadie'}`)
