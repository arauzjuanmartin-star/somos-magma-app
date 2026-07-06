import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})

const HEADERS=['Comercio','Persona','Tarjeta','Categoria','Monto cuota','Cuota actual','Cuotas total','Mes base','Año base','Estado','Notas']
// [Comercio, Persona, Tarjeta, Categoria, MontoCuota, CuotaActual, CuotasTotal] — base julio/2026 (vto 13/07)
const CUOTAS=[
  ['AILES SA (grande)','Juan','Santander Visa','Personal',304148.88,6,9],
  ['AILES SA (chica)','Juan','Santander Visa','Personal',26666.11,4,9],
  ['Chipote','Juan','Santander Visa','Personal',6177.84,1,9],
  ['DF Festival','Juan','Santander Visa','Personal',107500,1,6],
  ['Bidcom','Magma','Master Galicia','Empresa',32349.66,2,3],
  ['Rouge','Juan','BBVA Visa','Personal',45000,3,9],
  ['Chipote (BBVA)','Juan','BBVA Visa','Personal',2666.66,3,6],
  ['Topper','Juan','BBVA Visa','Personal',26033,2,3],
  ['PasajesCDP','Juan','BBVA Visa','Personal',59756.66,2,3],
  ['Equus','Juan','BBVA Visa','Personal',64616.62,2,6],
  ['MercadoLibre','Magma','BBVA Visa','Empresa',28498.50,2,6],
  ['Svccomar','Magma','BBVA Visa','Empresa',24405.32,1,6],
  ['Gamestation','Magma','BBVA Visa','Empresa',51416.50,1,6],
  ['GangaHome','Magma','BBVA Visa','Empresa',20150.88,3,9],
  ['Florian','Sofi','BBVA Visa','Personal',46325,3,12],
  ['Luboloque','Sofi','BBVA Visa','Personal',8333.33,3,6],
  ['47 Street','Sofi','BBVA Visa','Personal',23091.38,2,6],
  ['Zara','Sofi','BBVA Visa','Personal',36550.96,2,3],
  ['Las Pepas','Sofi','BBVA Visa','Personal',59966.66,2,3],
  ['Toyota','Sofi','BBVA Visa','Personal',158329.18,2,3],
  ['Mishka','Sofi','BBVA Visa','Personal',67465.59,1,6],
].map(c=>[...c,7,2026,'Activa',''])

const meta=await sheets.spreadsheets.get({spreadsheetId:SHEET_ID,fields:'sheets(properties(title))'})
const existe=meta.data.sheets.some(s=>s.properties.title==='CUOTAS')
if(!existe){
  await sheets.spreadsheets.batchUpdate({spreadsheetId:SHEET_ID,requestBody:{requests:[{addSheet:{properties:{title:'CUOTAS',gridProperties:{rowCount:500,columnCount:11}}}}]}})
  console.log('✓ solapa CUOTAS creada')
} else { console.log('solapa CUOTAS ya existe') }

// headers
await sheets.spreadsheets.values.update({spreadsheetId:SHEET_ID,range:'CUOTAS!A1:K1',valueInputOption:'RAW',requestBody:{values:[HEADERS]}})
// dedup: si ya hay filas cargadas por este script (mismas 21), no duplicar
const cur=(await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'CUOTAS!A:A'})).data.values||[]
if(cur.length>1){ console.log(`ya hay ${cur.length-1} cuotas cargadas — no agrego (borralas si querés recargar)`) }
else {
  await sheets.spreadsheets.values.append({spreadsheetId:SHEET_ID,range:'CUOTAS!A:K',valueInputOption:'USER_ENTERED',insertDataOption:'INSERT_ROWS',requestBody:{values:CUOTAS}})
  console.log(`✓ ${CUOTAS.length} cuotas cargadas`)
}
const tp=p=>CUOTAS.filter(c=>c[1]===p).reduce((s,c)=>s+c[4]*(c[6]-c[5]),0)
console.log(`Compromiso futuro: Juan $${Math.round(tp('Juan')).toLocaleString('es-AR')} · Sofi $${Math.round(tp('Sofi')).toLocaleString('es-AR')} · Magma $${Math.round(tp('Magma')).toLocaleString('es-AR')}`)
