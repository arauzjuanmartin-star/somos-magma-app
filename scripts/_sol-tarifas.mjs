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
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const med=a=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2}
const grupos={}
PRO.slice(1).forEach(r=>{const f=fecha(r[3]); if(!f||f.getFullYear()!==2026)return
  PED.forEach(c=>{const ped=txt(r[c]); if(!ped)return; const pr=num(r[c+1]); if(pr<=1)return
    const k=ped.replace(/[^\wáéíóúñÁÉÍÓÚÑ½ ]/g,'').trim()
    grupos[k]=grupos[k]||[]; grupos[k].push(pr)})})
console.log('SERVICIO'.padEnd(24),'n'.padStart(4),'mediana'.padStart(12),'promedio'.padStart(12))
Object.entries(grupos).sort((a,b)=>b[1].length-a[1].length).slice(0,22).forEach(([k,v])=>
  console.log(k.padEnd(24), String(v.length).padStart(4), M(med(v)).padStart(12), M(v.reduce((a,b)=>a+b,0)/v.length).padStart(12)))
