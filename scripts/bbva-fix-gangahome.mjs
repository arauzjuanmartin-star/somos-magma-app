import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const colL=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)}return s}
const mr=await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'MOVIMIENTOS_TARJETA!A:L'})
const rows=mr.data.values||[]
const idx=rows.findIndex((r,i)=> i>0 && /bbva/i.test(r[0]||'') && String(r[1]).trim()==='6' && /gangahome/i.test(r[5]||''))
if(idx<0){ console.log('no encontré GangaHome'); process.exit(0) }
const fila=idx+1
await sheets.spreadsheets.values.batchUpdate({spreadsheetId:SHEET_ID,requestBody:{valueInputOption:'USER_ENTERED',data:[
  {range:`MOVIMIENTOS_TARJETA!${colL(4)}${fila}`,values:[['Magma']]},
  {range:`MOVIMIENTOS_TARJETA!${colL(8)}${fila}`,values:[['Empresa']]},
  {range:`MOVIMIENTOS_TARJETA!${colL(9)}${fila}`,values:[['Compras · Mercado Libre']]},
]}})
console.log(`✓ GangaHome (fila ${fila}) → Magma/Empresa`)
const b6=(await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'MOVIMIENTOS_TARJETA!A:L'})).data.values.filter((r,i)=>i>0 && /bbva/i.test(r[0]||'') && String(r[1]).trim()==='6')
const per=d=>b6.filter(r=>r[6]==='ARS'&&r[8]==='Personal'&&r[4]===d).reduce((a,r)=>a+Number(r[7]),0)
const mag=b6.filter(r=>r[6]==='ARS'&&r[8]==='Empresa').reduce((a,r)=>a+Number(r[7]),0)
const tot=b6.filter(r=>r[6]==='ARS').reduce((a,r)=>a+Number(r[7]),0)
console.log(`Juan $${per('Juan').toLocaleString('es-AR')} · Sofi $${per('Sofi').toLocaleString('es-AR')} · Magma $${mag.toLocaleString('es-AR')} · Σ $${tot.toLocaleString('es-AR')}`)
