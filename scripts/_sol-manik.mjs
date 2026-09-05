import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;let s=txt(v).replace(/[^\d.,-]/g,'');if(!s)return 0;if(s.includes(',')&&s.includes('.')){s=s.replace(/,/g,'')}else if(s.includes(',')){s=s.replace(/\./g,'').replace(',','.')}else{s=s.replace(/,/g,'')}const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS!A:CI'],valueRenderOption:'FORMATTED_VALUE'})
const PRO=R.data.valueRanges[0].values||[]
const H=PRO[0]
const iTotal=H.findIndex(h=>/^total$/i.test(txt(h)))
console.log('col Total =',iTotal, H[iTotal],'| col7=',H[7])
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
let filas=[]
PRO.slice(1).forEach((r,i)=>{const f=fecha(r[3]); if(!f||f.getFullYear()!==2026)return
  const ag=txt(r[4]), cli=txt(r[5])
  if(!/mani\s*king|infinity/i.test(ag+' '+cli))return
  const peds=PED.map(c=>txt(r[c])).filter(Boolean)
  filas.push({row:i+2,mes:MESES[f.getMonth()],nro:txt(r[1]),ag,cli,proy:txt(r[6]),total:num(r[7]),peds})
})
let t=0; const porMes={}
filas.forEach(x=>{t+=x.total; porMes[x.mes]=(porMes[x.mes]||0)+x.total
  console.log(`${x.mes} #${x.nro.padEnd(6)} ${(x.ag+'/'+x.cli).slice(0,30).padEnd(31)} ${x.proy.slice(0,38).padEnd(39)} ${M(x.total).padStart(13)}  [${x.peds.join(' · ').slice(0,90)}]`)})
console.log('\nTOTAL 2026:',M(t),' proyectos:',filas.length)
console.log('por mes:',Object.entries(porMes).map(([m,v])=>`${m} ${M(v)}`).join(' | '))
